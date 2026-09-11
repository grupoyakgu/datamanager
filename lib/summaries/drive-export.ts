import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import {
  createOrUpdateDoc,
  deleteFile,
  ensureDomainReaderAccess,
  ensureFolder,
  ensureFolderPath,
  setDocParents,
  uploadFile,
} from '@/lib/google/drive';
import { getAttachmentData } from '@/lib/google/gmail';
import { GoogleAuthError } from '@/lib/google/oauth';

/** Folder names created under the configured Drive root to hold every exported summary. */
const BASE_PATH = ['Data Manager', 'Summaries'];

/** True when a Google API error is the "needs re-consent for a new scope" case. */
export function isScopeError(error: unknown): boolean {
  return error instanceof Error && /insufficient.?permission/i.test(error.message);
}

export interface DriveExportResult {
  docId: string;
  docUrl: string;
}
export interface DriveExportSkipped {
  skipped: 'no_connected_writer' | 'not_found';
}

function docUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit`;
}

function splitExtension(filename: string): { base: string; ext: string } {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return { base: filename, ext: '' };
  return { base: filename.slice(0, dot), ext: filename.slice(dot) };
}

/**
 * The single Google account whose Drive holds every exported summary and
 * attachment, regardless of which mailbox ingested it. Prefers the
 * configured `drive_writer_email`; falls back to any other connected active
 * admin so the app still works if that account is temporarily disconnected.
 */
export async function getDriveWriter(): Promise<{ id: string; email: string } | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const settings = await getSettings();

  const { data: admins } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('role', 'admin')
    .eq('status', 'active')
    .order('created_at');
  const list = (admins ?? []) as { id: string; email: string }[];

  const preferred = list.find((a) => a.email.toLowerCase() === settings.drive_writer_email.toLowerCase());
  const ordered = preferred ? [preferred, ...list.filter((a) => a.id !== preferred.id)] : list;

  for (const admin of ordered) {
    const { data: connection } = await supabaseAdmin
      .from('google_connections')
      .select('status')
      .eq('user_id', admin.id)
      .maybeSingle();
    if (connection?.status === 'connected') return admin;
  }
  return null;
}

/**
 * Export one summary as a Google Doc under Data Manager/Summaries.
 *
 * - No tags, or exactly one tag with a Drive folder: filed under Summaries
 *   (and the single tag's folder too, if any) — unambiguous placement.
 * - Two or more tags: every tag's folder is still created (so it's ready),
 *   but the Doc stays in Summaries only and `needs_folder_review` is set,
 *   so a person decides where it belongs instead of it landing in several
 *   folders on a guess.
 *
 * Any Gmail attachments on the source email are uploaded alongside it (as
 * their native file type, not converted), sharing one random suffix with
 * the Doc's name so the two are visibly correlated in Drive.
 */
export async function exportSummaryToDrive(summaryId: string): Promise<DriveExportResult | DriveExportSkipped> {
  const supabaseAdmin = getSupabaseAdmin();
  const writer = await getDriveWriter();
  if (!writer) return { skipped: 'no_connected_writer' };

  const { data: summary } = await supabaseAdmin
    .from('meeting_summaries')
    .select('id, title, content, meeting_date, meeting_time, drive_doc_id, drive_file_suffix')
    .eq('id', summaryId)
    .maybeSingle();
  if (!summary) return { skipped: 'not_found' };

  const [{ data: tagLinks }, { data: extracted }, { data: attachmentRows }] = await Promise.all([
    supabaseAdmin.from('meeting_summary_tags').select('tags(name)').eq('summary_id', summaryId),
    supabaseAdmin.from('extracted_data').select('participants').eq('summary_id', summaryId).maybeSingle(),
    supabaseAdmin
      .from('summary_attachments')
      .select('id, gmail_message_id, gmail_attachment_id, ingested_by, filename, mime_type, drive_file_id')
      .eq('summary_id', summaryId),
  ]);
  const tagNames = (tagLinks ?? [])
    .map((row) => {
      const tag = row.tags as { name: string } | { name: string }[] | null;
      return Array.isArray(tag) ? tag[0]?.name : tag?.name;
    })
    .filter((name): name is string => !!name);
  const attachments = attachmentRows ?? [];

  try {
    const settings = await getSettings();
    const driveRoot = settings.drive_root_folder_id || 'root';
    const baseFolderId = await ensureFolderPath(writer.id, driveRoot, BASE_PATH);

    // Create every matched tag's folder regardless of ambiguity, so it's
    // ready the moment someone resolves it.
    const tagFolderIds = new Map<string, string>();
    for (const tagName of tagNames) {
      tagFolderIds.set(tagName, await ensureFolder(writer.id, baseFolderId, tagName));
    }

    const needsFolderReview = tagNames.length > 1;
    const parents = needsFolderReview
      ? [baseFolderId]
      : [baseFolderId, ...tagNames.map((name) => tagFolderIds.get(name)).filter((id): id is string => !!id)];

    // One random suffix per summary, generated once and reused on re-export,
    // so the Doc and its attachments stay visibly grouped by name.
    let suffix = summary.drive_file_suffix;
    if (!suffix && attachments.length > 0) suffix = String(Math.floor(1000 + Math.random() * 9000));

    const text = [
      summary.title,
      '',
      summary.meeting_date ? `Date: ${summary.meeting_date}${summary.meeting_time ? ' ' + summary.meeting_time.slice(0, 5) : ''}` : null,
      extracted?.participants?.length ? `Participants: ${(extracted.participants as string[]).join(', ')}` : null,
      tagNames.length > 0 ? `Tags: ${tagNames.join(', ')}` : null,
      '',
      summary.content,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    const docName = suffix ? `${(summary.title || 'Untitled summary').slice(0, 110)} ${suffix}` : (summary.title || 'Untitled summary').slice(0, 120);

    const doc = await createOrUpdateDoc(writer.id, {
      fileId: summary.drive_doc_id ?? undefined,
      name: docName,
      parents,
      text,
    });

    if (summary.drive_doc_id) {
      try {
        await setDocParents(writer.id, doc.id, parents);
      } catch (moveError) {
        console.error('Failed to move Drive doc', doc.id, 'to match current tags:', moveError);
      }
    }

    const domain = writer.email.split('@')[1];
    if (domain) await ensureDomainReaderAccess(writer.id, baseFolderId, domain);

    for (const attachment of attachments) {
      try {
        const attachmentSuffix = suffix ?? String(Math.floor(1000 + Math.random() * 9000));
        suffix = suffix ?? attachmentSuffix;
        const { base, ext } = splitExtension(attachment.filename);
        const name = `${base} ${attachmentSuffix}${ext}`;

        if (attachment.drive_file_id) {
          await setDocParents(writer.id, attachment.drive_file_id, parents);
        } else {
          if (!attachment.ingested_by) throw new Error('No Gmail account on record to fetch this attachment from');
          const data = await getAttachmentData(attachment.ingested_by, attachment.gmail_message_id, attachment.gmail_attachment_id);
          const uploaded = await uploadFile(writer.id, {
            name,
            mimeType: attachment.mime_type,
            parents,
            data,
          });
          await supabaseAdmin
            .from('summary_attachments')
            .update({ drive_file_id: uploaded.id, drive_synced_at: new Date().toISOString(), drive_sync_error: null })
            .eq('id', attachment.id);
        }
      } catch (attachmentError) {
        const message = attachmentError instanceof Error ? attachmentError.message : String(attachmentError);
        console.error('Failed to export attachment', attachment.filename, 'for summary', summaryId, attachmentError);
        await supabaseAdmin.from('summary_attachments').update({ drive_sync_error: message.slice(0, 500) }).eq('id', attachment.id);
      }
    }

    await supabaseAdmin
      .from('meeting_summaries')
      .update({
        drive_doc_id: doc.id,
        drive_synced_at: new Date().toISOString(),
        drive_sync_error: null,
        drive_file_suffix: suffix ?? null,
        needs_folder_review: needsFolderReview,
      })
      .eq('id', summaryId);

    return { docId: doc.id, docUrl: docUrl(doc.id) };
  } catch (error) {
    const message =
      error instanceof GoogleAuthError
        ? `Drive access needed: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    await supabaseAdmin.from('meeting_summaries').update({ drive_sync_error: message.slice(0, 500) }).eq('id', summaryId);
    throw error;
  }
}

/** Remove a summary's exported Doc and any attachment files from Drive. Best-effort. */
export async function deleteSummaryFromDrive(summaryId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const writer = await getDriveWriter();
  if (!writer) return;

  const [{ data: summary }, { data: attachmentRows }] = await Promise.all([
    supabaseAdmin.from('meeting_summaries').select('drive_doc_id').eq('id', summaryId).maybeSingle(),
    supabaseAdmin.from('summary_attachments').select('drive_file_id').eq('summary_id', summaryId),
  ]);

  const fileIds = [summary?.drive_doc_id, ...((attachmentRows ?? []).map((a) => a.drive_file_id))].filter(
    (id): id is string => !!id
  );
  for (const fileId of fileIds) {
    try {
      await deleteFile(writer.id, fileId);
    } catch (error) {
      console.error('Failed to delete Drive file', fileId, 'for summary', summaryId, error);
    }
  }
}

export interface ExportAllResult {
  exported: number;
  failed: number;
  skipped: number;
  writer: string | null;
  reauthRequired: boolean;
  sampleError: string | null;
}

/** Export every summary that doesn't yet have a Drive Doc (or re-sync all with force). */
export async function exportAllSummariesToDrive(force = false): Promise<ExportAllResult> {
  const writer = await getDriveWriter();
  if (!writer) return { exported: 0, failed: 0, skipped: 0, writer: null, reauthRequired: false, sampleError: null };

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin.from('meeting_summaries').select('id');
  if (!force) query = query.is('drive_doc_id', null);
  const { data: summaries } = await query;

  let exported = 0;
  let failed = 0;
  let skipped = 0;
  let reauthRequired = false;
  let sampleError: string | null = null;
  for (const row of summaries ?? []) {
    try {
      const result = await exportSummaryToDrive(row.id);
      if ('skipped' in result) skipped += 1;
      else exported += 1;
    } catch (error) {
      console.error('Drive export failed for', row.id, error);
      failed += 1;
      if (isScopeError(error)) reauthRequired = true;
      if (!sampleError) sampleError = error instanceof Error ? error.message.split('\n')[0] : String(error);
    }
  }
  return { exported, failed, skipped, writer: writer.email, reauthRequired, sampleError };
}

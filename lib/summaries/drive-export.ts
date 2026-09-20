import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import {
  createOrUpdateDoc,
  deleteFile,
  ensureDomainReaderAccess,
  ensureFolder,
  setDocParents,
  uploadFile,
} from '@/lib/google/drive';
import { getAttachmentData } from '@/lib/google/gmail';
import { GoogleAuthError } from '@/lib/google/oauth';

/** True when a Google API error is the "needs re-consent for a new scope" case. */
export function isScopeError(error: unknown): boolean {
  return error instanceof Error && /insufficient.?permission/i.test(error.message);
}

export interface DriveExportResult {
  docId: string;
  docUrl: string;
  folderName: string;
}
export interface DriveExportSkipped {
  skipped: 'no_connected_writer' | 'not_found' | 'no_tag';
}

function docUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit`;
}

export function splitExtension(filename: string): { base: string; ext: string } {
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
 * Export one summary as a Google Doc directly under the configured Drive
 * root, inside a folder named after either:
 *   1. `drive_folder_override`, when the user has manually moved it, or
 *   2. its "sticky" folder tag (`drive_folder_tag_id`) — the primary tag
 *      (highest relevance, per extraction.ts/process.ts's `position`, not
 *      alphabetical) picked the last time the folder was resolved. Adding
 *      more tags alongside it does NOT move the Doc; only once that tag is
 *      deselected does this fall through to the new primary tag among
 *      whatever remains, which then becomes the new sticky tag.
 * The folder is created if it doesn't already exist.
 *
 * A summary with no tags and no manual override has nothing to file
 * under, so nothing is written to Drive; `needs_folder_review` is set so
 * it surfaces on the dashboard until someone tags it, at which point the
 * existing tag-edit flow re-exports it automatically.
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
    .select('id, title, content, meeting_date, meeting_time, drive_doc_id, drive_file_suffix, drive_folder_override, drive_folder_tag_id')
    .eq('id', summaryId)
    .maybeSingle();
  if (!summary) return { skipped: 'not_found' };

  const [{ data: tagLinks }, { data: extracted }, { data: attachmentRows }] = await Promise.all([
    supabaseAdmin.from('meeting_summary_tags').select('tags(id, name), position').eq('summary_id', summaryId),
    supabaseAdmin.from('extracted_data').select('participants').eq('summary_id', summaryId).maybeSingle(),
    supabaseAdmin
      .from('summary_attachments')
      .select('id, gmail_message_id, gmail_attachment_id, ingested_by, filename, mime_type, drive_file_id')
      .eq('summary_id', summaryId),
  ]);
  const tagLinkRows = (tagLinks ?? [])
    .map((row) => {
      const tag = row.tags as { id: string; name: string } | { id: string; name: string }[] | null;
      return { tag: Array.isArray(tag) ? tag[0] : tag, position: row.position as number | null };
    })
    .filter((row): row is { tag: { id: string; name: string }; position: number | null } => !!row.tag);
  const tagRows = tagLinkRows.map((r) => r.tag).sort((a, b) => a.name.localeCompare(b.name));
  const tagNames = tagRows.map((t) => t.name);
  // Most relevant/primary tag first (see extraction.ts/process.ts), not
  // alphabetical — this is what a summary's Drive file gets filed under.
  const primaryTagName = [...tagLinkRows].sort((a, b) => {
    const pa = a.position ?? Number.MAX_SAFE_INTEGER;
    const pb = b.position ?? Number.MAX_SAFE_INTEGER;
    return pa !== pb ? pa - pb : a.tag.name.localeCompare(b.tag.name);
  })[0]?.tag.name;
  const attachments = attachmentRows ?? [];

  // The tag that currently owns the folder stays "sticky" across tag edits
  // (see moveSummaryToDriveFolder/PATCH route); fall back to the primary
  // (highest-relevance) tag if it's stale or was never set.
  const stickyTagName = summary.drive_folder_tag_id
    ? tagRows.find((t) => t.id === summary.drive_folder_tag_id)?.name
    : undefined;
  const folderName = summary.drive_folder_override || stickyTagName || primaryTagName || null;

  if (!folderName) {
    await supabaseAdmin
      .from('meeting_summaries')
      .update({ needs_folder_review: true, drive_folder_tag_id: null })
      .eq('id', summaryId);
    return { skipped: 'no_tag' };
  }

  try {
    const settings = await getSettings();
    const driveRoot = settings.drive_root_folder_id || 'root';
    const targetFolderId = await ensureFolder(writer.id, driveRoot, folderName);
    const parents = [targetFolderId];

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
        console.error('Failed to move Drive doc', doc.id, 'to', folderName, moveError);
      }
    }

    const domain = writer.email.split('@')[1];
    if (domain) await ensureDomainReaderAccess(writer.id, targetFolderId, domain);

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

    // Keep drive_folder_tag_id in sync with whatever tag actually backed this
    // folder, unless a manual override is active (in which case it's unused
    // and left as-is, ready to resume once the override is cleared).
    const resolvedTagId = summary.drive_folder_override ? undefined : (tagRows.find((t) => t.name === folderName)?.id ?? null);

    await supabaseAdmin
      .from('meeting_summaries')
      .update({
        drive_doc_id: doc.id,
        drive_synced_at: new Date().toISOString(),
        drive_sync_error: null,
        drive_file_suffix: suffix ?? null,
        needs_folder_review: false,
        ...(resolvedTagId !== undefined ? { drive_folder_tag_id: resolvedTagId } : {}),
      })
      .eq('id', summaryId);

    return { docId: doc.id, docUrl: docUrl(doc.id), folderName };
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

/**
 * Set (or clear, with `folderName: null`) the manual Drive folder override
 * and re-export so the Doc moves there immediately.
 */
export async function moveSummaryToDriveFolder(
  summaryId: string,
  folderName: string | null
): Promise<DriveExportResult | DriveExportSkipped> {
  const supabaseAdmin = getSupabaseAdmin();
  const trimmed = folderName?.trim() || null;
  const { error } = await supabaseAdmin
    .from('meeting_summaries')
    .update({ drive_folder_override: trimmed })
    .eq('id', summaryId);
  if (error) throw new Error(error.message);
  return exportSummaryToDrive(summaryId);
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

import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { deleteFile, ensureDomainReaderAccess, ensureFolder, setDocParents, uploadFile } from '@/lib/google/drive';
import { GoogleAuthError } from '@/lib/google/oauth';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { generateSummaryDocx } from './docx-export';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
  skipped: 'no_connected_mailbox' | 'not_found';
}

export function splitExtension(filename: string): { base: string; ext: string } {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return { base: filename, ext: '' };
  return { base: filename.slice(0, dot), ext: filename.slice(dot) };
}

/** The literal "summaries" folder in the Archive mailbox's own Drive, sibling to "archive". */
export async function getSummariesDriveRootId(mailboxUserId: string): Promise<string> {
  const settings = await getSettings();
  const anchorId = settings.archive_drive_folder_id || 'root';
  return ensureFolder(mailboxUserId, anchorId, 'summaries');
}

/**
 * The Drive folder a summary should be filed under: a folder named after the
 * ORIGINAL sender's email domain (the team member who forwarded it to
 * repo@grupoyakgu.es doesn't matter — see ingestSummaryMessage), created on
 * first use directly under the "summaries" root, and shared domain-wide for
 * read access the same way Archive folders are.
 */
async function resolveSummaryFolderId(mailboxUserId: string, senderEmail: string | null): Promise<{ id: string; name: string }> {
  const root = await getSummariesDriveRootId(mailboxUserId);
  const domain = senderEmail?.toLowerCase().split('@')[1] || 'unknown';
  const folderId = await ensureFolder(mailboxUserId, root, domain);

  try {
    const { data: mailboxUser } = await getSupabaseAdmin().from('users').select('email').eq('id', mailboxUserId).maybeSingle();
    const mailboxDomain = mailboxUser?.email ? (mailboxUser.email as string).split('@')[1] : null;
    if (mailboxDomain) await ensureDomainReaderAccess(mailboxUserId, folderId, mailboxDomain);
  } catch (shareError) {
    console.error('Failed to grant domain access on summaries folder', folderId, shareError);
  }

  return { id: folderId, name: domain };
}

/**
 * Export a summary as a real .docx file (original content, AI summary and
 * Hebrew translation) into the Archive mailbox's own Drive
 * (repo@grupoyakgu.es), under summaries/<sender's domain> — never any
 * admin's personal Drive.
 */
export async function exportSummaryToDrive(summaryId: string): Promise<DriveExportResult | DriveExportSkipped> {
  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) return { skipped: 'no_connected_mailbox' };

  const supabaseAdmin = getSupabaseAdmin();
  const { data: summary } = await supabaseAdmin
    .from('meeting_summaries')
    .select('id, title, content, meeting_date, meeting_time, ai_summary, hebrew_translation, drive_doc_id, email_from, original_sender_email')
    .eq('id', summaryId)
    .maybeSingle();
  if (!summary) return { skipped: 'not_found' };

  const { data: tagLinks } = await supabaseAdmin.from('meeting_summary_tags').select('tags(id, name)').eq('summary_id', summaryId);
  const tagNames = (tagLinks ?? [])
    .map((row) => {
      const tag = row.tags as { id: string; name: string } | { id: string; name: string }[] | null;
      return Array.isArray(tag) ? tag[0] : tag;
    })
    .filter((t): t is { id: string; name: string } => !!t)
    .map((t) => t.name)
    .sort((a, b) => a.localeCompare(b));

  const { data: extracted } = await supabaseAdmin.from('extracted_data').select('participants').eq('summary_id', summaryId).maybeSingle();
  const senderEmail = (summary.original_sender_email as string | null) || (summary.email_from as string | null);

  try {
    const folder = await resolveSummaryFolderId(mailboxUser.id, senderEmail);
    const buffer = await generateSummaryDocx({
      title: summary.title,
      meetingDate: summary.meeting_date,
      meetingTime: summary.meeting_time ? String(summary.meeting_time).slice(0, 5) : null,
      participants: (extracted?.participants as string[] | undefined) ?? [],
      tags: tagNames,
      content: summary.content,
      aiSummary: summary.ai_summary,
      hebrewTranslation: summary.hebrew_translation,
    });

    const name = `${(summary.title || 'Untitled summary').slice(0, 150)}.docx`;
    const uploaded = await uploadFile(mailboxUser.id, {
      fileId: summary.drive_doc_id ?? undefined,
      name,
      mimeType: DOCX_MIME,
      parents: [folder.id],
      data: buffer,
    });

    if (summary.drive_doc_id) {
      try {
        await setDocParents(mailboxUser.id, uploaded.id, [folder.id]);
      } catch (moveError) {
        console.error('Failed to move summary Drive file', uploaded.id, 'to', folder.name, moveError);
      }
    }

    await supabaseAdmin
      .from('meeting_summaries')
      .update({
        drive_doc_id: uploaded.id,
        drive_folder_name: folder.name,
        drive_synced_at: new Date().toISOString(),
        drive_sync_error: null,
      })
      .eq('id', summaryId);

    return { docId: uploaded.id, docUrl: `https://drive.google.com/file/d/${uploaded.id}/view`, folderName: folder.name };
  } catch (error) {
    const message =
      error instanceof GoogleAuthError ? `Drive access needed: ${error.message}` : error instanceof Error ? error.message : String(error);
    await supabaseAdmin.from('meeting_summaries').update({ drive_sync_error: message.slice(0, 500) }).eq('id', summaryId);
    throw error;
  }
}

/** Remove a summary's exported .docx file from Drive. Best-effort. */
export async function deleteSummaryFromDrive(summaryId: string): Promise<void> {
  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) return;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: summary } = await supabaseAdmin.from('meeting_summaries').select('drive_doc_id').eq('id', summaryId).maybeSingle();
  if (!summary?.drive_doc_id) return;

  try {
    await deleteFile(mailboxUser.id, summary.drive_doc_id);
  } catch (error) {
    console.error('Failed to delete Drive file', summary.drive_doc_id, 'for summary', summaryId, error);
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

/** Export every summary that doesn't yet have a Drive file (or re-sync all with force). */
export async function exportAllSummariesToDrive(force = false): Promise<ExportAllResult> {
  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) return { exported: 0, failed: 0, skipped: 0, writer: null, reauthRequired: false, sampleError: null };

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
  return { exported, failed, skipped, writer: mailboxUser.email, reauthRequired, sampleError };
}

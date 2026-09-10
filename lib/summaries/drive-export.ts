import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { createOrUpdateDoc, ensureDomainReaderAccess, ensureFolder, ensureFolderPath, setDocParents } from '@/lib/google/drive';
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

/**
 * The Google account whose Drive holds the exported summaries: the
 * longest-standing active admin with a connected Google account. Centralising
 * writes under one account keeps every tag folder in one place regardless of
 * which mailbox a summary was ingested from.
 */
export async function getDriveWriter(): Promise<{ id: string; email: string } | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: admins } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('role', 'admin')
    .eq('status', 'active')
    .order('created_at');

  for (const admin of admins ?? []) {
    const { data: connection } = await supabaseAdmin
      .from('google_connections')
      .select('status')
      .eq('user_id', admin.id)
      .maybeSingle();
    if (connection?.status === 'connected') return admin as { id: string; email: string };
  }
  return null;
}

/**
 * Export one summary as a Google Doc under Data Manager/Summaries, filed
 * additionally under a subfolder for each of its tags (a Doc can live in
 * more than one Drive folder at once). Safe to re-run: it updates the same
 * Doc in place rather than duplicating it.
 */
export async function exportSummaryToDrive(summaryId: string): Promise<DriveExportResult | DriveExportSkipped> {
  const supabaseAdmin = getSupabaseAdmin();
  const writer = await getDriveWriter();
  if (!writer) return { skipped: 'no_connected_writer' };

  const { data: summary } = await supabaseAdmin
    .from('meeting_summaries')
    .select('id, title, content, meeting_date, meeting_time, drive_doc_id')
    .eq('id', summaryId)
    .maybeSingle();
  if (!summary) return { skipped: 'not_found' };

  const [{ data: tagLinks }, { data: extracted }] = await Promise.all([
    supabaseAdmin.from('meeting_summary_tags').select('tags(name)').eq('summary_id', summaryId),
    supabaseAdmin.from('extracted_data').select('participants').eq('summary_id', summaryId).maybeSingle(),
  ]);
  const tagNames = (tagLinks ?? [])
    .map((row) => {
      const tag = row.tags as { name: string } | { name: string }[] | null;
      return Array.isArray(tag) ? tag[0]?.name : tag?.name;
    })
    .filter((name): name is string => !!name);

  try {
    const settings = await getSettings();
    const driveRoot = settings.drive_root_folder_id || 'root';
    const baseFolderId = await ensureFolderPath(writer.id, driveRoot, BASE_PATH);
    const parents = [baseFolderId];
    for (const tagName of tagNames) {
      parents.push(await ensureFolder(writer.id, baseFolderId, tagName));
    }

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

    const doc = await createOrUpdateDoc(writer.id, {
      fileId: summary.drive_doc_id ?? undefined,
      name: (summary.title || 'Untitled summary').slice(0, 120),
      parents,
      text,
    });

    if (summary.drive_doc_id) {
      // Existing Doc: the content update above doesn't touch folder placement,
      // so move it explicitly to match the current tag set (e.g. a tag was
      // changed from one folder to another).
      try {
        await setDocParents(writer.id, doc.id, parents);
      } catch (moveError) {
        console.error('Failed to move Drive doc', doc.id, 'to match current tags:', moveError);
      }
    }

    const domain = writer.email.split('@')[1];
    if (domain) await ensureDomainReaderAccess(writer.id, baseFolderId, domain);

    await supabaseAdmin
      .from('meeting_summaries')
      .update({ drive_doc_id: doc.id, drive_synced_at: new Date().toISOString(), drive_sync_error: null })
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

export interface ExportAllResult {
  exported: number;
  failed: number;
  skipped: number;
  writer: string | null;
  /** True if any failure was Google rejecting a permission the account hasn't re-granted yet. */
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

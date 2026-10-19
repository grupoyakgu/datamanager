import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { getMessage, listMessageIds } from '@/lib/google/gmail';
import { GoogleAuthError } from '@/lib/google/oauth';
import { logAudit } from '@/lib/auth';
import { getDefaultFolderId } from '@/lib/summaries/repository';
import { processSummary } from '@/lib/summaries/process';
import { ingestSummaryMessage, type SummarySyncResult } from '@/lib/summaries/sync';
import {
  buildArchiveQuery,
  filterExcludedAttachments,
  getArchiveMailboxUser,
  ingestArchiveMessage,
  retryPendingArchiveDeletions,
  type ArchiveSyncResult,
} from '@/lib/archive/sync';

export type { ArchiveSyncResult } from '@/lib/archive/sync';
export type { SummarySyncResult } from '@/lib/summaries/sync';

/**
 * Scan the shared repo@grupoyakgu.es mailbox once and route every new
 * message to the Archive (has attachments, after the exclude-list filter)
 * or to Summaries (doesn't) — a single list+fetch pass so neither module
 * re-reads the same message over Gmail's API. This is the one place that
 * actually lists and fetches mail from that mailbox; lib/archive/sync.ts and
 * lib/summaries/sync.ts only know how to turn one already-fetched message
 * into their own kind of record.
 */
export async function syncRepoMailbox(): Promise<{ archive: ArchiveSyncResult; summaries: SummarySyncResult }> {
  const supabaseAdmin = getSupabaseAdmin();
  const settings = await getSettings();
  const mailboxUser = await getArchiveMailboxUser();

  if (!mailboxUser) {
    const disconnected = { mailbox: settings.archive_mailbox, connected: false, scanned: 0, created: 0, skipped: 0, failed: 0 };
    return { archive: { ...disconnected }, summaries: { ...disconnected } };
  }

  const archive: ArchiveSyncResult = { mailbox: mailboxUser.email, connected: true, scanned: 0, created: 0, skipped: 0, failed: 0 };
  const summaries: SummarySyncResult = { mailbox: mailboxUser.email, connected: true, scanned: 0, created: 0, skipped: 0, failed: 0 };
  const query = buildArchiveQuery(settings.archive_sync_lookback_days);

  try {
    await retryPendingArchiveDeletions(mailboxUser.id);

    const ids = await listMessageIds(mailboxUser.id, query);
    const [{ data: knownArchive }, { data: knownSummaries }] = await Promise.all([
      supabaseAdmin.from('archived_items').select('gmail_message_id').in('gmail_message_id', ids.length > 0 ? ids : ['-']),
      supabaseAdmin.from('meeting_summaries').select('gmail_message_id').in('gmail_message_id', ids.length > 0 ? ids : ['-']),
    ]);
    const knownIds = new Set([
      ...(knownArchive ?? []).map((k) => k.gmail_message_id as string),
      ...(knownSummaries ?? []).map((k) => k.gmail_message_id as string),
    ]);

    const summaryFolderId = await getDefaultFolderId();

    for (const id of ids) {
      archive.scanned += 1;
      summaries.scanned += 1;
      if (knownIds.has(id)) {
        archive.skipped += 1;
        summaries.skipped += 1;
        continue;
      }
      try {
        const message = await getMessage(mailboxUser.id, id);
        const attachments = filterExcludedAttachments(message.attachments, settings.archive_excluded_extensions);

        if (attachments.length > 0) {
          const archivedItemId = await ingestArchiveMessage(mailboxUser.id, message, settings.archive_excluded_extensions);
          if (!archivedItemId) {
            archive.skipped += 1;
            summaries.skipped += 1;
            continue;
          }
          archive.created += 1;
          await logAudit(mailboxUser.id, 'archive.ingested', 'archived_item', archivedItemId, { gmail_message_id: id });
        } else {
          const summaryId = await ingestSummaryMessage(mailboxUser.id, message, summaryFolderId);
          if (!summaryId) {
            archive.skipped += 1;
            summaries.skipped += 1;
            continue;
          }
          summaries.created += 1;
          await logAudit(mailboxUser.id, 'summary.ingested', 'meeting_summary', summaryId, { gmail_message_id: id });
          try {
            await processSummary(summaryId);
          } catch (processError) {
            console.error('Processing failed for summary', summaryId, processError);
            summaries.failed += 1;
          }
        }
      } catch (messageError) {
        if (messageError instanceof GoogleAuthError) throw messageError;
        console.error('Failed to ingest repo mailbox message', id, messageError);
        archive.failed += 1;
        summaries.failed += 1;
      }
    }

    await supabaseAdmin.from('google_connections').update({ last_sync_at: new Date().toISOString() }).eq('user_id', mailboxUser.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    archive.error = message;
    summaries.error = message;
  }

  await logAudit(mailboxUser.id, 'archive.sync', 'user', mailboxUser.id, { ...archive });
  await logAudit(mailboxUser.id, 'summary.sync', 'user', mailboxUser.id, { ...summaries });
  return { archive, summaries };
}

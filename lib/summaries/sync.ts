import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { buildSummaryQuery, getMessage, listMessageIds, type GmailMessage } from '@/lib/google/gmail';
import { GoogleAuthError } from '@/lib/google/oauth';
import { logAudit } from '@/lib/auth';
import { getDefaultFolderId } from './repository';
import { processSummary } from './process';

export interface SyncResult {
  userId: string;
  scanned: number;
  created: number;
  skipped: number;
  failed: number;
  error?: string;
}

/** True when the subject contains one of the configured keywords (case-insensitive). */
export function isSummarySubject(subject: string, keywords: string[]): boolean {
  const normalized = subject.toLowerCase();
  return keywords.some((k) => k && normalized.includes(k.toLowerCase()));
}

function cleanTitle(subject: string): string {
  return subject.replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').trim() || 'Untitled summary';
}

/** Insert a Gmail message as a summary unless it was already ingested. Returns the new id or null. */
export async function ingestGmailMessage(userId: string, message: GmailMessage, folderId: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();
  if (!message.bodyText.trim()) return null;

  const { data: existing } = await supabaseAdmin
    .from('meeting_summaries')
    .select('id')
    .or(`original_email_id.eq.${JSON.stringify(message.messageIdHeader)},gmail_message_id.eq.${JSON.stringify(message.id)}`)
    .limit(1);
  if (existing && existing.length > 0) return null;

  const { data: inserted, error } = await supabaseAdmin
    .from('meeting_summaries')
    .insert({
      title: cleanTitle(message.subject),
      content: message.bodyText,
      original_email_id: message.messageIdHeader,
      gmail_message_id: message.id,
      email_from: message.from,
      email_subject: message.subject,
      email_received_at: message.date,
      folder_id: folderId,
      created_by: userId,
      source: 'gmail',
      completeness_score: 0,
      missing_data: [],
      processing_status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    // Unique violation means another mailbox delivered the same message concurrently.
    if (error.code === '23505') return null;
    throw new Error(error.message);
  }
  return inserted.id as string;
}

export async function syncUser(userId: string): Promise<SyncResult> {
  const supabaseAdmin = getSupabaseAdmin();
  const result: SyncResult = { userId, scanned: 0, created: 0, skipped: 0, failed: 0 };
  const settings = await getSettings();
  const query = buildSummaryQuery(settings.summary_keywords, settings.sync_lookback_days);

  try {
    const folderId = await getDefaultFolderId();
    const ids = await listMessageIds(userId, query);
    const { data: known } = await supabaseAdmin
      .from('meeting_summaries')
      .select('gmail_message_id')
      .in('gmail_message_id', ids.length > 0 ? ids : ['-']);
    const knownIds = new Set((known ?? []).map((k) => k.gmail_message_id as string));

    for (const id of ids) {
      result.scanned += 1;
      if (knownIds.has(id)) {
        result.skipped += 1;
        continue;
      }
      try {
        const message = await getMessage(userId, id);
        if (!isSummarySubject(message.subject, settings.summary_keywords)) {
          result.skipped += 1;
          continue;
        }
        const summaryId = await ingestGmailMessage(userId, message, folderId);
        if (!summaryId) {
          result.skipped += 1;
          continue;
        }
        result.created += 1;
        await logAudit(userId, 'summary.ingested', 'meeting_summary', summaryId, { gmail_message_id: id });
        try {
          await processSummary(summaryId);
        } catch (processError) {
          console.error('Processing failed for', summaryId, processError);
          result.failed += 1;
        }
      } catch (messageError) {
        if (messageError instanceof GoogleAuthError) throw messageError;
        console.error('Failed to ingest message', id, messageError);
        result.failed += 1;
      }
    }

    const now = new Date().toISOString();
    await supabaseAdmin.from('google_connections').update({ last_sync_at: now, last_error: null }).eq('user_id', userId);
    await supabaseAdmin.from('users').update({ last_gmail_sync: now }).eq('id', userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.error = message;
    await supabaseAdmin.from('google_connections').update({ last_error: message.slice(0, 500) }).eq('user_id', userId);
  }

  await logAudit(userId, 'gmail.sync', 'user', userId, { ...result });
  return result;
}

export async function syncAllConnectedUsers(): Promise<SyncResult[]> {
  const { data: connections } = await getSupabaseAdmin()
    .from('google_connections')
    .select('user_id, users!inner(status)')
    .eq('status', 'connected')
    .not('refresh_token', 'is', null);

  const results: SyncResult[] = [];
  for (const connection of connections ?? []) {
    const user = connection.users as unknown as { status: string } | { status: string }[];
    const status = Array.isArray(user) ? user[0]?.status : user?.status;
    if (status !== 'active') continue;
    results.push(await syncUser(connection.user_id as string));
  }
  return results;
}

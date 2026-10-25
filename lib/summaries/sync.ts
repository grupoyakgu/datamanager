import { getSupabaseAdmin } from '@/lib/supabase';
import { type GmailMessage } from '@/lib/google/gmail';
import { parseAddress, parseForward } from '@/lib/archive/parse-forward';

export interface SummarySyncResult {
  mailbox: string | null;
  connected: boolean;
  scanned: number;
  created: number;
  skipped: number;
  failed: number;
  error?: string;
}

function cleanTitle(subject: string): string {
  return subject.replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').trim() || 'Untitled summary';
}

/**
 * Turn one Gmail message with no attachments, sent or forwarded to the
 * Archive mailbox, into a summary — unless it was already ingested. Mirrors
 * ingestArchiveMessage's forward detection: when the body is a forward, the
 * summary is attributed to the ORIGINAL sender (used for its Drive folder
 * and "received from" display), not whoever forwarded it internally; a
 * direct "send to save" email is attributed to its own sender the same way.
 */
export async function ingestSummaryMessage(
  mailboxUserId: string,
  message: GmailMessage,
  folderId: string
): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();
  if (!message.bodyText.trim()) return null;

  const { data: existing } = await supabaseAdmin
    .from('meeting_summaries')
    .select('id')
    .or(`original_email_id.eq.${JSON.stringify(message.messageIdHeader)},gmail_message_id.eq.${JSON.stringify(message.id)}`)
    .limit(1);
  if (existing && existing.length > 0) return null;

  const parsed = await parseForward(message.bodyText);
  const forwardedBy = parseAddress(message.from);
  const originalSenderName = parsed.isForward ? parsed.originalSenderName : forwardedBy.name;
  const originalSenderEmail = parsed.isForward ? parsed.originalSenderEmail : forwardedBy.email;
  const subject = (parsed.isForward ? parsed.originalSubject : null) || message.subject || 'Untitled';
  // Drop the forwarder's own preamble and the "Forwarded message" marker
  // line, so the stored content starts at the original message's own
  // "From:" header — only when the marker's position was actually found.
  const content = parsed.isForward && parsed.forwardedBody ? parsed.forwardedBody : message.bodyText;

  const { data: inserted, error } = await supabaseAdmin
    .from('meeting_summaries')
    .insert({
      title: cleanTitle(subject),
      content,
      original_email_id: message.messageIdHeader,
      gmail_message_id: message.id,
      email_from: message.from,
      email_subject: message.subject,
      email_received_at: message.date,
      is_forward: parsed.isForward,
      original_sender_name: originalSenderName,
      original_sender_email: originalSenderEmail,
      forwarded_by_name: parsed.isForward ? forwardedBy.name : null,
      forwarded_by_email: parsed.isForward ? forwardedBy.email : null,
      ingested_by: mailboxUserId,
      folder_id: folderId,
      created_by: mailboxUserId,
      source: 'gmail',
      completeness_score: 0,
      missing_data: [],
      processing_status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    // Unique violation means this message was already ingested concurrently.
    if (error.code === '23505') return null;
    throw new Error(error.message);
  }
  return inserted.id as string;
}

import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { getMessage, listMessageIds, trashMessage, type GmailMessage } from '@/lib/google/gmail';
import { GoogleAuthError } from '@/lib/google/oauth';
import { logAudit } from '@/lib/auth';
import { parseAddress, parseForward } from './parse-forward';
import { exportArchiveAttachments } from './drive-export';

export interface ArchiveSyncResult {
  mailbox: string | null;
  connected: boolean;
  scanned: number;
  created: number;
  skipped: number;
  failed: number;
  error?: string;
}

/** Any email not in spam/trash, within the configured lookback window — no subject filter. */
export function buildArchiveQuery(lookbackDays: number): string {
  return `newer_than:${lookbackDays}d -in:spam -in:trash`;
}

/** The connected user whose Gmail is the Archive mailbox, if it's set up and connected. */
export async function getArchiveMailboxUser(): Promise<{ id: string; email: string } | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const settings = await getSettings();
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('email', settings.archive_mailbox.toLowerCase())
    .maybeSingle();
  if (!user) return null;

  const { data: connection } = await supabaseAdmin
    .from('google_connections')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (connection?.status !== 'connected') return null;

  return user as { id: string; email: string };
}

/** True once every attachment of an archived item has a Drive file (or it has none). */
async function allAttachmentsSynced(archivedItemId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from('archive_attachments')
    .select('id')
    .eq('archived_item_id', archivedItemId)
    .is('drive_file_id', null)
    .limit(1);
  return (data ?? []).length === 0;
}

/**
 * Turn one Gmail message into an archived item, unless it was already
 * ingested. Identifies the original sender when the message is a forward
 * (see parse-forward.ts); otherwise the mailbox's own sender is used as-is,
 * so a direct "send to save" email works the same as a forward.
 *
 * Once the item and all its attachments are safely saved (the record exists
 * and every attachment has a Drive file), the source email is moved to
 * Gmail Trash so the mailbox doesn't pile up — "forward to archive" acts as
 * a one-way "save" action. If any attachment still failed to upload, the
 * email is left in place so a later sync can retry it.
 */
export async function ingestArchiveMessage(mailboxUserId: string, message: GmailMessage): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: existing } = await supabaseAdmin.from('archived_items').select('id').eq('gmail_message_id', message.id).limit(1);
  if (existing && existing.length > 0) return null;

  const parsed = await parseForward(message.bodyText);
  const forwardedBy = parseAddress(message.from);

  const originalSenderName = parsed.isForward ? parsed.originalSenderName : forwardedBy.name;
  const originalSenderEmail = parsed.isForward ? parsed.originalSenderEmail : forwardedBy.email;
  const subject = (parsed.isForward ? parsed.originalSubject : null) || message.subject || 'Untitled';
  const title = parsed.forwarderNote?.trim() ? parsed.forwarderNote.trim().slice(0, 200) : subject;

  const { data: inserted, error } = await supabaseAdmin
    .from('archived_items')
    .insert({
      title,
      subject,
      body_text: message.bodyText,
      is_forward: parsed.isForward,
      original_sender_name: originalSenderName,
      original_sender_email: originalSenderEmail,
      forwarded_by_name: parsed.isForward ? forwardedBy.name : null,
      forwarded_by_email: parsed.isForward ? forwardedBy.email : null,
      gmail_message_id: message.id,
      message_id_header: message.messageIdHeader,
      email_received_at: message.date,
      ingested_by: mailboxUserId,
    })
    .select('id')
    .single();

  if (error) {
    // Unique violation means this message was already ingested concurrently.
    if (error.code === '23505') return null;
    throw new Error(error.message);
  }

  const archivedItemId = inserted.id as string;
  let readyToDelete = true;

  if (message.attachments.length > 0) {
    const { error: attachmentError } = await supabaseAdmin.from('archive_attachments').insert(
      message.attachments.map((attachment) => ({
        archived_item_id: archivedItemId,
        gmail_message_id: message.id,
        gmail_attachment_id: attachment.attachmentId,
        filename: attachment.filename,
        mime_type: attachment.mimeType,
        size_bytes: attachment.size,
      }))
    );
    if (attachmentError) {
      console.error('Failed to record attachments for archived item', archivedItemId, attachmentError);
      readyToDelete = false;
    } else {
      try {
        await exportArchiveAttachments(archivedItemId, mailboxUserId);
      } catch (driveError) {
        console.error('Archive attachment export failed for item', archivedItemId, driveError);
      }
      readyToDelete = await allAttachmentsSynced(archivedItemId);
    }
  }

  if (readyToDelete) {
    try {
      await trashMessage(mailboxUserId, message.id);
      await supabaseAdmin.from('archived_items').update({ source_trashed: true }).eq('id', archivedItemId);
    } catch (trashError) {
      console.error('Failed to trash processed archive email', message.id, trashError);
    }
  }

  return archivedItemId;
}

/**
 * Retry trashing the source email for already-archived items that are fully
 * saved but never got moved to Trash — e.g. because the connected account
 * didn't yet have the gmail.modify scope when it was first ingested. Safe to
 * run every sync: a message that's already trashed just stays trashed.
 */
async function retryPendingDeletions(mailboxUserId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: pending } = await supabaseAdmin
    .from('archived_items')
    .select('id, gmail_message_id')
    .eq('ingested_by', mailboxUserId)
    .eq('source_trashed', false);

  for (const item of pending ?? []) {
    if (!(await allAttachmentsSynced(item.id))) continue;
    try {
      await trashMessage(mailboxUserId, item.gmail_message_id);
      await supabaseAdmin.from('archived_items').update({ source_trashed: true }).eq('id', item.id);
    } catch (error) {
      if (error instanceof GoogleAuthError) throw error;
      console.error('Retry: failed to trash archive email', item.gmail_message_id, error);
    }
  }
}

/** Scan the Archive mailbox for new mail and turn each one into an archived item. */
export async function syncArchiveMailbox(): Promise<ArchiveSyncResult> {
  const supabaseAdmin = getSupabaseAdmin();
  const settings = await getSettings();
  const mailboxUser = await getArchiveMailboxUser();
  if (!mailboxUser) {
    return { mailbox: settings.archive_mailbox, connected: false, scanned: 0, created: 0, skipped: 0, failed: 0 };
  }

  const result: ArchiveSyncResult = { mailbox: mailboxUser.email, connected: true, scanned: 0, created: 0, skipped: 0, failed: 0 };
  const query = buildArchiveQuery(settings.archive_sync_lookback_days);

  try {
    await retryPendingDeletions(mailboxUser.id);

    const ids = await listMessageIds(mailboxUser.id, query);
    const { data: known } = await supabaseAdmin
      .from('archived_items')
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
        const message = await getMessage(mailboxUser.id, id);
        const archivedItemId = await ingestArchiveMessage(mailboxUser.id, message);
        if (!archivedItemId) {
          result.skipped += 1;
          continue;
        }
        result.created += 1;
        await logAudit(mailboxUser.id, 'archive.ingested', 'archived_item', archivedItemId, { gmail_message_id: id });
      } catch (messageError) {
        if (messageError instanceof GoogleAuthError) throw messageError;
        console.error('Failed to ingest archive message', id, messageError);
        result.failed += 1;
      }
    }

    await supabaseAdmin
      .from('google_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', mailboxUser.id);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  await logAudit(mailboxUser.id, 'archive.sync', 'user', mailboxUser.id, { ...result });
  return result;
}

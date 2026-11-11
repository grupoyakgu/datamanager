import { getSupabaseAdmin } from '@/lib/supabase';
import { getSettings } from '@/lib/settings';
import { trashMessage, sendEmail, type GmailMessage } from '@/lib/google/gmail';
import { GoogleAuthError } from '@/lib/google/oauth';
import { findOrCreateTagsByName } from '@/lib/summaries/repository';
import { splitExtension } from '@/lib/summaries/drive-export';
import { parseAddress, parseForward, parseInlineTags } from './parse-forward';
import { exportArchiveAttachments } from './drive-export';
import { resolveOrCreateProject } from './projects';
import { createReviewToken } from './review-tokens';
import { extractArchiveMetadata } from '@/lib/ai/archive-metadata';

/** Drop attachments whose extension is on the admin-configured exclude list (e.g. png). */
export function filterExcludedAttachments<T extends { filename: string }>(attachments: T[], excludedExtensions: string[]): T[] {
  const excluded = new Set(excludedExtensions.map((e) => e.toLowerCase().replace(/^\./, '')));
  if (excluded.size === 0) return attachments;
  return attachments.filter((a) => !excluded.has(splitExtension(a.filename).ext.replace(/^\./, '').toLowerCase()));
}

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
 *
 * The sender's own "tags:project_name,a,b" line (see parseInlineTags) names
 * the destination project (first value — mandatory, see below) plus any
 * further values as plain searchable metadata tags (can create brand-new
 * tags via findOrCreateTagsByName). Separately, AI-generated metadata
 * (document type, topic, people/companies, date, keywords) is extracted
 * from the subject/body/sender/filenames and stored apart from those
 * manually-declared tags (archive_ai_metadata) — text-based only, not the
 * attachment file contents themselves. An email with no "tags:" line at all
 * has no project to route by, so it's flagged for review (shared "Temp"
 * folder) and the original sender is emailed a one-time link to assign one
 * themselves, rather than being silently filed anywhere.
 *
 * Attachments whose extension is on the admin-configured exclude list (e.g.
 * png, for inline signature images) are dropped entirely — never saved to
 * Drive or recorded — while the rest of the email is still archived as usual.
 */
export async function ingestArchiveMessage(
  mailboxUserId: string,
  message: GmailMessage,
  excludedExtensions: string[]
): Promise<string | null> {
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

  // The first "tags:" value names the project (mandatory — its absence is
  // flagged below, not silently ignored); any further values are plain
  // searchable metadata tags, same mechanism as before.
  const allTagNames = parseInlineTags(message.bodyText);
  const projectName = allTagNames[0] ?? null;
  const metadataTagNames = allTagNames.slice(1);

  try {
    if (metadataTagNames.length > 0) {
      const tagIds = (await findOrCreateTagsByName(metadataTagNames)).map((t) => t.id);
      if (tagIds.length > 0) {
        await supabaseAdmin
          .from('archive_item_tags')
          .insert(tagIds.map((tagId) => ({ archived_item_id: archivedItemId, tag_id: tagId })));
      }
    }
  } catch (tagError) {
    console.error('Tag parsing failed for archived item', archivedItemId, tagError);
  }

  if (projectName) {
    try {
      const project = await resolveOrCreateProject(mailboxUserId, projectName);
      await supabaseAdmin.from('archived_items').update({ project_id: project.id }).eq('id', archivedItemId);
    } catch (projectError) {
      console.error('Failed to resolve project for archived item', archivedItemId, projectName, projectError);
    }
  } else {
    // No "tags:" line at all — flag for manual review (files to a shared
    // "Temp" folder, see drive-export.ts) instead of silently guessing, and
    // ask the original sender to pick the right project themselves via a
    // one-time link, since they likely have no account in this system.
    console.error('No project tag found for archived item', archivedItemId, '— flagged for review');
    if (originalSenderEmail) {
      try {
        const token = await createReviewToken(archivedItemId);
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (baseUrl) {
          await sendEmail(mailboxUserId, {
            to: [originalSenderEmail],
            subject: `Action needed: which project does "${subject}" belong to?`,
            text: [
              `Hi${originalSenderName ? ` ${originalSenderName}` : ''},`,
              '',
              `We received your email "${subject}" but couldn't tell which project it belongs to — it didn't include a "tags:project_name" line.`,
              '',
              'Please let us know using this link:',
              `${baseUrl}/archive-review/${token}`,
              '',
              'Thanks!',
            ].join('\n'),
          });
        }
      } catch (notifyError) {
        console.error('Failed to send missing-project notification for archived item', archivedItemId, notifyError);
      }
    }
  }

  try {
    const ai = await extractArchiveMetadata({
      subject,
      bodyText: message.bodyText,
      senderEmail: originalSenderEmail,
      senderName: originalSenderName,
      filenames: message.attachments.map((a) => a.filename),
    });
    await supabaseAdmin.from('archive_ai_metadata').upsert(
      {
        archived_item_id: archivedItemId,
        document_type: ai.documentType,
        topic: ai.topic,
        people: ai.people,
        companies: ai.companies,
        document_date: ai.documentDate,
        keywords: ai.keywords,
        model: ai.model,
        ai_error: ai.aiError,
        raw: ai.raw,
        extracted_at: new Date().toISOString(),
      },
      { onConflict: 'archived_item_id' }
    );
  } catch (aiError) {
    console.error('AI metadata extraction failed for archived item', archivedItemId, aiError);
  }

  const attachments = filterExcludedAttachments(message.attachments, excludedExtensions);

  if (attachments.length > 0) {
    const { error: attachmentError } = await supabaseAdmin.from('archive_attachments').insert(
      attachments.map((attachment) => ({
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
export async function retryPendingArchiveDeletions(mailboxUserId: string): Promise<void> {
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

// The full mailbox scan (listing messages, routing by attachment presence
// between this module and lib/summaries/sync.ts, and the shared "last
// synced" bookkeeping) lives in lib/mailbox-sync.ts, so a message is only
// ever listed and fetched once per sync regardless of which path it takes.

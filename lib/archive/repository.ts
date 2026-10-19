import { getSupabaseAdmin } from '@/lib/supabase';
import type { ArchiveItemView, ArchiveAttachmentSearchResult } from '@/types/database';

export const ARCHIVE_SELECT = `
  id, title, subject, body_text, is_forward,
  original_sender_name, original_sender_email, forwarded_by_name, forwarded_by_email,
  email_received_at, drive_sync_error, created_at,
  archive_attachments ( id, filename, mime_type, drive_file_id ),
  archive_item_tags ( tags ( id, name ) ),
  archive_comments ( id, body, created_at, author:users ( id, name, email ) )
`;

interface RawArchiveItem {
  id: string;
  title: string;
  subject: string;
  body_text: string;
  is_forward: boolean;
  original_sender_name: string | null;
  original_sender_email: string | null;
  forwarded_by_name: string | null;
  forwarded_by_email: string | null;
  email_received_at: string | null;
  drive_sync_error: string | null;
  created_at: string;
  archive_attachments: { id: string; filename: string; mime_type: string; drive_file_id: string | null }[] | null;
  archive_item_tags: { tags: { id: string; name: string } | { id: string; name: string }[] | null }[] | null;
  archive_comments:
    | {
        id: string;
        body: string;
        created_at: string;
        author: { id: string; name: string | null; email: string } | { id: string; name: string | null; email: string }[] | null;
      }[]
    | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function toArchiveItemView(raw: unknown): ArchiveItemView {
  const row = raw as RawArchiveItem;
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    body_text: row.body_text,
    is_forward: row.is_forward,
    original_sender_name: row.original_sender_name,
    original_sender_email: row.original_sender_email,
    forwarded_by_name: row.forwarded_by_name,
    forwarded_by_email: row.forwarded_by_email,
    email_received_at: row.email_received_at,
    drive_sync_error: row.drive_sync_error,
    created_at: row.created_at,
    attachments: (row.archive_attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mime_type,
      driveUrl: a.drive_file_id ? `https://drive.google.com/file/d/${a.drive_file_id}/view` : null,
    })),
    tags: (row.archive_item_tags ?? [])
      .map((t) => one(t.tags))
      .filter((t): t is { id: string; name: string } => !!t)
      .sort((a, b) => a.name.localeCompare(b.name)),
    comments: (row.archive_comments ?? [])
      .map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, author: one(c.author) }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

export async function listArchiveItems(query?: string): Promise<ArchiveItemView[]> {
  const supabaseAdmin = getSupabaseAdmin();
  let builder = supabaseAdmin.from('archived_items').select(ARCHIVE_SELECT);
  if (query?.trim()) {
    const escaped = query.trim().replace(/[%_]/g, '\\$&');
    builder = builder.or(
      `title.ilike.%${escaped}%,subject.ilike.%${escaped}%,original_sender_name.ilike.%${escaped}%,original_sender_email.ilike.%${escaped}%`
    );
  }
  const { data, error } = await builder.order('email_received_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toArchiveItemView);
}

export async function getArchiveItemById(id: string): Promise<ArchiveItemView | null> {
  const { data, error } = await getSupabaseAdmin().from('archived_items').select(ARCHIVE_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toArchiveItemView(data);
}

interface RawArchiveAttachmentSearchRow {
  id: string;
  title: string;
  archive_attachments: { id: string; filename: string; mime_type: string; drive_file_id: string | null }[] | null;
  archive_item_tags: { tags: { id: string; name: string } | { id: string; name: string }[] | null }[] | null;
}

/** Every attachment belonging to an archived item tagged with at least one of the given tags. */
export async function listArchiveAttachmentsByTags(tagIds: string[]): Promise<ArchiveAttachmentSearchResult[]> {
  if (tagIds.length === 0) return [];
  const supabaseAdmin = getSupabaseAdmin();

  const { data: links } = await supabaseAdmin.from('archive_item_tags').select('archived_item_id').in('tag_id', tagIds);
  const itemIds = Array.from(new Set((links ?? []).map((l) => l.archived_item_id as string)));
  if (itemIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('archived_items')
    .select(
      'id, title, archive_attachments ( id, filename, mime_type, drive_file_id ), archive_item_tags ( tags ( id, name ) )'
    )
    .in('id', itemIds)
    .order('email_received_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);

  const results: ArchiveAttachmentSearchResult[] = [];
  for (const row of (data ?? []) as unknown as RawArchiveAttachmentSearchRow[]) {
    const itemTags = (row.archive_item_tags ?? [])
      .map((t) => (Array.isArray(t.tags) ? t.tags[0] ?? null : t.tags))
      .filter((t): t is { id: string; name: string } => !!t)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const attachment of row.archive_attachments ?? []) {
      results.push({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mime_type,
        driveUrl: attachment.drive_file_id ? `https://drive.google.com/file/d/${attachment.drive_file_id}/view` : null,
        itemId: row.id,
        itemTitle: row.title,
        tags: itemTags,
      });
    }
  }
  return results;
}

import { getSupabaseAdmin } from '@/lib/supabase';
import type { ArchiveItemView } from '@/types/database';

export const ARCHIVE_SELECT = `
  id, title, subject, body_text, is_forward,
  original_sender_name, original_sender_email, forwarded_by_name, forwarded_by_email,
  email_received_at, drive_sync_error, created_at,
  archive_attachments ( id, filename, mime_type, drive_file_id )
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

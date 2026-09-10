import { getSupabaseAdmin } from '@/lib/supabase';
import type { SummaryView } from '@/types/database';

export const SUMMARY_SELECT = `
  id, title, content, meeting_date, meeting_time, source, completeness_score, missing_data,
  language, processing_status, processing_error, drive_doc_id, drive_sync_error, created_at, updated_at,
  email_from, email_subject, email_received_at,
  folder:folders ( id, name ),
  meeting_summary_tags ( tags ( id, name ) ),
  extracted_data ( participants, companies, topics, action_items, decisions ),
  created_by_user:users!meeting_summaries_created_by_fkey ( id, name, email )
`;

interface RawSummary {
  id: string;
  title: string;
  content: string;
  meeting_date: string | null;
  meeting_time: string | null;
  source: 'gmail' | 'manual';
  completeness_score: number;
  missing_data: string[] | null;
  language: string | null;
  processing_status: 'pending' | 'processed' | 'failed';
  processing_error: string | null;
  drive_doc_id: string | null;
  drive_sync_error: string | null;
  created_at: string;
  updated_at: string;
  email_from: string | null;
  email_subject: string | null;
  email_received_at: string | null;
  folder: { id: string; name: string } | { id: string; name: string }[] | null;
  meeting_summary_tags: { tags: { id: string; name: string } | null }[] | null;
  extracted_data:
    | { participants: string[]; companies: string[]; topics: string[]; action_items: string[]; decisions: string[] }
    | { participants: string[]; companies: string[]; topics: string[]; action_items: string[]; decisions: string[] }[]
    | null;
  created_by_user: { id: string; name: string | null; email: string } | { id: string; name: string | null; email: string }[] | null;
}

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function toSummaryView(raw: unknown, favoriteIds: Set<string> = new Set()): SummaryView {
  const row = raw as RawSummary;
  const extracted = one(row.extracted_data);
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    meeting_date: row.meeting_date,
    meeting_time: row.meeting_time ? row.meeting_time.slice(0, 5) : null,
    source: row.source,
    completeness_score: row.completeness_score ?? 0,
    missing_data: row.missing_data ?? [],
    language: row.language,
    processing_status: row.processing_status,
    processing_error: row.processing_error,
    drive_doc_url: row.drive_doc_id ? `https://docs.google.com/document/d/${row.drive_doc_id}/edit` : null,
    drive_sync_error: row.drive_sync_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    email_from: row.email_from,
    email_subject: row.email_subject,
    email_received_at: row.email_received_at,
    folder: one(row.folder),
    tags: (row.meeting_summary_tags ?? [])
      .map((t) => t.tags)
      .filter((t): t is { id: string; name: string } => !!t)
      .sort((a, b) => a.name.localeCompare(b.name)),
    participants: extracted?.participants ?? [],
    companies: extracted?.companies ?? [],
    topics: extracted?.topics ?? [],
    action_items: extracted?.action_items ?? [],
    decisions: extracted?.decisions ?? [],
    created_by: one(row.created_by_user),
    is_favorite: favoriteIds.has(row.id),
  };
}

export async function getFavoriteIds(userId: string): Promise<Set<string>> {
  const { data } = await getSupabaseAdmin().from('favorites').select('summary_id').eq('user_id', userId);
  return new Set((data ?? []).map((f) => f.summary_id as string));
}

export async function getSummaryById(id: string, userId: string): Promise<SummaryView | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('meeting_summaries')
    .select(SUMMARY_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toSummaryView(data, await getFavoriteIds(userId));
}

export async function getActiveTags() {
  const { data } = await getSupabaseAdmin()
    .from('tags')
    .select('id, name, aliases')
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as { id: string; name: string; aliases: string[] }[];
}

export async function getDefaultFolderId(): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: def } = await supabaseAdmin.from('folders').select('id').eq('is_default', true).maybeSingle();
  if (def) return def.id as string;
  const { data: first } = await supabaseAdmin.from('folders').select('id').order('order').limit(1).maybeSingle();
  if (first) return first.id as string;
  const { data: created, error } = await supabaseAdmin
    .from('folders')
    .insert({ name: 'General', is_default: true, order: 0 })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

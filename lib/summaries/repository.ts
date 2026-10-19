import { getSupabaseAdmin } from '@/lib/supabase';
import type { SummaryView } from '@/types/database';

export const SUMMARY_SELECT = `
  id, title, content, meeting_date, meeting_time, source, completeness_score, missing_data,
  language, processing_status, processing_error, drive_doc_id, drive_sync_error, drive_folder_name,
  ai_summary, hebrew_translation,
  created_at, updated_at,
  email_from, email_subject, email_received_at,
  is_forward, original_sender_name, original_sender_email,
  folder:folders ( id, name ),
  meeting_summary_tags ( tags ( id, name ), position ),
  extracted_data ( participants, companies, topics, action_items, decisions, model, ai_error ),
  created_by_user:users!meeting_summaries_created_by_fkey ( id, name, email ),
  summary_attachments ( id, filename, drive_file_id )
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
  drive_folder_name: string | null;
  ai_summary: string | null;
  hebrew_translation: string | null;
  created_at: string;
  updated_at: string;
  email_from: string | null;
  email_subject: string | null;
  email_received_at: string | null;
  is_forward: boolean;
  original_sender_name: string | null;
  original_sender_email: string | null;
  folder: { id: string; name: string } | { id: string; name: string }[] | null;
  meeting_summary_tags: { tags: { id: string; name: string } | null; position: number | null }[] | null;
  extracted_data:
    | { participants: string[]; companies: string[]; topics: string[]; action_items: string[]; decisions: string[]; model: string | null; ai_error: string | null }
    | { participants: string[]; companies: string[]; topics: string[]; action_items: string[]; decisions: string[]; model: string | null; ai_error: string | null }[]
    | null;
  created_by_user: { id: string; name: string | null; email: string } | { id: string; name: string | null; email: string }[] | null;
  summary_attachments: { id: string; filename: string; drive_file_id: string | null }[] | null;
}

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function toSummaryView(raw: unknown, favoriteIds: Set<string> = new Set()): SummaryView {
  const row = raw as RawSummary;
  const extracted = one(row.extracted_data);
  const tags = (row.meeting_summary_tags ?? [])
    .filter((t): t is { tags: { id: string; name: string }; position: number | null } => !!t.tags)
    .map((t) => t.tags)
    .sort((a, b) => a.name.localeCompare(b.name));
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
    drive_doc_url: row.drive_doc_id ? `https://drive.google.com/file/d/${row.drive_doc_id}/view` : null,
    drive_sync_error: row.drive_sync_error,
    drive_folder_name: row.drive_folder_name,
    ai_summary: row.ai_summary,
    hebrew_translation: row.hebrew_translation,
    ai_extraction_error: extracted?.model === 'heuristic' ? (extracted?.ai_error ?? null) : null,
    attachments: (row.summary_attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      driveUrl: a.drive_file_id ? `https://drive.google.com/file/d/${a.drive_file_id}/view` : null,
    })),
    created_at: row.created_at,
    updated_at: row.updated_at,
    email_from: row.email_from,
    email_subject: row.email_subject,
    email_received_at: row.email_received_at,
    is_forward: row.is_forward,
    original_sender_name: row.original_sender_name,
    original_sender_email: row.original_sender_email,
    folder: one(row.folder),
    tags,
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

/**
 * Look up each name against the shared `tags` table (case-insensitively) and
 * create any that don't exist yet. Unlike detectContentTags (AI, never
 * invents tags), this is for sender-declared tags that are meant to be
 * free-form — e.g. the Archive module's "tags:a, b" email syntax.
 */
export async function findOrCreateTagsByName(names: string[]): Promise<{ id: string; name: string }[]> {
  const requested = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (requested.length === 0) return [];

  const supabaseAdmin = getSupabaseAdmin();
  const { data: all } = await supabaseAdmin.from('tags').select('id, name');
  const byLowerName = new Map((all ?? []).map((t) => [(t.name as string).toLowerCase(), t as { id: string; name: string }]));

  const result: { id: string; name: string }[] = [];
  const toCreate: string[] = [];
  for (const name of requested) {
    const existing = byLowerName.get(name.toLowerCase());
    if (existing) result.push(existing);
    else toCreate.push(name);
  }

  if (toCreate.length > 0) {
    // ON CONFLICT DO NOTHING so a race with a concurrent sync never errors;
    // re-select afterwards since skipped (conflicting) rows aren't returned.
    await supabaseAdmin.from('tags').upsert(
      toCreate.map((name) => ({ name, is_active: true })),
      { onConflict: 'name', ignoreDuplicates: true }
    );
    const { data: createdOrExisting } = await supabaseAdmin.from('tags').select('id, name').in('name', toCreate);
    result.push(...((createdOrExisting ?? []) as { id: string; name: string }[]));
  }

  return result;
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

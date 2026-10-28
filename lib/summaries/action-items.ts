import { getSupabaseAdmin } from '@/lib/supabase';
import type { ActionItemStatus, ActionItemListEntry } from '@/types/database';

export type { ActionItemStatus } from '@/types/database';

/**
 * Add any action-item texts not already tracked for this summary — never
 * deletes or rewrites existing rows, so a status a user has set is never
 * lost just because a reprocess slightly reworded the AI's extraction.
 * Dedup is by exact text match (trimmed, case-insensitive) within the
 * summary. New rows start as 'open'.
 */
export async function syncActionItems(summaryId: string, texts: string[]): Promise<void> {
  const cleaned = Array.from(new Set(texts.map((t) => t.trim()).filter(Boolean)));
  if (cleaned.length === 0) return;

  const supabaseAdmin = getSupabaseAdmin();
  const { data: existing } = await supabaseAdmin.from('action_items').select('text').eq('summary_id', summaryId);
  const existingTexts = new Set((existing ?? []).map((r) => (r.text as string).trim().toLowerCase()));

  const toInsert = cleaned.filter((text) => !existingTexts.has(text.toLowerCase()));
  if (toInsert.length === 0) return;

  const { error } = await supabaseAdmin
    .from('action_items')
    .insert(toInsert.map((text) => ({ summary_id: summaryId, text, status: 'open' as const })));
  if (error) throw new Error(error.message);
}

export interface ListActionItemsFilters {
  statuses?: ActionItemStatus[];
}

/**
 * All action items matching the given statuses (default: open + in_process),
 * most recent first — "most recent" meaning the ORIGINAL email's date
 * (summary.email_received_at), not when the row happened to be synced into
 * this table, which can lag behind by however long the mailbox sync took to
 * pick the email up.
 */
export async function listActionItems(filters: ListActionItemsFilters = {}): Promise<ActionItemListEntry[]> {
  const statuses = filters.statuses ?? ['open', 'in_process'];
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('action_items')
    .select('id, text, status, created_at, updated_at, summary:meeting_summaries ( id, title, email_received_at )')
    .in('status', statuses);
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((row) => {
    const summary = row.summary as
      | { id: string; title: string; email_received_at: string | null }
      | { id: string; title: string; email_received_at: string | null }[]
      | null;
    return {
      id: row.id as string,
      text: row.text as string,
      status: row.status as ActionItemStatus,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      summary: Array.isArray(summary) ? (summary[0] ?? null) : summary,
    };
  });

  return items.sort((a, b) => {
    const dateA = a.summary?.email_received_at ?? a.created_at;
    const dateB = b.summary?.email_received_at ?? b.created_at;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
}

export async function updateActionItemStatus(id: string, status: ActionItemStatus): Promise<void> {
  const { error } = await getSupabaseAdmin().from('action_items').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

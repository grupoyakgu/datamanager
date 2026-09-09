import { getSupabaseAdmin } from './supabase';
import { embedText } from './ai/embeddings';
import { isAiConfigured } from './ai/openai';
import { parseNaturalQuery, type ParsedQuery } from './ai/query-parser';
import { getFavoriteIds, SUMMARY_SELECT, toSummaryView } from './summaries/repository';
import type { SummaryView } from '@/types/database';

export interface SearchFilters {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  folderId?: string;
  tagIds?: string[];
  participant?: string;
  favoritesOf?: string;
  createdBy?: string;
  incompleteOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  results: SummaryView[];
  total: number;
  mode: 'filter' | 'text' | 'semantic';
  interpreted?: ParsedQuery;
}

function tsQuery(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(' & ');
}

async function loadViews(ids: string[], userId: string): Promise<SummaryView[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabaseAdmin().from('meeting_summaries').select(SUMMARY_SELECT).in('id', ids);
  if (error) throw new Error(error.message);
  const favorites = await getFavoriteIds(userId);
  const byId = new Map((data ?? []).map((row) => [(row as { id: string }).id, toSummaryView(row, favorites)]));
  return ids.map((id) => byId.get(id)).filter((v): v is SummaryView => !!v);
}

/** Structured + full-text search over summaries. */
export async function searchSummaries(filters: SearchFilters, userId: string): Promise<SearchResponse> {
  const supabaseAdmin = getSupabaseAdmin();
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  let restrictIds: string[] | null = null;
  if (filters.tagIds && filters.tagIds.length > 0) {
    const { data } = await supabaseAdmin.from('meeting_summary_tags').select('summary_id').in('tag_id', filters.tagIds);
    restrictIds = Array.from(new Set((data ?? []).map((r) => r.summary_id as string)));
  }
  if (filters.participant) {
    const { data } = await supabaseAdmin
      .from('extracted_data')
      .select('summary_id, participants')
      .filter('participants', 'cs', `{${JSON.stringify(filters.participant)}}`);
    const exact = new Set((data ?? []).map((r) => r.summary_id as string));
    // Fallback to partial match when the exact array-contains finds nothing.
    let ids = Array.from(exact);
    if (ids.length === 0) {
      const { data: all } = await supabaseAdmin.from('extracted_data').select('summary_id, participants');
      const needle = filters.participant.toLowerCase();
      ids = (all ?? [])
        .filter((r) => (r.participants as string[]).some((p) => p.toLowerCase().includes(needle)))
        .map((r) => r.summary_id as string);
    }
    restrictIds = restrictIds ? restrictIds.filter((id) => ids.includes(id)) : ids;
  }
  if (filters.favoritesOf) {
    const { data } = await supabaseAdmin.from('favorites').select('summary_id').eq('user_id', filters.favoritesOf);
    const ids = (data ?? []).map((r) => r.summary_id as string);
    restrictIds = restrictIds ? restrictIds.filter((id) => ids.includes(id)) : ids;
  }
  if (restrictIds && restrictIds.length === 0) {
    return { results: [], total: 0, mode: filters.query ? 'text' : 'filter' };
  }

  let builder = supabaseAdmin.from('meeting_summaries').select(SUMMARY_SELECT, { count: 'exact' });
  if (restrictIds) builder = builder.in('id', restrictIds);
  if (filters.dateFrom) builder = builder.gte('meeting_date', filters.dateFrom);
  if (filters.dateTo) builder = builder.lte('meeting_date', filters.dateTo);
  if (filters.folderId) builder = builder.eq('folder_id', filters.folderId);
  if (filters.createdBy) builder = builder.eq('created_by', filters.createdBy);
  if (filters.incompleteOnly) builder = builder.lt('completeness_score', 90);
  if (filters.query?.trim()) {
    builder = builder.textSearch('search_vector', tsQuery(filters.query), { config: 'simple' });
  }

  const { data, error, count } = await builder
    .order('meeting_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const favorites = await getFavoriteIds(userId);
  return {
    results: (data ?? []).map((row) => toSummaryView(row, favorites)),
    total: count ?? 0,
    mode: filters.query ? 'text' : 'filter',
  };
}

/** Natural-language question → parsed filters → semantic (or text) search. */
export async function askSummaries(question: string, userId: string, limit = 20): Promise<SearchResponse> {
  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: tags }, { data: folders }] = await Promise.all([
    supabaseAdmin.from('tags').select('id, name').eq('is_active', true),
    supabaseAdmin.from('folders').select('id, name'),
  ]);
  const tagRows = (tags ?? []) as { id: string; name: string }[];
  const folderRows = (folders ?? []) as { id: string; name: string }[];

  const parsed = await parseNaturalQuery(question, {
    tagNames: tagRows.map((t) => t.name),
    folderNames: folderRows.map((f) => f.name),
  });
  const tagIds = parsed.tags.map((name) => tagRows.find((t) => t.name === name)?.id).filter((id): id is string => !!id);
  const folderId = parsed.folder ? folderRows.find((f) => f.name === parsed.folder)?.id : undefined;

  if (isAiConfigured()) {
    const embedding = await embedText(parsed.semanticQuery);
    if (embedding) {
      const { data, error } = await supabaseAdmin.rpc('match_summaries', {
        query_embedding: JSON.stringify(embedding),
        match_count: limit,
        p_date_from: parsed.dateFrom,
        p_date_to: parsed.dateTo,
        p_folder_id: folderId ?? null,
        p_tag_ids: tagIds.length > 0 ? tagIds : null,
        p_participant: parsed.participant,
      });
      if (error) throw new Error(error.message);
      const matches = (data ?? []) as { id: string; similarity: number }[];
      const relevant = matches.filter((m) => m.similarity >= 0.2);
      const views = await loadViews(relevant.map((m) => m.id), userId);
      const withScore = views.map((v) => ({ ...v, similarity: relevant.find((m) => m.id === v.id)?.similarity }));
      return { results: withScore, total: withScore.length, mode: 'semantic', interpreted: parsed };
    }
  }

  const textResult = await searchSummaries(
    {
      query: parsed.semanticQuery,
      dateFrom: parsed.dateFrom ?? undefined,
      dateTo: parsed.dateTo ?? undefined,
      folderId,
      tagIds,
      participant: parsed.participant ?? undefined,
      limit,
    },
    userId
  );
  return { ...textResult, interpreted: parsed };
}

import { getSupabaseAdmin } from './supabase';
import { embedText } from './ai/embeddings';
import { generateJson, isAiConfigured } from './ai/gemini';
import { parseNaturalQuery, type ParsedQuery } from './ai/query-parser';
import { getFavoriteIds, SUMMARY_SELECT, toSummaryView } from './summaries/repository';
import type { SummaryView } from '@/types/database';

export interface SearchFilters {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  folderId?: string;
  /** Name of a Drive folder (= a summary's primary tag, or its manual override). */
  driveFolderName?: string;
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
  /** AI-generated answer in the question's own language, synthesized from the matched summaries. */
  answer?: string | null;
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
  if (filters.driveFolderName) {
    // A summary's Drive folder is its primary tag (drive_folder_tag_id) or,
    // when set, its manual override — not the legacy internal folder_id.
    const { data: tagMatch } = await supabaseAdmin.from('tags').select('id').eq('name', filters.driveFolderName).maybeSingle();
    const [{ data: overrideRows }, tagRowsResult] = await Promise.all([
      supabaseAdmin.from('meeting_summaries').select('id').eq('drive_folder_override', filters.driveFolderName),
      tagMatch ? supabaseAdmin.from('meeting_summaries').select('id').eq('drive_folder_tag_id', tagMatch.id) : Promise.resolve({ data: [] }),
    ]);
    const ids = Array.from(
      new Set([...(overrideRows ?? []).map((r) => r.id as string), ...(tagRowsResult.data ?? []).map((r) => r.id as string)])
    );
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

interface AnswerAndRelevance {
  answer: string | null;
  /** null = couldn't judge (AI unavailable/failed) — caller should not filter on it. */
  relevantIds: string[] | null;
}

/**
 * Ask Gemini to both answer the question and judge which of the candidate
 * summaries are actually relevant. A fixed embedding-similarity cutoff isn't
 * reliable for this: two summaries can score similarly close on cosine
 * distance (same general domain — company meeting notes) while only one
 * genuinely addresses the question, so relevance is judged by the model
 * that reads the actual content rather than a numeric threshold.
 */
async function generateAnswerAndRelevance(question: string, views: SummaryView[]): Promise<AnswerAndRelevance> {
  if (!isAiConfigured() || views.length === 0) return { answer: null, relevantIds: null };

  const candidates = views.slice(0, 10);
  const context = candidates
    .map((v) => {
      const date = v.meeting_date ? ` (${v.meeting_date})` : '';
      // Topics/decisions/action items come from the AI extraction step, which
      // already read the whole summary — include them regardless of where in
      // the raw content they were mentioned, since the content itself below
      // is capped and a relevant detail can otherwise fall past the cutoff.
      const structured = [
        v.topics.length > 0 ? `Topics: ${v.topics.join('; ')}` : null,
        v.decisions.length > 0 ? `Decisions: ${v.decisions.join('; ')}` : null,
        v.action_items.length > 0 ? `Action items: ${v.action_items.join('; ')}` : null,
        v.participants.length > 0 ? `Participants: ${v.participants.join(', ')}` : null,
      ]
        .filter((line): line is string => !!line)
        .join('\n');
      return `Summary id="${v.id}" - "${v.title}"${date}:\n${structured ? `${structured}\n\n` : ''}Full content:\n${v.content.slice(0, 8000)}`;
    })
    .join('\n\n---\n\n');

  const system = `You answer questions about company meeting summaries for Grupo Yakgu, and judge which of the candidate summaries below are actually relevant to the question — some may only be superficially similar (same general topic area, e.g. other meeting notes about the same project) without actually addressing what was asked.
Answer STRICTLY in the same language the user's question is written in (Hebrew, Spanish or English) — regardless of what language the summaries below happen to be written in; translate and synthesize as needed.
Use ONLY the information in the summaries provided below; never invent anything.
Return ONLY a JSON object with keys:
- relevant_ids: array of the exact "id" values (as given above) of summaries that genuinely help answer the question. Omit any candidate that isn't actually relevant. Empty array if none are relevant.
- answer: a concise (2-5 sentences) answer using only the relevant summaries, or — if relevant_ids is empty — a brief note in the question's language that nothing relevant was found.`;

  try {
    const raw = await generateJson(system, `Question: ${question}\n\nCandidate summaries:\n${context}`);
    const validIds = new Set(candidates.map((v) => v.id));
    const relevantIds = Array.isArray(raw.relevant_ids)
      ? (raw.relevant_ids as unknown[]).filter((id): id is string => typeof id === 'string' && validIds.has(id))
      : null;
    const answer = typeof raw.answer === 'string' && raw.answer.trim() ? raw.answer.trim() : null;
    return { answer, relevantIds };
  } catch (error) {
    console.error('Answer/relevance generation failed:', error);
    return { answer: null, relevantIds: null };
  }
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
      console.log('Semantic search scores', {
        question,
        semanticQuery: parsed.semanticQuery,
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        participant: parsed.participant,
        tags: parsed.tags,
        folder: parsed.folder,
        scores: matches.map((m) => Number(m.similarity.toFixed(3))),
      });
      // A fixed absolute cosine cutoff doesn't generalize well across
      // language pairs: a cross-lingual match (e.g. a Hebrew question
      // against Spanish content) can legitimately score lower than a
      // same-language one for a genuinely relevant result, especially with
      // these embeddings truncated+renormalized to 1536 dims. Keep a low
      // floor just to bound the candidate set fetched from the DB; actual
      // relevance is judged below by the model reading the real content.
      const candidates = matches.filter((m) => m.similarity >= 0.05);
      const views = await loadViews(candidates.map((m) => m.id), userId);
      const withScore = views.map((v) => ({ ...v, similarity: candidates.find((m) => m.id === v.id)?.similarity }));
      const { answer, relevantIds } = await generateAnswerAndRelevance(question, withScore);
      const results = relevantIds ? withScore.filter((v) => relevantIds.includes(v.id)) : withScore;
      return { results, total: results.length, mode: 'semantic', interpreted: parsed, answer };
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
  // Text search is already a literal keyword match, so its results are kept
  // as-is; only the answer text is generated here.
  const { answer } = await generateAnswerAndRelevance(question, textResult.results);
  return { ...textResult, interpreted: parsed, answer };
}

import { supabase } from './supabase';

export interface SearchResult {
  id: string;
  title: string;
  summary: string;
  meetingDate: string | null;
  participants: string[];
  completenessScore: number;
}

interface SummaryRow {
  id: string;
  title: string;
  content: string;
  meeting_date: string | null;
  completeness_score: number;
  extracted_data: { participants: string[] }[] | null;
  meeting_summary_tags: { tags: { id: string; name: string } }[] | null;
}

export async function searchSummaries(
  query: string,
  userId: string,
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    tags?: string[];
    folder?: string;
    participant?: string;
  }
): Promise<SearchResult[]> {
  let queryBuilder = supabase
    .from('meeting_summaries')
    .select(
      `
      id,
      title,
      content,
      meeting_date,
      completeness_score,
      extracted_data (
        participants
      ),
      meeting_summary_tags (
        tags (id, name)
      )
    `
    )
    .eq('created_by', userId);

  // Full text search
  if (query && query.trim()) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${query}%,content.ilike.%${query}%`
    );
  }

  // Date filters
  if (filters?.dateFrom) {
    queryBuilder = queryBuilder.gte('meeting_date', filters.dateFrom);
  }
  if (filters?.dateTo) {
    queryBuilder = queryBuilder.lte('meeting_date', filters.dateTo);
  }

  // Folder filter
  if (filters?.folder) {
    queryBuilder = queryBuilder.eq('folder_id', filters.folder);
  }

  const { data, error } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  if (error) {
    console.error('Search error:', error);
    return [];
  }

  const rows = (data ?? []) as unknown as SummaryRow[];

  let results = rows.map((summary) => ({
      id: summary.id,
      title: summary.title,
      summary: summary.content.substring(0, 200),
      meetingDate: summary.meeting_date,
      participants: summary.extracted_data?.[0]?.participants || [],
      completenessScore: summary.completeness_score,
    }));

  // Filter by tags
  if (filters?.tags && filters.tags.length > 0) {
    results = results.filter((result) => {
      const summaryData = rows.find((d) => d.id === result.id);
      const summaryTags = summaryData?.meeting_summary_tags?.map((t) => t.tags.id) ?? [];
      return filters.tags?.some((tag) => summaryTags.includes(tag));
    });
  }

  // Filter by participant
  if (filters?.participant) {
    results = results.filter((result) =>
      result.participants.some((p: string) =>
        p.toLowerCase().includes(filters.participant!.toLowerCase())
      )
    );
  }

  return results;
}

export async function getNaturalLanguageSearchResults(
  query: string,
  userId: string
): Promise<SearchResult[]> {
  // For now, this uses the same search logic
  // In the future, this can be enhanced with semantic search using embeddings
  return searchSummaries(query, userId);
}

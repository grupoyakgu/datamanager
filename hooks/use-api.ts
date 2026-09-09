'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useUser } from './use-user';
import type { Folder, Tag, SummaryView } from '@/types/database';
import type { SearchResponse } from '@/lib/search';

export type FolderWithCount = Folder & { summary_count: number };
export type TagWithCount = Tag & { summary_count: number };

export function useFolders() {
  const { user } = useUser();
  return useQuery({ queryKey: ['folders'], queryFn: () => api.get<FolderWithCount[]>('/api/folders'), enabled: !!user });
}

export function useTags(includeInactive = false) {
  const { user } = useUser();
  return useQuery({
    queryKey: ['tags', includeInactive],
    queryFn: () => api.get<TagWithCount[]>(`/api/tags${includeInactive ? '?all=1' : ''}`),
    enabled: !!user,
  });
}

export interface SummaryFilters {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  folderId?: string;
  tagIds?: string[];
  participant?: string;
  favorites?: boolean;
  incomplete?: boolean;
  limit?: number;
}

export function buildSummaryQuery(filters: SummaryFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.folderId) params.set('folderId', filters.folderId);
  for (const id of filters.tagIds ?? []) params.append('tagId', id);
  if (filters.participant) params.set('participant', filters.participant);
  if (filters.favorites) params.set('favorites', '1');
  if (filters.incomplete) params.set('incomplete', '1');
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return `/api/summaries${qs ? `?${qs}` : ''}`;
}

export function useSummaries(filters: SummaryFilters, enabled = true) {
  const { user } = useUser();
  return useQuery({
    queryKey: ['summaries', filters],
    queryFn: () => api.get<SearchResponse>(buildSummaryQuery(filters)),
    enabled: !!user && enabled,
  });
}

export function useSummary(id: string | null) {
  const { user } = useUser();
  return useQuery({
    queryKey: ['summary', id],
    queryFn: () => api.get<SummaryView>(`/api/summaries/${id}`),
    enabled: !!user && !!id,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      isFavorite ? api.delete<{ is_favorite: boolean }>(`/api/summaries/${id}/favorite`) : api.post<{ is_favorite: boolean }>(`/api/summaries/${id}/favorite`),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['summaries'] });
      queryClient.invalidateQueries({ queryKey: ['summary', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

export function useInvalidateSummaries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['summaries'] });
    queryClient.invalidateQueries({ queryKey: ['summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['people'] });
  };
}

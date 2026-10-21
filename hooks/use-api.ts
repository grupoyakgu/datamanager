'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useUser } from './use-user';
import type { ActionItemListEntry, ActionItemStatus, Folder, Tag, SummaryView } from '@/types/database';
import type { SearchResponse } from '@/lib/search';

export type FolderWithCount = Folder & { summary_count: number };
export type TagWithCount = Tag & { summary_count: number };

export function useFolders() {
  const { user } = useUser();
  return useQuery({ queryKey: ['folders'], queryFn: () => api.get<FolderWithCount[]>('/api/folders'), enabled: !!user });
}

/** Folders that actually exist in Drive directly under the configured root — used for filtering by Drive folder. */
export function useDriveRootFolders() {
  const { user } = useUser();
  return useQuery({
    queryKey: ['drive-root-folders'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/api/drive/root-folders'),
    enabled: !!user,
  });
}

/** Distinct Drive folders any signed-in user can move a summary into. */
export function useSummaryFolderOptions() {
  const { user } = useUser();
  return useQuery({
    queryKey: ['summary-folder-options'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/api/summaries/folder-options'),
    enabled: !!user,
  });
}

export function useMoveSummaryFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, folderName }: { id: string; folderName: string }) =>
      api.post<SummaryView>(`/api/summaries/${id}/move-folder`, { folderName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summaries'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      queryClient.invalidateQueries({ queryKey: ['summary-folder-options'] });
      queryClient.invalidateQueries({ queryKey: ['drive-root-folders'] });
    },
  });
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
  driveFolder?: string;
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
  if (filters.driveFolder) params.set('driveFolder', filters.driveFolder);
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
    queryClient.invalidateQueries({ queryKey: ['action-items'] });
    queryClient.invalidateQueries({ queryKey: ['summary-folder-options'] });
  };
}

/** Action items across all summaries. Default (no statuses) is the server's own default: open + in_process. */
export function useActionItems(statuses?: ActionItemStatus[]) {
  const { user } = useUser();
  return useQuery({
    queryKey: ['action-items', statuses ?? 'default'],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const s of statuses ?? []) params.append('status', s);
      const qs = params.toString();
      return api.get<ActionItemListEntry[]>(`/api/action-items${qs ? `?${qs}` : ''}`);
    },
    enabled: !!user,
  });
}

export function useUpdateActionItemStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ActionItemStatus }) => api.patch(`/api/action-items/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-items'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      queryClient.invalidateQueries({ queryKey: ['summaries'] });
    },
  });
}

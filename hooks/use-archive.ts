'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useUser } from './use-user';
import type { ArchiveItemView, ArchiveAttachmentSearchResult, ArchiveTagOption } from '@/types/database';

export function useArchiveItems(q?: string) {
  const { user } = useUser();
  return useQuery({
    queryKey: ['archive', q ?? ''],
    queryFn: () => api.get<ArchiveItemView[]>(`/api/archive${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    enabled: !!user,
  });
}

export function useArchiveItem(id: string | null) {
  const { user } = useUser();
  return useQuery({
    queryKey: ['archive-item', id],
    queryFn: () => api.get<ArchiveItemView>(`/api/archive/${id}`),
    enabled: !!user && !!id,
  });
}

/** Attachments across all archived items tagged with any of the given tags. */
export function useArchiveAttachmentsByTags(tagIds: string[]) {
  const { user } = useUser();
  return useQuery({
    queryKey: ['archive-attachments', tagIds],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const id of tagIds) params.append('tagId', id);
      return api.get<ArchiveAttachmentSearchResult[]>(`/api/archive/attachments?${params}`);
    },
    enabled: !!user && tagIds.length > 0,
  });
}

/** Tags actually used by at least one archived item, most-recently-used first. */
export function useArchiveTags() {
  const { user } = useUser();
  return useQuery({
    queryKey: ['archive-tags'],
    queryFn: () => api.get<ArchiveTagOption[]>('/api/archive/tags'),
    enabled: !!user,
  });
}

/** Distinct Drive folders any signed-in user can move an archived item into. */
export function useArchiveFolderOptions() {
  const { user } = useUser();
  return useQuery({
    queryKey: ['archive-folder-options'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/api/archive/folder-options'),
    enabled: !!user,
  });
}

export function useMoveArchiveItemFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, folderName }: { id: string; folderName: string }) =>
      api.post<ArchiveItemView>(`/api/archive/${id}/move-folder`, { folderName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive'] });
      queryClient.invalidateQueries({ queryKey: ['archive-item'] });
      queryClient.invalidateQueries({ queryKey: ['archive-folder-options'] });
      queryClient.invalidateQueries({ queryKey: ['drive'] });
    },
  });
}

/** Move a raw Drive file (shown on the Files page) to a different folder — whether or not it's linked to an archived item. */
export function useMoveDriveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, folderName }: { fileId: string; folderName: string }) =>
      api.post<{ id: string; name: string }>('/api/drive/files/move', { fileId, folderName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive'] });
      queryClient.invalidateQueries({ queryKey: ['archive'] });
      queryClient.invalidateQueries({ queryKey: ['archive-item'] });
      queryClient.invalidateQueries({ queryKey: ['archive-attachments'] });
      queryClient.invalidateQueries({ queryKey: ['archive-folder-options'] });
    },
  });
}

export function useInvalidateArchive() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['archive'] });
    queryClient.invalidateQueries({ queryKey: ['archive-item'] });
    queryClient.invalidateQueries({ queryKey: ['archive-attachments'] });
    queryClient.invalidateQueries({ queryKey: ['archive-tags'] });
    queryClient.invalidateQueries({ queryKey: ['archive-folder-options'] });
  };
}

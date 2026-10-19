'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useUser } from './use-user';
import type { ArchiveItemView, ArchiveAttachmentSearchResult } from '@/types/database';

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

export function useInvalidateArchive() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['archive'] });
    queryClient.invalidateQueries({ queryKey: ['archive-item'] });
    queryClient.invalidateQueries({ queryKey: ['archive-attachments'] });
  };
}

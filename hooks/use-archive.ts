'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useUser } from './use-user';
import type { ArchiveItemView } from '@/types/database';

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

export function useInvalidateArchive() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['archive'] });
    queryClient.invalidateQueries({ queryKey: ['archive-item'] });
  };
}

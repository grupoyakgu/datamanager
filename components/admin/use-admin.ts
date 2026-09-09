'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { AppSettings } from '@/lib/settings';
import type { User, FolderRule } from '@/types/database';

export interface AdminUser extends User {
  connection: { status: string; last_sync_at: string | null; last_error: string | null; scopes: string[] } | null;
}

export function useAdminUsers() {
  return useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<AdminUser[]>('/api/admin/users') });
}

export function useSettings() {
  return useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<AppSettings>('/api/admin/settings') });
}

export function useFolderRules() {
  return useQuery({ queryKey: ['folder-rules'], queryFn: () => api.get<FolderRule[]>('/api/admin/folder-rules') });
}

export function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return (...keys: string[]) => {
    for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
  };
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

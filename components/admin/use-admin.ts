'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { AppSettings } from '@/lib/settings';
import type { User, ArchiveProject, ArchiveSenderDomain, SummaryFolderRule } from '@/types/database';

export interface AdminUser extends User {
  connection: { status: string; last_sync_at: string | null; last_error: string | null; scopes: string[] } | null;
}

export function useAdminUsers() {
  return useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<AdminUser[]>('/api/admin/users') });
}

export function useSettings() {
  return useQuery({ queryKey: ['admin-settings'], queryFn: () => api.get<AppSettings>('/api/admin/settings') });
}

export function useArchiveSenderDomains() {
  return useQuery({
    queryKey: ['archive-sender-domains'],
    queryFn: () => api.get<ArchiveSenderDomain[]>('/api/admin/archive-sender-domains'),
  });
}

/** Projects (auto-created from senders' "tags:project_name" line) — listed here just so an admin can rename their display folder name. */
export function useArchiveProjectsAdmin() {
  return useQuery({
    queryKey: ['archive-projects-admin'],
    queryFn: () => api.get<ArchiveProject[]>('/api/admin/archive-projects'),
  });
}

export function useSummaryFolderRules() {
  return useQuery({
    queryKey: ['summary-folder-rules'],
    queryFn: () => api.get<SummaryFolderRule[]>('/api/admin/summary-folder-rules'),
  });
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

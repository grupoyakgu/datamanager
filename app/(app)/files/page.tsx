'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Folder, FileText, ExternalLink, ChevronRight, Search, RefreshCw } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api-client';
import { useUser } from '@/hooks/use-user';
import { useTags } from '@/hooks/use-api';
import { useArchiveAttachmentsByTags, useInvalidateArchive } from '@/hooks/use-archive';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import type { DriveFileWithSource } from '@/app/api/drive/files/route';
import type { ArchiveSyncResult } from '@/lib/archive/sync';

interface DriveResponse {
  folder: DriveFileWithSource | null;
  ancestors: { id: string; name: string }[];
  files: DriveFileWithSource[];
  nextPageToken?: string;
  rootId: string;
  rootName: string | null;
}

function fileTypeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    'application/vnd.google-apps.folder': 'Folder',
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/pdf': 'PDF',
  };
  return map[mimeType] ?? mimeType.split('/').pop()?.toUpperCase() ?? mimeType;
}

export default function FilesPage() {
  const t = useT();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const invalidateArchive = useInvalidateArchive();
  // null = the admin-configured root. The server clamps every request to
  // that root's subtree — a folderId outside it is never served, and the
  // breadcrumb it returns never includes anything above the root either.
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const { data: tags } = useTags();
  const { data: tagResults, isLoading: tagResultsLoading } = useArchiveAttachmentsByTags(selectedTagIds);

  const { data, isLoading, error } = useQuery({
    queryKey: ['drive', folderId ?? 'root', activeSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeSearch) params.set('q', activeSearch);
      else if (folderId) params.set('folderId', folderId);
      return api.get<DriveResponse>(`/api/drive/files?${params}`);
    },
    enabled: !!user && selectedTagIds.length === 0,
  });

  const notConnected = error instanceof ApiError && error.code === 'drive_not_connected';
  const rootInvalid = error instanceof ApiError && error.code === 'drive_root_invalid';

  const crumbs = [{ id: null as string | null, name: data?.rootName ?? t('files.root') }, ...(data?.ancestors ?? [])];

  const toggleTag = (tagId: string) =>
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.post<ArchiveSyncResult>('/api/archive/sync');
      setSyncMessage(
        result.error
          ? result.error
          : !result.connected
            ? t('archive.mailboxNotConnected')
            : `${result.created} ${t('admin.created')}, ${result.skipped} ${t('admin.skipped')}, ${result.failed} ${t('admin.failed')}`
      );
      queryClient.invalidateQueries({ queryKey: ['drive'] });
      invalidateArchive();
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('files.title')}
        subtitle={t('files.subtitle')}
        actions={
          <Button variant="outline" onClick={syncNow} disabled={syncing}>
            <RefreshCw size={16} className={cn('mr-1', syncing && 'animate-spin')} />
            {syncing ? t('dashboard.syncing') : t('archive.syncNow')}
          </Button>
        }
      />
      {syncMessage && <p className="text-sm text-muted-foreground mb-3">{syncMessage}</p>}

      {tags && tags.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <Label>{t('files.filterByTag')}</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    selected ? 'bg-primary text-primary-foreground border-transparent' : 'hover:bg-accent'
                  )}
                >
                  {tag.name}
                </button>
              );
            })}
            {selectedTagIds.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTagIds([])}>
                {t('common.clearFilters')}
              </Button>
            )}
          </div>
        </div>
      )}

      {selectedTagIds.length > 0 ? (
        tagResultsLoading ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : !tagResults || tagResults.length === 0 ? (
          <EmptyState>{t('files.noTaggedFiles')}</EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('common.name')}</TH>
                <TH className="hidden md:table-cell">{t('files.fromItem')}</TH>
                <TH className="hidden sm:table-cell">{t('summaries.tags')}</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {tagResults.map((attachment) => (
                <TR key={attachment.id}>
                  <TD>
                    <span className="inline-flex items-center gap-2">
                      <FileText size={16} className="text-muted-foreground" /> {attachment.filename}
                    </span>
                  </TD>
                  <TD className="hidden md:table-cell text-muted-foreground truncate max-w-[16rem]">{attachment.itemTitle}</TD>
                  <TD className="hidden sm:table-cell text-muted-foreground">{attachment.tags.map((tag) => tag.name).join(', ')}</TD>
                  <TD className="text-right">
                    {attachment.driveUrl ? (
                      <a
                        href={attachment.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        {t('files.openInDrive')} <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('files.notYetSynced')}</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : (
        <>
          <form
            className="flex gap-2 mb-4"
            onSubmit={(e) => {
              e.preventDefault();
              setActiveSearch(search.trim());
            }}
          >
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('files.searchPlaceholder')} className="pl-9" />
            </div>
            <Button type="submit" variant="outline">
              {t('common.search')}
            </Button>
            {activeSearch && (
              <Button type="button" variant="ghost" onClick={() => { setSearch(''); setActiveSearch(''); }}>
                {t('common.clearFilters')}
              </Button>
            )}
          </form>

          {!activeSearch && (
            <nav className="flex items-center flex-wrap gap-1 text-sm mb-4">
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <span key={c.id ?? 'root'} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight size={14} className="text-muted-foreground" />}
                    {isLast ? (
                      <span className="font-medium">{c.name}</span>
                    ) : (
                      <button type="button" className="hover:underline text-muted-foreground" onClick={() => setFolderId(c.id)}>
                        {c.name}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>
          )}

          {notConnected ? (
            <EmptyState>{t('files.notConnected')}</EmptyState>
          ) : rootInvalid ? (
            <EmptyState>{t('files.rootInvalid')}</EmptyState>
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : isLoading ? (
            <p className="text-muted-foreground">{t('common.loading')}</p>
          ) : !data || data.files.length === 0 ? (
            <EmptyState>{t('files.empty')}</EmptyState>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('common.name')}</TH>
                  <TH className="hidden md:table-cell">{t('files.type')}</TH>
                  <TH className="hidden md:table-cell">{t('files.source')}</TH>
                  <TH className="hidden lg:table-cell">{t('files.uploadedBy')}</TH>
                  <TH className="hidden sm:table-cell">{t('files.modified')}</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {data.files.map((file) => (
                  <TR key={file.id}>
                    <TD>
                      {file.isFolder ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 hover:underline text-left"
                          onClick={() => { setActiveSearch(''); setSearch(''); setFolderId(file.id); }}
                        >
                          <Folder size={16} className="text-amber-500" /> {file.name}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <FileText size={16} className="text-muted-foreground" /> {file.name}
                        </span>
                      )}
                    </TD>
                    <TD className="hidden md:table-cell text-muted-foreground">{fileTypeLabel(file.mimeType)}</TD>
                    <TD className="hidden md:table-cell text-muted-foreground">{file.source ?? '—'}</TD>
                    <TD className="hidden lg:table-cell text-muted-foreground">{file.uploadedBy ?? '—'}</TD>
                    <TD className="hidden sm:table-cell text-muted-foreground">{new Date(file.modifiedTime).toLocaleDateString()}</TD>
                    <TD className="text-right">
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          {t('files.openInDrive')} <ExternalLink size={14} />
                        </a>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}

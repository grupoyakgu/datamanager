'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Folder, FileText, ExternalLink, ChevronRight, Search } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api-client';
import { useUser } from '@/hooks/use-user';
import { useT } from '@/lib/i18n/context';
import type { DriveFile } from '@/lib/google/drive';

interface DriveResponse {
  folder: DriveFile | null;
  files: DriveFile[];
  nextPageToken?: string;
  rootId: string;
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
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const current = path[path.length - 1];

  const { data, isLoading, error } = useQuery({
    queryKey: ['drive', current?.id ?? 'root', activeSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeSearch) params.set('q', activeSearch);
      else if (current) params.set('folderId', current.id);
      return api.get<DriveResponse>(`/api/drive/files?${params}`);
    },
    enabled: !!user,
  });

  const notConnected = error instanceof ApiError && error.status === 409;

  return (
    <div>
      <PageHeader title={t('files.title')} subtitle={t('files.subtitle')} />

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
          <button type="button" className="hover:underline" onClick={() => setPath([])}>
            {t('files.root')}
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-muted-foreground" />
              <button type="button" className="hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>
                {p.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {notConnected ? (
        <EmptyState>{t('files.notConnected')}</EmptyState>
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
              <TH className="hidden md:table-cell">{t('files.owner')}</TH>
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
                      onClick={() => { setActiveSearch(''); setSearch(''); setPath([...path, { id: file.id, name: file.name }]); }}
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
                <TD className="hidden md:table-cell text-muted-foreground">{file.owners?.[0]?.displayName ?? '—'}</TD>
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
    </div>
  );
}

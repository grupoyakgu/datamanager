'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Folder, FileText, ExternalLink, ChevronRight, RefreshCw, X, Trash2, Mail, Upload, Tag as TagIcon } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { SearchBar } from '@/components/summaries/search-bar';
import { MoveToFolder } from '@/components/shared/move-to-folder';
import { UploadProgressPanel, type UploadTask } from '@/components/files/upload-progress-panel';
import { ArchiveDetailPanel } from '@/components/archive/archive-detail-panel';
import { api, ApiError } from '@/lib/api-client';
import { uploadFileToFolder } from '@/lib/drive-upload-client';
import { useUser } from '@/hooks/use-user';
import {
  useArchiveAttachmentsByTags,
  useArchiveFolderOptions,
  useArchiveTags,
  useInvalidateArchive,
  useMoveArchiveItemFolder,
  useMoveDriveFile,
} from '@/hooks/use-archive';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import type { DriveFileWithSource } from '@/app/api/drive/files/route';
import type { ArchiveSyncResult, SummarySyncResult } from '@/lib/mailbox-sync';
import type { ArchiveAttachmentSearchResult } from '@/types/database';
import type { ParsedArchiveQuery } from '@/lib/ai/archive-query-parser';

interface DriveResponse {
  folder: DriveFileWithSource | null;
  ancestors: { id: string; name: string }[];
  files: DriveFileWithSource[];
  nextPageToken?: string;
  rootId: string;
  rootName: string | null;
}

const MIME_TYPE_LABELS: Record<string, string> = {
  'application/vnd.google-apps.folder': 'Folder',
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/pdf': 'PDF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'text/plain': 'Text',
  'text/csv': 'CSV',
  'application/zip': 'ZIP',
  'image/jpeg': 'Image',
  'image/png': 'Image',
  'image/gif': 'Image',
};

/** A short, friendly type label — the file's own extension (e.g. "DOCX") beats dumping the raw MIME subtype. */
function fileTypeLabel(file: { mimeType: string; name: string }): string {
  const mapped = MIME_TYPE_LABELS[file.mimeType];
  if (mapped) return mapped;
  const dot = file.name.lastIndexOf('.');
  if (dot > 0 && dot < file.name.length - 1) return file.name.slice(dot + 1).toUpperCase();
  return file.mimeType.split('/').pop()?.toUpperCase() ?? file.mimeType;
}

/**
 * Where the "open in Drive" icon should point. A file's own name already
 * opens the file itself (see the Name column), so this points at its
 * containing folder instead — showing the file in its Drive location,
 * which is what people actually want from an "open in Drive" action on a
 * row that's already open in our own browser. A folder row has no
 * separate "location" to show — it already points at itself.
 */
function driveLocationLink(file: DriveFileWithSource): string | null {
  if (file.isFolder) return file.webViewLink ?? null;
  const parentId = file.parents?.[0];
  return parentId ? `https://drive.google.com/drive/folders/${parentId}` : (file.webViewLink ?? null);
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
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState('');
  // Tags the AI found related in meaning to tagQuery (synonyms, translations,
  // associated concepts) — not substring matches, which tagSearchResults
  // already covers client-side. Debounced via a plain timer ref (rather
  // than a useEffect keyed on tagQuery) so typing doesn't fire a request
  // per keystroke.
  const [aiTagSuggestions, setAiTagSuggestions] = useState<{ id: string; name: string }[]>([]);
  const aiTagSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [askResult, setAskResult] = useState<{ results: ArchiveAttachmentSearchResult[]; interpreted: ParsedArchiveQuery } | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [searchNonce, setSearchNonce] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // itemId drives what the side panel fetches/displays; fileId drives which
  // single row is highlighted. Kept as one object set in one call (instead
  // of two separate useState calls each set individually) so the two can
  // never briefly disagree — several files (an email's several attachments)
  // can share one archived item, so highlighting by item id alone would
  // light up every row in that group no matter which one was clicked.
  const [selected, setSelected] = useState<{ itemId: string; fileId: string } | null>(null);

  // The panel shows one specific file's data — navigating to a different
  // folder means that file is no longer even in view, so keeping the panel
  // open would show stale, out-of-context data next to an unrelated table.
  // Called from both ways folderId changes (breadcrumb and opening a
  // folder) instead of a useEffect keyed on it, per React's own guidance
  // against calling setState from inside an effect for state deriving from
  // a prop/state change that already has an event to hook into.
  const navigateToFolder = (id: string | null) => {
    setFolderId(id);
    setSelected(null);
  };

  const clearAskResult = () => {
    setAskResult(null);
    setAskError(null);
    setSearchNonce((n) => n + 1);
  };

  const { data: archiveTags } = useArchiveTags();
  const { data: folderOptions } = useArchiveFolderOptions();
  const moveArchiveItem = useMoveArchiveItemFolder();
  const moveDriveFile = useMoveDriveFile();
  const { data: tagResults, isLoading: tagResultsLoading } = useArchiveAttachmentsByTags(selectedTagIds);
  const showResults = selectedTagIds.length > 0 || !!askResult;
  const activeResults = selectedTagIds.length > 0 ? tagResults : askResult?.results;
  const resultsLoading = selectedTagIds.length > 0 ? tagResultsLoading : asking;

  const selectedTags = useMemo(() => (archiveTags ?? []).filter((t) => selectedTagIds.includes(t.id)), [archiveTags, selectedTagIds]);
  const mostRecentUnselected = (archiveTags ?? []).find((t) => !selectedTagIds.includes(t.id));
  const tagSearchResults = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return [];
    return (archiveTags ?? []).filter((t) => !selectedTagIds.includes(t.id) && t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [archiveTags, selectedTagIds, tagQuery]);
  const aiOnlySuggestions = useMemo(() => {
    const substringMatchIds = new Set(tagSearchResults.map((t) => t.id));
    return aiTagSuggestions.filter((t) => !substringMatchIds.has(t.id) && !selectedTagIds.includes(t.id));
  }, [aiTagSuggestions, tagSearchResults, selectedTagIds]);

  const onTagQueryChange = (value: string) => {
    setTagQuery(value);
    if (aiTagSearchTimer.current) clearTimeout(aiTagSearchTimer.current);
    const q = value.trim();
    if (!q) {
      setAiTagSuggestions([]);
      return;
    }
    aiTagSearchTimer.current = setTimeout(async () => {
      try {
        const result = await api.post<{ tags: { id: string; name: string }[] }>('/api/archive/tags/similar', { query: q });
        setAiTagSuggestions(result.tags);
      } catch {
        setAiTagSuggestions([]);
      }
    }, 500);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['drive', folderId ?? 'root'],
    queryFn: () => {
      const params = new URLSearchParams();
      if (folderId) params.set('folderId', folderId);
      return api.get<DriveResponse>(`/api/drive/files?${params}`);
    },
    enabled: !!user && !showResults,
  });

  const notConnected = error instanceof ApiError && error.code === 'drive_not_connected';
  const rootInvalid = error instanceof ApiError && error.code === 'drive_root_invalid';

  const crumbs = [{ id: null as string | null, name: data?.rootName ?? t('files.root') }, ...(data?.ancestors ?? [])];

  const addTag = (tagId: string) => {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev : [...prev, tagId]));
    setTagQuery('');
    setAiTagSuggestions([]);
    setAskResult(null);
  };
  const removeTag = (tagId: string) => setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));

  const ask = async (question: string) => {
    setAsking(true);
    setAskError(null);
    try {
      const result = await api.post<{ results: ArchiveAttachmentSearchResult[]; interpreted: ParsedArchiveQuery }>('/api/archive/ask', {
        question,
      });
      setAskResult(result);
      setSelectedTagIds([]);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAsking(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.post<{ archive: ArchiveSyncResult; summaries: SummarySyncResult }>('/api/archive/sync');
      setSyncMessage(
        result.archive.error
          ? result.archive.error
          : !result.archive.connected
            ? t('archive.mailboxNotConnected')
            : `${result.archive.created} ${t('nav.archive')}, ${result.summaries.created} ${t('nav.summaries')}, ${result.archive.skipped + result.summaries.skipped} ${t('admin.skipped')}, ${result.archive.failed + result.summaries.failed} ${t('admin.failed')}`
      );
      queryClient.invalidateQueries({ queryKey: ['drive'] });
      queryClient.invalidateQueries({ queryKey: ['summaries'] });
      invalidateArchive();
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSyncing(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (showResults) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;
    const destFolderId = folderId ?? data?.rootId;
    if (!destFolderId) return;

    const tasks: UploadTask[] = droppedFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      progress: 0,
      status: 'uploading',
    }));
    setUploadTasks((prev) => [...prev, ...tasks]);

    const results = await Promise.allSettled(
      droppedFiles.map((file, i) =>
        uploadFileToFolder(destFolderId, file, (pct) => {
          setUploadTasks((prev) => prev.map((task) => (task.id === tasks[i].id ? { ...task, progress: pct } : task)));
        })
      )
    );

    const successes: { taskId: string; driveFileId: string }[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        successes.push({ taskId: tasks[i].id, driveFileId: result.value.id });
        setUploadTasks((prev) => prev.map((task) => (task.id === tasks[i].id ? { ...task, status: 'done', progress: 100 } : task)));
      } else {
        const message = result.reason instanceof Error ? result.reason.message : t('common.error');
        setUploadTasks((prev) => prev.map((task) => (task.id === tasks[i].id ? { ...task, status: 'error', error: message } : task)));
      }
    });

    if (successes.length > 0) {
      try {
        await api.post('/api/archive/upload/finalize', {
          folderId: destFolderId,
          driveFileIds: successes.map((s) => s.driveFileId),
        });
        queryClient.invalidateQueries({ queryKey: ['drive'] });
        invalidateArchive();
      } catch (err) {
        const message = err instanceof Error ? err.message : t('files.uploadSaveFailed');
        setUploadTasks((prev) =>
          prev.map((task) => (successes.some((s) => s.taskId === task.id) ? { ...task, status: 'error', error: message } : task))
        );
      }
    }
  };

  const handleDeleteFile = async (file: DriveFileWithSource) => {
    if (!confirm(t('files.confirmDeleteFile'))) return;
    setDeleteError(null);
    setDeletingFileId(file.id);
    try {
      if (file.archivedItemId) {
        await api.delete(`/api/archive/${file.archivedItemId}`);
        invalidateArchive();
      } else {
        await api.delete(`/api/drive/files/${file.id}`);
      }
      queryClient.invalidateQueries({ queryKey: ['drive'] });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeletingFileId(null);
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
      {deleteError && <p className="text-sm text-destructive mb-3">{deleteError}</p>}

      {archiveTags && archiveTags.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <Label>{t('files.filterByTag')}</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => removeTag(tag.id)}
                className="rounded-full border px-2.5 py-1 text-xs bg-primary text-primary-foreground border-transparent inline-flex items-center gap-1"
              >
                {tag.name} <X size={12} />
              </button>
            ))}
            {mostRecentUnselected && (
              <button
                type="button"
                onClick={() => addTag(mostRecentUnselected.id)}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
                title={t('files.mostRecentTag')}
              >
                + {mostRecentUnselected.name}
              </button>
            )}
            {selectedTagIds.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTagIds([])}>
                {t('common.clearFilters')}
              </Button>
            )}
          </div>
          <div className="relative max-w-xs">
            <Input
              value={tagQuery}
              onChange={(e) => onTagQueryChange(e.target.value)}
              placeholder={t('files.searchTagsPlaceholder')}
              className="h-8 text-xs"
            />
            {(tagSearchResults.length > 0 || aiOnlySuggestions.length > 0) && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-md max-h-56 overflow-auto">
                {tagSearchResults.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => addTag(tag.id)}
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    {tag.name}
                  </button>
                ))}
                {aiOnlySuggestions.length > 0 && (
                  <>
                    <div className="px-3 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground border-t">
                      {t('files.aiSuggestedTags')}
                    </div>
                    {aiOnlySuggestions.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => addTag(tag.id)}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
                      >
                        {tag.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mb-4">
        {askResult && (
          <button
            type="button"
            onClick={clearAskResult}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} /> {t('files.backToDrive')}
          </button>
        )}
        <SearchBar key={searchNonce} busy={asking} onSearch={ask} showAskButton={false} placeholder={t('files.searchPlaceholder')} />
        {askResult && (
          <div className="flex items-center gap-3 flex-wrap text-sm mt-2">
            <span className="text-muted-foreground flex flex-wrap items-center gap-1">
              {askResult.interpreted.projectName && <Badge variant="outline">📁 {askResult.interpreted.projectName}</Badge>}
              {askResult.interpreted.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  🏷 {tag}
                </Badge>
              ))}
              {askResult.interpreted.senderQuery && <Badge variant="outline">👤 {askResult.interpreted.senderQuery}</Badge>}
              {askResult.interpreted.textQuery && <Badge variant="secondary">{askResult.interpreted.textQuery}</Badge>}
              {askResult.interpreted.dateFrom && (
                <Badge variant="outline">
                  {askResult.interpreted.dateFrom} → {askResult.interpreted.dateTo ?? '…'}
                </Badge>
              )}
            </span>
          </div>
        )}
        {askError && <p className="text-sm text-destructive mt-2">{askError}</p>}
      </div>

      {showResults ? (
        resultsLoading ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : !activeResults || activeResults.length === 0 ? (
          <EmptyState>{t('files.noTaggedFiles')}</EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('common.name')}</TH>
                <TH className="hidden md:table-cell">{t('files.fromItem')}</TH>
                <TH className="hidden lg:table-cell">{t('files.folder')}</TH>
                <TH className="hidden sm:table-cell">{t('summaries.tags')}</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {activeResults.map((attachment) => (
                <TR key={attachment.id}>
                  <TD>
                    <span className="inline-flex items-center gap-2">
                      <FileText size={16} className="text-muted-foreground" /> {attachment.filename}
                    </span>
                  </TD>
                  <TD className="hidden md:table-cell text-muted-foreground truncate max-w-[16rem]">{attachment.source ?? '—'}</TD>
                  <TD className="hidden lg:table-cell text-muted-foreground">{attachment.folderName ?? '—'}</TD>
                  <TD className="hidden sm:table-cell text-muted-foreground">{attachment.tags.map((tag) => tag.name).join(', ')}</TD>
                  <TD className="text-right">
                    <div className="flex flex-col items-end gap-1">
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
                      <MoveToFolder
                        currentFolderName={attachment.folderName}
                        options={folderOptions ?? []}
                        busy={moveArchiveItem.isPending}
                        onMove={(folderName) => moveArchiveItem.mutate({ id: attachment.itemId, folderName })}
                      />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : (
        <>
        <nav className="flex items-center flex-wrap gap-1 text-sm mb-4">
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={c.id ?? 'root'} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={14} className="text-muted-foreground" />}
                {isLast ? (
                  <span className="font-medium">{c.name}</span>
                ) : (
                  <button type="button" className="hover:underline text-muted-foreground" onClick={() => navigateToFolder(c.id)}>
                    {c.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div
          className="relative min-w-0 flex-1"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 pointer-events-none">
              <p className="text-sm font-medium text-primary">
                {t('files.dropHint')} {data?.folder?.name ?? data?.rootName ?? ''}
              </p>
            </div>
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
                  <TH className="hidden lg:table-cell">{t('files.via')}</TH>
                  <TH className="hidden lg:table-cell">{t('files.uploadedBy')}</TH>
                  <TH className="hidden sm:table-cell">{t('files.modified')}</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {data.files.map((file) => {
                  const isSelected = file.id === selected?.fileId;
                  return (
                  <TR
                    key={file.id}
                    className={cn(isSelected && 'bg-primary/20 hover:bg-primary/25')}
                    // Inline, not a border-l-* class: TBody resets every
                    // border on the last row ([&_tr:last-child]:border-0),
                    // and that rule's higher specificity silently stripped
                    // this same highlight off only the last row. An inline
                    // style always wins over that, regardless of position.
                    style={{ borderLeft: isSelected ? '4px solid var(--primary)' : '4px solid transparent' }}
                  >
                    <TD>
                      {file.isFolder ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 hover:underline text-left"
                          onClick={() => navigateToFolder(file.id)}
                        >
                          <Folder size={16} className="text-amber-500" /> {file.name}
                        </button>
                      ) : file.webViewLink ? (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 hover:underline"
                        >
                          <FileText size={16} className="text-muted-foreground" /> {file.name}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <FileText size={16} className="text-muted-foreground" /> {file.name}
                        </span>
                      )}
                    </TD>
                    <TD className="hidden md:table-cell text-muted-foreground">{fileTypeLabel(file)}</TD>
                    <TD className="hidden md:table-cell text-muted-foreground">{file.source ?? '—'}</TD>
                    <TD className="hidden lg:table-cell text-muted-foreground">
                      {file.ingestSource === 'gmail' ? (
                        <span className="inline-flex items-center gap-1" title={t('files.viaEmail')}>
                          <Mail size={14} />
                        </span>
                      ) : file.ingestSource === 'manual' ? (
                        <span className="inline-flex items-center gap-1" title={t('files.viaUpload')}>
                          <Upload size={14} />
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="hidden lg:table-cell text-muted-foreground">{file.uploadedBy ?? '—'}</TD>
                    <TD className="hidden sm:table-cell text-muted-foreground">
                      {new Date(file.emailReceivedAt ?? file.modifiedTime).toLocaleDateString()}
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {driveLocationLink(file) && (
                          <a
                            href={driveLocationLink(file)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t('files.openInDrive')}
                            aria-label={t('files.openInDrive')}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {!file.isFolder && file.archivedItemId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t('files.metadataTags')}
                            aria-label={t('files.metadataTags')}
                            onClick={() => setSelected({ itemId: file.archivedItemId!, fileId: file.id })}
                          >
                            <TagIcon size={14} />
                          </Button>
                        )}
                        {!file.isFolder && (
                          <MoveToFolder
                            iconOnly
                            currentFolderName={data?.folder?.name ?? data?.rootName ?? null}
                            options={folderOptions ?? []}
                            busy={file.archivedItemId ? moveArchiveItem.isPending : moveDriveFile.isPending}
                            onMove={(folderName) =>
                              file.archivedItemId
                                ? moveArchiveItem.mutate({ id: file.archivedItemId, folderName })
                                : moveDriveFile.mutate({ fileId: file.id, folderName })
                            }
                          />
                        )}
                        {!file.isFolder && user?.role === 'admin' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t('files.deleteFile')}
                            aria-label={t('files.deleteFile')}
                            className="text-destructive hover:text-destructive"
                            disabled={deletingFileId === file.id}
                            onClick={() => void handleDeleteFile(file)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </div>
        {selected && (
          <div className="w-full lg:w-96 lg:shrink-0">
            <ArchiveDetailPanel
              itemId={selected.itemId}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
        </div>
        </>
      )}
      <UploadProgressPanel tasks={uploadTasks} onDismiss={() => setUploadTasks([])} />
    </div>
  );
}

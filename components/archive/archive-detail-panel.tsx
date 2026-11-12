'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, Paperclip, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/components/summaries/summary-card';
import { MoveToFolder } from '@/components/shared/move-to-folder';
import { TagEditor } from '@/components/shared/tag-editor';
import { useArchiveItem, useArchiveFolderOptions, useMoveArchiveItemFolder, useInvalidateArchive } from '@/hooks/use-archive';
import { useTags } from '@/hooks/use-api';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import type { ArchiveItemView } from '@/types/database';

interface ArchiveDetailPanelProps {
  itemId: string;
  /** Shows a close (X) button that calls this instead of navigating anywhere — used when the panel sits inline next to a table, so closing it just collapses the panel. */
  onClose: () => void;
}

/**
 * The same subject/sender/tags/project/AI-metadata/attachments summary
 * shown in the Archive detail page's sidebar, as a standalone panel — used
 * by the Files page so clicking a file's metadata icon can show and edit
 * this without leaving the table. Deliberately leaves out the full email
 * body and comments (that's what the "Open full details" link is for);
 * this is meant to fit beside a table, not replace the detail page.
 */
export function ArchiveDetailPanel({ itemId, onClose }: ArchiveDetailPanelProps) {
  const t = useT();
  const { data: item, isLoading, error } = useArchiveItem(itemId);
  const { data: tags } = useTags();
  const { data: folderOptions } = useArchiveFolderOptions();
  const moveFolder = useMoveArchiveItemFolder();
  const invalidate = useInvalidateArchive();
  const [editingTags, setEditingTags] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const update = async (patch: Record<string, unknown>) => {
    try {
      await api.patch<ArchiveItemView>(`/api/archive/${itemId}`, patch);
      invalidate();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const toggleTag = (tagId: string) => {
    if (!item) return;
    const current = item.tags.map((tag) => tag.id);
    const next = current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId];
    update({ tagIds: next });
  };

  const addNewTag = async (name: string) => {
    if (!item) return;
    setAddingTag(true);
    try {
      await update({ tagIds: item.tags.map((tag) => tag.id), newTagNames: [name] });
    } finally {
      setAddingTag(false);
    }
  };

  return (
    <div className="h-fit overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2.5">
        <h3 className="min-w-0 truncate text-sm font-medium" title={item?.title}>
          {item?.title ?? t('common.loading')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={t('common.close')}
        >
          <X size={16} />
        </button>
      </div>
      <div className="p-4 text-sm space-y-2">
        {isLoading ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : error || !item ? (
          <p className="text-muted-foreground">{t('archive.notFound')}</p>
        ) : (
          <>
            <Link
              href={`/archive/${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t('files.openFullDetails')} <ExternalLink size={12} />
            </Link>

            <Row label={t('archive.subject')} value={item.subject} />
            {item.original_sender_name && (
              <Row label={item.source === 'manual' ? t('archive.uploadedBy') : t('archive.originalSender')} value={item.original_sender_name} />
            )}
            {item.source !== 'manual' && item.original_sender_email && (
              <Row label={t('archive.originalSenderEmail')} value={item.original_sender_email} />
            )}
            {item.is_forward && item.forwarded_by_name && <Row label={t('archive.forwardedBy')} value={item.forwarded_by_name} />}
            {item.is_forward && item.forwarded_by_email && <Row label={t('archive.forwardedByEmail')} value={item.forwarded_by_email} />}

            <div className="pt-2 border-t border-border space-y-1">
              <div className="flex items-center justify-between">
                <Label>{t('summaries.tags')}</Label>
                <Button variant="ghost" size="sm" onClick={() => setEditingTags((v) => !v)}>
                  {editingTags ? t('common.close') : t('summaries.editTags')}
                </Button>
              </div>
              <TagEditor
                allTags={tags ?? []}
                selectedTags={item.tags}
                editing={editingTags}
                onToggle={toggleTag}
                onAddNew={addNewTag}
                busy={addingTag}
              />
            </div>

            <div className="pt-2 border-t border-border space-y-1.5">
              <Row label={t('archive.project')} value={item.project?.name ?? t('archive.noProject')} />
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t('archive.driveFolder')}</span>
                <span className="text-right truncate">{item.drive_folder_name ?? '—'}</span>
              </div>
              <MoveToFolder
                currentFolderName={item.drive_folder_name}
                options={folderOptions ?? []}
                busy={moveFolder.isPending}
                onMove={(folderName) => moveFolder.mutate({ id: item.id, folderName })}
              />
            </div>

            {item.ai_metadata &&
              (item.ai_metadata.documentType ||
                item.ai_metadata.topic ||
                item.ai_metadata.people.length > 0 ||
                item.ai_metadata.companies.length > 0 ||
                item.ai_metadata.documentDate ||
                item.ai_metadata.keywords.length > 0) && (
                <div className="pt-2 border-t border-border space-y-1">
                  <span className="text-muted-foreground" title={t('archive.aiMetadataHint')}>
                    {t('archive.aiMetadata')}
                  </span>
                  {item.ai_metadata.documentType && <Row label={t('archive.documentType')} value={item.ai_metadata.documentType} />}
                  {item.ai_metadata.topic && <Row label={t('archive.topic')} value={item.ai_metadata.topic} />}
                  {item.ai_metadata.people.length > 0 && <Row label={t('archive.people')} value={item.ai_metadata.people.join(', ')} />}
                  {item.ai_metadata.companies.length > 0 && (
                    <Row label={t('archive.companies')} value={item.ai_metadata.companies.join(', ')} />
                  )}
                  {item.ai_metadata.documentDate && (
                    <Row label={t('archive.documentDate')} value={formatDate(item.ai_metadata.documentDate) ?? item.ai_metadata.documentDate} />
                  )}
                  {item.ai_metadata.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {item.ai_metadata.keywords.map((k) => (
                        <Badge key={k} variant="outline" className="text-[11px]">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

            {item.attachments.length > 0 && (
              <div className="pt-2 border-t border-border space-y-1">
                <span className="text-muted-foreground">{t('summaries.attachments')}</span>
                <ul className="space-y-1">
                  {item.attachments.map((attachment) => (
                    <li key={attachment.id} className="flex items-center gap-1.5 text-xs">
                      <Paperclip size={12} className="shrink-0 text-muted-foreground" />
                      {attachment.driveUrl ? (
                        <a
                          href={attachment.driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate inline-flex items-center gap-1"
                        >
                          {attachment.filename} <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="truncate text-muted-foreground">{attachment.filename}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {errorMsg && <p className="text-xs text-destructive pt-2">{errorMsg}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right truncate">{value}</span>
    </div>
  );
}

'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Mail, Paperclip, Trash2, ExternalLink, AlertTriangle, Pencil, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LinkifiedText } from '@/components/summaries/linkified-text';
import { formatDate } from '@/components/summaries/summary-card';
import { EmptyState } from '@/components/layout/page-header';
import { useArchiveItem, useInvalidateArchive } from '@/hooks/use-archive';
import { useTags } from '@/hooks/use-api';
import { useUser } from '@/hooks/use-user';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import type { ArchiveItemView } from '@/types/database';

export default function ArchiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const router = useRouter();
  const { user } = useUser();
  const { data: item, isLoading, error } = useArchiveItem(id);
  const { data: tags } = useTags();
  const invalidate = useInvalidateArchive();
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  if (isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (error || !item) return <EmptyState>{t('archive.notFound')}</EmptyState>;

  const update = async (patch: Record<string, unknown>) => {
    try {
      await api.patch<ArchiveItemView>(`/api/archive/${item.id}`, patch);
      invalidate();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const deleteItem = async () => {
    if (!confirm(t('archive.confirmDelete'))) return;
    setDeleting(true);
    try {
      await api.delete(`/api/archive/${item.id}`);
      invalidate();
      router.push('/archive');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.error'));
      setDeleting(false);
    }
  };

  const openTitleEditor = () => {
    setTitleInput(item.title);
    setEditingTitle(true);
  };

  const saveTitle = async () => {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === item.title) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      await update({ title: trimmed });
      setEditingTitle(false);
    } finally {
      setSavingTitle(false);
    }
  };

  const toggleTag = (tagId: string) => {
    const current = item.tags.map((tag) => tag.id);
    const next = current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId];
    update({ tagIds: next });
  };

  const postComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    setPostingComment(true);
    try {
      await api.post<ArchiveItemView>(`/api/archive/${item.id}/comments`, { body: text });
      invalidate();
      setCommentText('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPostingComment(false);
    }
  };

  const senderLabel = item.original_sender_name || item.original_sender_email;

  return (
    <div className="space-y-6">
      <Link href="/archive" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> {t('common.back')}
      </Link>

      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          {editingTitle ? (
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <Input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="text-lg font-semibold"
                autoFocus
              />
              <Button size="sm" onClick={saveTitle} disabled={savingTitle}>
                {savingTitle ? t('common.loading') : t('common.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight min-w-0 break-words">{item.title}</h1>
              <button
                type="button"
                onClick={openTitleEditor}
                className="mt-1.5 text-muted-foreground hover:text-foreground shrink-0"
                aria-label={t('archive.renameItem')}
              >
                <Pencil size={16} />
              </button>
            </div>
          )}
          {user?.role === 'admin' && (
            <Button variant="outline" className="text-destructive hover:text-destructive shrink-0" onClick={deleteItem} disabled={deleting}>
              <Trash2 size={16} className="mr-1" />
              {deleting ? t('common.loading') : t('common.delete')}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar size={16} /> {formatDate(item.email_received_at) ?? '—'}
          </span>
          {senderLabel && (
            <span className="inline-flex items-center gap-1">
              <Mail size={16} /> {senderLabel}
            </span>
          )}
        </div>

        {item.drive_sync_error && (
          <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{item.drive_sync_error}</span>
          </div>
        )}
        {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('summaries.content')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap leading-relaxed text-sm break-words" dir="auto">
                <LinkifiedText text={item.body_text} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('archive.comments')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {item.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('archive.noComments')}</p>
              ) : (
                <ul className="space-y-3">
                  {item.comments.map((comment) => (
                    <li key={comment.id} className="text-sm border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium">{comment.author?.name ?? comment.author?.email ?? '—'}</span>
                        <span className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{comment.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2">
                <Textarea
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={t('archive.addCommentPlaceholder')}
                />
                <Button size="sm" onClick={postComment} disabled={postingComment || !commentText.trim()}>
                  <Send size={14} className="mr-1" />
                  {postingComment ? t('common.loading') : t('archive.addComment')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardContent className="pt-5 text-sm space-y-2">
              <Row label={t('archive.subject')} value={item.subject} />
              {item.original_sender_name && <Row label={t('archive.originalSender')} value={item.original_sender_name} />}
              {item.original_sender_email && <Row label={t('archive.originalSenderEmail')} value={item.original_sender_email} />}
              {item.is_forward && item.forwarded_by_name && <Row label={t('archive.forwardedBy')} value={item.forwarded_by_name} />}
              {item.is_forward && item.forwarded_by_email && <Row label={t('archive.forwardedByEmail')} value={item.forwarded_by_email} />}

              <div className="pt-2 border-t border-border space-y-1">
                <div className="flex items-center justify-between">
                  <Label>{t('summaries.tags')}</Label>
                  <Button variant="ghost" size="sm" onClick={() => setEditingTags((v) => !v)}>
                    {editingTags ? t('common.close') : t('summaries.editTags')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(editingTags ? tags ?? [] : item.tags).map((tag) => {
                    const selected = item.tags.some((x) => x.id === tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        disabled={!editingTags}
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                          selected ? 'bg-primary text-primary-foreground border-transparent' : 'hover:bg-accent'
                        )}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                  {!editingTags && item.tags.length === 0 && <span className="text-xs text-muted-foreground">{t('common.none')}</span>}
                </div>
              </div>

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
            </CardContent>
          </Card>
        </aside>
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

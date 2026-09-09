'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Users, Tag as TagIcon, Folder, Mail, RefreshCw, Star, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CompletenessBadge, MissingList } from '@/components/summaries/completeness-badge';
import { SendEmailDialog } from '@/components/summaries/send-email-dialog';
import { formatDate } from '@/components/summaries/summary-card';
import { EmptyState } from '@/components/layout/page-header';
import { useFolders, useSummary, useTags, useToggleFavorite, useInvalidateSummaries } from '@/hooks/use-api';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import type { SummaryView } from '@/types/database';

export default function SummaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const { data: summary, isLoading, error } = useSummary(id);
  const { data: folders } = useFolders();
  const { data: tags } = useTags();
  const toggleFavorite = useToggleFavorite();
  const invalidate = useInvalidateSummaries();
  const [showEmail, setShowEmail] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (error || !summary) return <EmptyState>{t('summaries.notFound')}</EmptyState>;

  const update = async (patch: Record<string, unknown>) => {
    try {
      await api.patch<SummaryView>(`/api/summaries/${summary.id}`, patch);
      invalidate();
      setMessage(t('common.saved'));
      setTimeout(() => setMessage(null), 1500);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const reprocess = async () => {
    setReprocessing(true);
    try {
      await api.post(`/api/summaries/${summary.id}/reprocess`);
      invalidate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setReprocessing(false);
    }
  };

  const toggleTag = (tagId: string) => {
    const current = summary.tags.map((tag) => tag.id);
    const next = current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId];
    update({ tagIds: next });
  };

  return (
    <div className="space-y-6">
      <Link href="/summaries" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> {t('common.back')}
      </Link>

      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{summary.title}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleFavorite.mutate({ id: summary.id, isFavorite: summary.is_favorite })}
              aria-label={summary.is_favorite ? t('summaries.unfavorite') : t('summaries.favorite')}
            >
              <Star size={18} className={cn(summary.is_favorite && 'fill-amber-400 text-amber-500')} />
            </Button>
            <Button variant="outline" onClick={reprocess} disabled={reprocessing} title={t('summaries.reprocess')}>
              <RefreshCw size={16} className={cn('mr-1', reprocessing && 'animate-spin')} />
              {reprocessing ? t('summaries.reprocessing') : t('summaries.reprocess')}
            </Button>
            <Button onClick={() => setShowEmail(true)}>
              <Mail size={16} className="mr-1" />
              {t('summaries.sendByEmail')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar size={16} /> {formatDate(summary.meeting_date) ?? t('summaries.noDate')}
          </span>
          {summary.meeting_time && (
            <span className="inline-flex items-center gap-1">
              <Clock size={16} /> {summary.meeting_time}
            </span>
          )}
          {summary.participants.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users size={16} /> {summary.participants.join(', ')}
            </span>
          )}
          {summary.tags.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <TagIcon size={16} /> {summary.tags.map((tag) => tag.name).join(', ')}
            </span>
          )}
          {summary.folder && (
            <span className="inline-flex items-center gap-1">
              <Folder size={16} /> {summary.folder.name}
            </span>
          )}
          <CompletenessBadge score={summary.completeness_score} />
        </div>

        {summary.processing_status === 'failed' && (
          <Badge variant="danger">
            {t('summaries.processingFailed')}: {summary.processing_error}
          </Badge>
        )}
        {summary.processing_status === 'pending' && <Badge variant="warning">{t('summaries.pending')}</Badge>}
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('summaries.content')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap leading-relaxed text-sm" dir="auto">
                {summary.content}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('summaries.aiInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InfoList title={t('summaries.participants')} items={summary.participants} />
              <InfoList title={t('summaries.topics')} items={summary.topics} />
              <InfoList title={t('summaries.actionItems')} items={summary.action_items} />
              <InfoList title={t('summaries.decisions')} items={summary.decisions} />
              <InfoList title={t('summaries.companies')} items={summary.companies} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <MissingList missing={summary.missing_data} />
              {summary.missing_data.length === 0 && <p className="text-sm text-emerald-600">🟢 {t('summaries.complete')}</p>}

              <div className="space-y-1">
                <Label>{t('summaries.changeFolder')}</Label>
                <Select value={summary.folder?.id ?? ''} onChange={(e) => update({ folderId: e.target.value })}>
                  {folders?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>{t('summaries.tags')}</Label>
                  <Button variant="ghost" size="sm" onClick={() => setEditingTags((v) => !v)}>
                    {editingTags ? t('common.close') : t('summaries.editTags')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(editingTags ? tags ?? [] : summary.tags).map((tag) => {
                    const selected = summary.tags.some((x) => x.id === tag.id);
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
                  {!editingTags && summary.tags.length === 0 && <span className="text-xs text-muted-foreground">{t('common.none')}</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 text-sm space-y-2">
              <Row label={t('summaries.source')} value={summary.source === 'gmail' ? 'Gmail' : 'Manual'} />
              {summary.email_from && <Row label={t('summaries.receivedFrom')} value={summary.email_from} />}
              {summary.email_received_at && <Row label={t('summaries.received')} value={new Date(summary.email_received_at).toLocaleString()} />}
              {summary.created_by && <Row label={t('summaries.addedBy')} value={summary.created_by.name ?? summary.created_by.email} />}
            </CardContent>
          </Card>
        </aside>
      </div>

      <SendEmailDialog key={summary.id} summary={summary} open={showEmail} onClose={() => setShowEmail(false)} />
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  const t = useT();
  return (
    <div>
      <h3 className="font-medium mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('common.none')}</p>
      ) : (
        <ul className="list-disc list-inside space-y-1 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
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

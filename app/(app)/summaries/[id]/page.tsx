'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Users, Tag as TagIcon, Folder, Mail, RefreshCw, Star, Clock, Pencil, HardDriveUpload, ExternalLink, Trash2, Paperclip, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CompletenessBadge, MissingList } from '@/components/summaries/completeness-badge';
import { SendEmailDialog } from '@/components/summaries/send-email-dialog';
import { LinkifiedText } from '@/components/summaries/linkified-text';
import { formatDate } from '@/components/summaries/summary-card';
import { EmptyState } from '@/components/layout/page-header';
import { useFolders, useSummary, useTags, useToggleFavorite, useInvalidateSummaries } from '@/hooks/use-api';
import { useUser } from '@/hooks/use-user';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import type { SummaryView } from '@/types/database';

interface DetailsForm {
  meetingDate: string;
  meetingTime: string;
  participants: string;
  companies: string;
  topics: string;
  actionItems: string;
  decisions: string;
}

function toForm(summary: SummaryView): DetailsForm {
  return {
    meetingDate: summary.meeting_date ?? '',
    meetingTime: summary.meeting_time ?? '',
    participants: summary.participants.join('\n'),
    companies: summary.companies.join('\n'),
    topics: summary.topics.join('\n'),
    actionItems: summary.action_items.join('\n'),
    decisions: summary.decisions.join('\n'),
  };
}

function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function SummaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const router = useRouter();
  const { user } = useUser();
  const { data: summary, isLoading, error } = useSummary(id);
  const { data: folders } = useFolders();
  const { data: tags } = useTags();
  const toggleFavorite = useToggleFavorite();
  const invalidate = useInvalidateSummaries();
  const [showEmail, setShowEmail] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState<DetailsForm | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [exportingDrive, setExportingDrive] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const exportToDrive = async () => {
    setExportingDrive(true);
    try {
      await api.post(`/api/summaries/${summary.id}/export-drive`);
      invalidate();
      setMessage(t('common.saved'));
      setTimeout(() => setMessage(null), 1500);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setExportingDrive(false);
    }
  };

  const deleteSummary = async () => {
    if (!confirm(t('summaries.confirmDelete'))) return;
    setDeleting(true);
    try {
      await api.delete(`/api/summaries/${summary.id}`);
      invalidate();
      router.push('/summaries');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.error'));
      setDeleting(false);
    }
  };

  const toggleTag = (tagId: string) => {
    const current = summary.tags.map((tag) => tag.id);
    const next = current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId];
    update({ tagIds: next });
  };

  const openDetailsEditor = () => {
    setDetailsForm(toForm(summary));
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    if (!detailsForm) return;
    setSavingDetails(true);
    try {
      await api.patch<SummaryView>(`/api/summaries/${summary.id}`, {
        meetingDate: detailsForm.meetingDate || null,
        meetingTime: detailsForm.meetingTime || null,
        participants: toLines(detailsForm.participants),
        companies: toLines(detailsForm.companies),
        topics: toLines(detailsForm.topics),
        actionItems: toLines(detailsForm.actionItems),
        decisions: toLines(detailsForm.decisions),
      });
      invalidate();
      setEditingDetails(false);
      setMessage(t('common.saved'));
      setTimeout(() => setMessage(null), 1500);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/summaries" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> {t('common.back')}
      </Link>

      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight min-w-0 flex-1 break-words">{summary.title}</h1>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
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
            <Button variant="outline" onClick={exportToDrive} disabled={exportingDrive} title={t('summaries.exportToDrive')}>
              <HardDriveUpload size={16} className="mr-1" />
              {exportingDrive ? t('summaries.exportingToDrive') : t('summaries.exportToDrive')}
            </Button>
            <Button onClick={() => setShowEmail(true)}>
              <Mail size={16} className="mr-1" />
              {t('summaries.sendByEmail')}
            </Button>
            {user?.role === 'admin' && (
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={deleteSummary} disabled={deleting}>
                <Trash2 size={16} className="mr-1" />
                {deleting ? t('common.loading') : t('common.delete')}
              </Button>
            )}
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
        {summary.needs_folder_review && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{t('summaries.needsFolderReview')}</span>
          </div>
        )}
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('summaries.content')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap leading-relaxed text-sm break-words" dir="auto">
                <LinkifiedText text={summary.content} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>{t('summaries.aiInfo')}</CardTitle>
              {editingDetails ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingDetails(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button size="sm" onClick={saveDetails} disabled={savingDetails}>
                    {savingDetails ? t('common.loading') : t('common.save')}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={openDetailsEditor}>
                  <Pencil size={14} className="mr-1" />
                  {t('summaries.editDetails')}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editingDetails && detailsForm ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{t('summaries.meetingDate')}</Label>
                      <Input
                        type="date"
                        value={detailsForm.meetingDate}
                        onChange={(e) => setDetailsForm({ ...detailsForm, meetingDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t('summaries.meetingTime')}</Label>
                      <Input
                        type="time"
                        value={detailsForm.meetingTime}
                        onChange={(e) => setDetailsForm({ ...detailsForm, meetingTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <EditableListField
                    label={t('summaries.participants')}
                    value={detailsForm.participants}
                    onChange={(v) => setDetailsForm({ ...detailsForm, participants: v })}
                  />
                  <EditableListField
                    label={t('summaries.topics')}
                    value={detailsForm.topics}
                    onChange={(v) => setDetailsForm({ ...detailsForm, topics: v })}
                  />
                  <EditableListField
                    label={t('summaries.actionItems')}
                    value={detailsForm.actionItems}
                    onChange={(v) => setDetailsForm({ ...detailsForm, actionItems: v })}
                  />
                  <EditableListField
                    label={t('summaries.decisions')}
                    value={detailsForm.decisions}
                    onChange={(v) => setDetailsForm({ ...detailsForm, decisions: v })}
                  />
                  <EditableListField
                    label={t('summaries.companies')}
                    value={detailsForm.companies}
                    onChange={(v) => setDetailsForm({ ...detailsForm, companies: v })}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InfoList title={t('summaries.participants')} items={summary.participants} />
                  <InfoList title={t('summaries.topics')} items={summary.topics} />
                  <InfoList title={t('summaries.actionItems')} items={summary.action_items} />
                  <InfoList title={t('summaries.decisions')} items={summary.decisions} />
                  <InfoList title={t('summaries.companies')} items={summary.companies} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardContent className="pt-5 space-y-4">
              {summary.missing_data.length === 0 ? (
                <p className="text-sm text-emerald-600">🟢 {t('summaries.complete')}</p>
              ) : (
                <div className="space-y-2">
                  <MissingList missing={summary.missing_data} />
                  <Button size="sm" variant="outline" onClick={openDetailsEditor}>
                    <Pencil size={14} className="mr-1" />
                    {t('summaries.editDetails')}
                  </Button>
                </div>
              )}

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
              {summary.drive_doc_url ? (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('summaries.driveDoc')}</span>
                  <a
                    href={summary.drive_doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {t('summaries.viewInDrive')} <ExternalLink size={14} />
                  </a>
                </div>
              ) : (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('summaries.driveDoc')}</span>
                  <span className="text-right text-muted-foreground">{t('summaries.driveNotSynced')}</span>
                </div>
              )}
              {summary.drive_sync_error && <p className="text-xs text-destructive">{summary.drive_sync_error}</p>}
              {summary.attachments.length > 0 && (
                <div className="pt-2 border-t border-border space-y-1">
                  <span className="text-muted-foreground">{t('summaries.attachments')}</span>
                  <ul className="space-y-1">
                    {summary.attachments.map((attachment) => (
                      <li key={attachment.id} className="flex items-center gap-1.5 text-xs">
                        <Paperclip size={12} className="shrink-0 text-muted-foreground" />
                        {attachment.driveUrl ? (
                          <a
                            href={attachment.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline truncate"
                          >
                            {attachment.filename}
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

      <SendEmailDialog key={summary.id} summary={summary} open={showEmail} onClose={() => setShowEmail(false)} />
    </div>
  );
}

function EditableListField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const t = useT();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{t('summaries.oneItemPerLine')}</span>
      </div>
      <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
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
            <li key={item}>
              <LinkifiedText text={item} />
            </li>
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

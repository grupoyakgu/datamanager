'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { SearchBar } from '@/components/summaries/search-bar';
import { SummaryCard } from '@/components/summaries/summary-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useFolders, useSummaries, useTags, useInvalidateSummaries, type SummaryFilters } from '@/hooks/use-api';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { resolvePeriod } from '@/lib/ai/query-parser';
import type { SearchResponse } from '@/lib/search';
import type { SummaryView } from '@/types/database';

type Period = '' | 'today' | 'this_week' | 'this_month' | 'last_month' | 'custom';

export default function SummariesPage() {
  return (
    <Suspense fallback={null}>
      <SummariesContent />
    </Suspense>
  );
}

function SummariesContent() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: folders } = useFolders();
  const { data: tags } = useTags();
  const invalidate = useInvalidateSummaries();

  const initialAsk = searchParams.get('ask');
  const [query, setQuery] = useState(initialAsk ?? searchParams.get('q') ?? '');
  const [period, setPeriod] = useState<Period>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [folderId, setFolderId] = useState(searchParams.get('folderId') ?? '');
  const [tagId, setTagId] = useState(searchParams.get('tagId') ?? '');
  const [participant, setParticipant] = useState(searchParams.get('participant') ?? '');
  const [incomplete, setIncomplete] = useState(searchParams.get('incomplete') === '1');
  const [askResult, setAskResult] = useState<SearchResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const filters = useMemo<SummaryFilters>(() => {
    const resolved = period && period !== 'custom' ? resolvePeriod(period) : { from: dateFrom || null, to: dateTo || null };
    return {
      q: query || undefined,
      dateFrom: resolved.from ?? undefined,
      dateTo: resolved.to ?? undefined,
      folderId: folderId || undefined,
      tagIds: tagId ? [tagId] : undefined,
      participant: participant || undefined,
      incomplete: incomplete || undefined,
      limit: 100,
    };
  }, [query, period, dateFrom, dateTo, folderId, tagId, participant, incomplete]);

  const { data, isLoading, error } = useSummaries(filters, !askResult);

  const ask = async (question: string) => {
    setAsking(true);
    setAskError(null);
    try {
      setAskResult(await api.post<SearchResponse>('/api/search', { question }));
    } catch (err) {
      setAskError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAsking(false);
    }
  };

  const askedInitial = useRef(false);
  useEffect(() => {
    if (initialAsk && !askedInitial.current) {
      askedInitial.current = true;
      void ask(initialAsk);
      router.replace('/summaries');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk]);

  const clearFilters = () => {
    setQuery('');
    setPeriod('');
    setDateFrom('');
    setDateTo('');
    setFolderId('');
    setTagId('');
    setParticipant('');
    setIncomplete(false);
    setAskResult(null);
  };

  const results: SummaryView[] = askResult ? askResult.results : data?.results ?? [];
  const hasFilters = !!(query || period || folderId || tagId || participant || incomplete || askResult);

  return (
    <div>
      <PageHeader
        title={t('summaries.title')}
        subtitle={t('summaries.subtitle')}
        actions={
          <Button onClick={() => setShowNew(true)} variant="outline">
            <Plus size={16} className="mr-1" />
            {t('summaries.newSummary')}
          </Button>
        }
      />

      <div className="space-y-4">
        <SearchBar
          key={searchParams.get('q') ?? 'search'}
          initialValue={query}
          busy={asking}
          onSearch={(q) => {
            setAskResult(null);
            setQuery(q);
          }}
          onAsk={ask}
        />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label>{t('summaries.period')}</Label>
            <Select value={period} onChange={(e) => { setAskResult(null); setPeriod(e.target.value as Period); }}>
              <option value="">{t('common.all')}</option>
              <option value="today">{t('summaries.today')}</option>
              <option value="this_week">{t('summaries.thisWeek')}</option>
              <option value="this_month">{t('summaries.thisMonth')}</option>
              <option value="last_month">{t('summaries.lastMonth')}</option>
              <option value="custom">{t('summaries.customRange')}</option>
            </Select>
          </div>
          {period === 'custom' && (
            <>
              <div className="space-y-1">
                <Label>{t('summaries.from')}</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('summaries.to')}</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>{t('summaries.folder')}</Label>
            <Select value={folderId} onChange={(e) => { setAskResult(null); setFolderId(e.target.value); }}>
              <option value="">{t('common.all')}</option>
              {folders?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('summaries.tag')}</Label>
            <Select value={tagId} onChange={(e) => { setAskResult(null); setTagId(e.target.value); }}>
              <option value="">{t('common.all')}</option>
              {tags?.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('summaries.participant')}</Label>
            <Input value={participant} onChange={(e) => { setAskResult(null); setParticipant(e.target.value); }} placeholder="José Antonio" />
          </div>
          <div className="space-y-1 flex flex-col justify-end">
            <label className="flex items-center gap-2 text-sm h-10">
              <input type="checkbox" checked={incomplete} onChange={(e) => { setAskResult(null); setIncomplete(e.target.checked); }} />
              {t('summaries.incompleteOnly')}
            </label>
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {t('common.clearFilters')}
            </Button>
            {askResult?.interpreted && (
              <span className="text-muted-foreground flex flex-wrap items-center gap-1">
                {t('summaries.interpretedAs')}:
                <Badge variant="secondary">{askResult.interpreted.semanticQuery}</Badge>
                {askResult.interpreted.dateFrom && (
                  <Badge variant="outline">
                    {askResult.interpreted.dateFrom} → {askResult.interpreted.dateTo ?? '…'}
                  </Badge>
                )}
                {askResult.interpreted.participant && <Badge variant="outline">👥 {askResult.interpreted.participant}</Badge>}
                {askResult.interpreted.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    🏷 {tag}
                  </Badge>
                ))}
                {askResult.mode === 'semantic' && <Badge variant="success">{t('summaries.semanticResults')}</Badge>}
              </span>
            )}
          </div>
        )}

        {askError && <p className="text-sm text-destructive">{askError}</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {isLoading || asking ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : results.length === 0 ? (
          <EmptyState>{t('common.noResults')}</EmptyState>
        ) : (
          <div className="grid gap-3">
            {results.map((summary) => (
              <SummaryCard key={summary.id} summary={summary} />
            ))}
          </div>
        )}
      </div>

      <NewSummaryDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        folders={folders ?? []}
        onCreated={(summary) => {
          setShowNew(false);
          invalidate();
          router.push(`/summaries/${summary.id}`);
        }}
      />
    </div>
  );
}

function NewSummaryDialog({
  open,
  onClose,
  folders,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  folders: { id: string; name: string; is_default: boolean }[];
  onCreated: (summary: SummaryView) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [folderId, setFolderId] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const summary = await api.post<SummaryView>('/api/summaries', {
        title,
        content,
        folderId: folderId || undefined,
        meetingDate: meetingDate || null,
      });
      setTitle('');
      setContent('');
      onCreated(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('summaries.newSummary')}>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>{t('summaries.manualTitle')}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t('summaries.meetingDate')}</Label>
            <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('summaries.folder')}</Label>
            <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">{folders.find((f) => f.is_default)?.name ?? t('admin.defaultFolder')}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>{t('summaries.manualContent')}</Label>
          <Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving || !title.trim() || !content.trim()}>
            {saving ? t('common.loading') : t('common.create')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

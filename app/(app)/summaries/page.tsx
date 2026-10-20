'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, Sparkles, Star } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { SearchBar } from '@/components/summaries/search-bar';
import { formatDate } from '@/components/summaries/summary-card';
import { CompletenessBadge } from '@/components/summaries/completeness-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import {
  useDriveRootFolders,
  useSummaries,
  useTags,
  useInvalidateSummaries,
  useToggleFavorite,
  type SummaryFilters,
} from '@/hooks/use-api';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { resolvePeriod } from '@/lib/ai/query-parser';
import { cn } from '@/lib/utils';
import type { SearchResponse } from '@/lib/search';
import type { SummaryView } from '@/types/database';
import type { ArchiveSyncResult, SummarySyncResult } from '@/lib/mailbox-sync';

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
  const { data: driveFolders } = useDriveRootFolders();
  const { data: tags } = useTags();
  const invalidate = useInvalidateSummaries();
  const toggleFavorite = useToggleFavorite();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const initialAsk = searchParams.get('ask');
  const [query, setQuery] = useState(initialAsk ?? searchParams.get('q') ?? '');
  const [period, setPeriod] = useState<Period>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [driveFolder, setDriveFolder] = useState(searchParams.get('driveFolder') ?? '');
  const [tagId, setTagId] = useState(searchParams.get('tagId') ?? '');
  const [participant, setParticipant] = useState(searchParams.get('participant') ?? '');
  const [incomplete, setIncomplete] = useState(searchParams.get('incomplete') === '1');
  const [askResult, setAskResult] = useState<SearchResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const filters = useMemo<SummaryFilters>(() => {
    const resolved = period && period !== 'custom' ? resolvePeriod(period) : { from: dateFrom || null, to: dateTo || null };
    return {
      q: query || undefined,
      dateFrom: resolved.from ?? undefined,
      dateTo: resolved.to ?? undefined,
      driveFolder: driveFolder || undefined,
      tagIds: tagId ? [tagId] : undefined,
      participant: participant || undefined,
      incomplete: incomplete || undefined,
      limit: 100,
    };
  }, [query, period, dateFrom, dateTo, driveFolder, tagId, participant, incomplete]);

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
    setDriveFolder('');
    setTagId('');
    setParticipant('');
    setIncomplete(false);
    setAskResult(null);
  };

  const results: SummaryView[] = askResult ? askResult.results : data?.results ?? [];
  const hasFilters = !!(query || period || driveFolder || tagId || participant || incomplete || askResult);

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.post<{ archive: ArchiveSyncResult; summaries: SummarySyncResult }>('/api/archive/sync');
      setSyncMessage(
        result.summaries.error
          ? result.summaries.error
          : !result.summaries.connected
            ? t('archive.mailboxNotConnected')
            : `${result.summaries.created} ${t('admin.created')}, ${result.summaries.skipped} ${t('admin.skipped')}, ${result.summaries.failed} ${t('admin.failed')}`
      );
      invalidate();
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('summaries.title')}
        subtitle={t('summaries.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={syncNow} disabled={syncing}>
              <RefreshCw size={16} className={cn('mr-1', syncing && 'animate-spin')} />
              {syncing ? t('dashboard.syncing') : t('summaries.syncNow')}
            </Button>
          </div>
        }
      />
      {syncMessage && <p className="text-sm text-muted-foreground mb-3">{syncMessage}</p>}

      <div className="space-y-4">
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} /> {t('summaries.backToSummaries')}
          </button>
        )}

        <SearchBar
          key={searchParams.get('q') ?? 'search'}
          initialValue={query}
          busy={asking}
          onSearch={ask}
          showAskButton={false}
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
            <Select value={driveFolder} onChange={(e) => { setAskResult(null); setDriveFolder(e.target.value); }}>
              <option value="">{t('common.all')}</option>
              {driveFolders?.map((f) => (
                <option key={f.id} value={f.name}>
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

        {askResult?.interpreted && (
          <div className="flex items-center gap-3 flex-wrap text-sm">
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
          </div>
        )}

        {askResult?.answer && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 flex items-start gap-2">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-primary">{t('summaries.aiAnswer')}</p>
                <p className="text-sm whitespace-pre-wrap" dir="auto">
                  {askResult.answer}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {askError && <p className="text-sm text-destructive">{askError}</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {isLoading || asking ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : results.length === 0 ? (
          <EmptyState>{t('common.noResults')}</EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('summaries.manualTitle')}</TH>
                <TH>{t('summaries.meetingDate')}</TH>
                <TH>{t('summaries.participants')}</TH>
                <TH>{t('summaries.tags')}</TH>
                <TH>{t('summaries.folder')}</TH>
                <TH>{t('actionItems.title')}</TH>
                <TH>{t('summaries.completenessColumn')}</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {results.map((summary) => (
                <TR key={summary.id} className="cursor-pointer" onClick={() => router.push(`/summaries/${summary.id}`)}>
                  <TD className="font-medium max-w-xs truncate">{summary.title}</TD>
                  <TD className="text-muted-foreground whitespace-nowrap">{formatDate(summary.meeting_date) ?? t('summaries.noDate')}</TD>
                  <TD className="text-muted-foreground truncate max-w-[12rem]">{summary.participants.join(', ') || '—'}</TD>
                  <TD className="text-muted-foreground truncate max-w-[10rem]">
                    {summary.tags.map((tag) => tag.name).join(', ') || '—'}
                  </TD>
                  <TD className="text-muted-foreground whitespace-nowrap">{summary.drive_folder_name ?? '—'}</TD>
                  <TD className="text-muted-foreground whitespace-nowrap">
                    {summary.action_item_rows.length > 0
                      ? `${summary.action_item_rows.filter((r) => r.status === 'closed').length}/${summary.action_item_rows.length}`
                      : '—'}
                  </TD>
                  <TD>
                    <CompletenessBadge score={summary.completeness_score} />
                  </TD>
                  <TD onClick={(e) => e.stopPropagation()} className="text-right">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-amber-500"
                      onClick={() => toggleFavorite.mutate({ id: summary.id, isFavorite: summary.is_favorite })}
                      aria-label={summary.is_favorite ? t('summaries.unfavorite') : t('summaries.favorite')}
                    >
                      <Star size={16} className={cn(summary.is_favorite && 'fill-amber-400 text-amber-500')} />
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

    </div>
  );
}

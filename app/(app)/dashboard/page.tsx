'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SummaryCard } from '@/components/summaries/summary-card';
import { MissingList } from '@/components/summaries/completeness-badge';
import { SearchBar } from '@/components/summaries/search-bar';
import { EmptyState } from '@/components/layout/page-header';
import { useUser } from '@/hooks/use-user';
import { useInvalidateSummaries } from '@/hooks/use-api';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import type { SummaryView } from '@/types/database';
import type { SyncResult } from '@/lib/summaries/sync';

interface DashboardStats {
  newSummaries: number;
  incompleteSummaries: number;
  meetingsThisMonth: number;
  openActionItems: number;
  recentSummaries: SummaryView[];
  missingSummaries: SummaryView[];
  recentMeetings: SummaryView[];
}

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return 'dashboard.goodMorning';
  if (hour < 19) return 'dashboard.goodAfternoon';
  return 'dashboard.goodEvening';
}

export default function DashboardPage() {
  const { user, refresh } = useUser();
  const t = useT();
  const router = useRouter();
  const invalidate = useInvalidateSummaries();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/api/dashboard/stats'),
    enabled: !!user,
  });

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const { results } = await api.post<{ results: SyncResult[] }>('/api/gmail/sync', { scope: 'me' });
      const r = results[0];
      setSyncMessage(
        r?.error
          ? r.error
          : `${t('dashboard.syncDone')}: ${r?.created ?? 0} ${t('admin.created')}, ${r?.skipped ?? 0} ${t('admin.skipped')}, ${r?.failed ?? 0} ${t('admin.failed')}`
      );
      invalidate();
      refresh();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setSyncing(false);
    }
  };

  const firstName = (user?.name ?? user?.email ?? '').split(' ')[0];
  const hasSummaries = (stats?.recentSummaries.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {t(greetingKey())}, {firstName}
          </h1>
          <p className="text-muted-foreground mt-1">{t('appName')}</p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <Button variant="outline" onClick={syncNow} disabled={syncing}>
            {syncing ? t('dashboard.syncing') : t('dashboard.syncNow')}
          </Button>
          {syncMessage && <span className="text-xs text-muted-foreground">{syncMessage}</span>}
        </div>
      </div>

      {user?.gmail_status === 'authorization_required' && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-200">
          🔴 {t('dashboard.gmailWarning')}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('dashboard.newSummaries')} value={stats?.newSummaries ?? 0} description={t('dashboard.thisMonth')} />
        <StatCard label={t('dashboard.incomplete')} value={stats?.incompleteSummaries ?? 0} description={t('dashboard.needAttention')} />
        <StatCard label={t('dashboard.meetingsThisMonth')} value={stats?.meetingsThisMonth ?? 0} description={t('dashboard.tracked')} />
        <StatCard label={t('dashboard.openActions')} value={stats?.openActionItems ?? 0} description={t('dashboard.toComplete')} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.quickSearch')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SearchBar
            placeholder={t('dashboard.askAnything')}
            onSearch={(q) => router.push(`/summaries?q=${encodeURIComponent(q)}`)}
            onAsk={(q) => router.push(`/summaries?ask=${encodeURIComponent(q)}`)}
          />
        </CardContent>
      </Card>

      {!isLoading && !hasSummaries ? (
        <EmptyState>{t('dashboard.noSummaries')}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-semibold mb-3">{t('dashboard.recent')}</h2>
            <div className="space-y-3">
              {stats?.recentSummaries.map((s) => (
                <SummaryCard key={s.id} summary={s} compact />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">{t('dashboard.missingInfo')}</h2>
            <div className="space-y-3">
              {stats?.missingSummaries.length === 0 && <EmptyState>{t('common.noResults')}</EmptyState>}
              {stats?.missingSummaries.map((s) => (
                <Card key={s.id} className="border-amber-200 dark:border-amber-900">
                  <CardContent className="pt-4 space-y-2">
                    <SummaryCard summary={s} compact />
                    <MissingList missing={s.missing_data} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-3">{t('dashboard.recentMeetings')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stats?.recentMeetings.map((s) => (
                <SummaryCard key={s.id} summary={s} compact />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, description }: { label: string; value: number; description: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

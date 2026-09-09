'use client';

import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { SummaryCard } from '@/components/summaries/summary-card';
import { useSummaries } from '@/hooks/use-api';
import { useT } from '@/lib/i18n/context';

export default function FavoritesPage() {
  const t = useT();
  const { data, isLoading } = useSummaries({ favorites: true, limit: 100 });

  return (
    <div>
      <PageHeader title={t('favorites.title')} subtitle={t('favorites.subtitle')} />
      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : !data || data.results.length === 0 ? (
        <EmptyState>{t('favorites.empty')}</EmptyState>
      ) : (
        <div className="grid gap-3">
          {data.results.map((summary) => (
            <SummaryCard key={summary.id} summary={summary} />
          ))}
        </div>
      )}
    </div>
  );
}

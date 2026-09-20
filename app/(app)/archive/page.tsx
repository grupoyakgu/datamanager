'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArchiveCard } from '@/components/archive/archive-card';
import { useArchiveItems, useInvalidateArchive } from '@/hooks/use-archive';
import { useUser } from '@/hooks/use-user';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import type { ArchiveSyncResult } from '@/lib/archive/sync';

export default function ArchivePage() {
  const t = useT();
  const { user } = useUser();
  const [inputValue, setInputValue] = useState('');
  const [query, setQuery] = useState('');
  const invalidate = useInvalidateArchive();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(inputValue.trim()), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data: items, isLoading, error } = useArchiveItems(query || undefined);

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.post<ArchiveSyncResult>('/api/archive/sync');
      setSyncMessage(
        result.error
          ? result.error
          : !result.connected
            ? t('archive.mailboxNotConnected')
            : `${result.created} ${t('admin.created')}, ${result.skipped} ${t('admin.skipped')}, ${result.failed} ${t('admin.failed')}`
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
        title={t('archive.title')}
        subtitle={t('archive.subtitle')}
        actions={
          user?.role === 'admin' ? (
            <Button variant="outline" onClick={syncNow} disabled={syncing}>
              <RefreshCw size={16} className={cn('mr-1', syncing && 'animate-spin')} />
              {syncing ? t('dashboard.syncing') : t('archive.syncNow')}
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4">
        <Input value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={t('archive.searchPlaceholder')} />

        {syncMessage && <p className="text-sm text-muted-foreground">{syncMessage}</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {isLoading ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : !items || items.length === 0 ? (
          <EmptyState>{t('archive.empty')}</EmptyState>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <ArchiveCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

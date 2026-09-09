'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useInvalidateSummaries } from '@/hooks/use-api';
import { useAdminUsers, useSettings, useInvalidateAdmin, splitList } from './use-admin';
import { GmailStatusBadge } from './users-section';
import type { SyncResult } from '@/lib/summaries/sync';

export function GmailSection() {
  const t = useT();
  const { data: users } = useAdminUsers();
  const { data: settings } = useSettings();
  const invalidateAdmin = useInvalidateAdmin();
  const invalidateAll = useInvalidateSummaries();
  const [results, setResults] = useState<SyncResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string | null>(null);
  const [lookback, setLookback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = async (scope: 'all' | string) => {
    setBusy(scope);
    setError(null);
    try {
      const body = scope === 'all' ? { scope: 'all' } : { userId: scope };
      const response = await api.post<{ results: SyncResult[] }>('/api/gmail/sync', body);
      setResults(response.results);
      invalidateAdmin('admin-users');
      invalidateAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async () => {
    setError(null);
    try {
      await api.patch('/api/admin/settings', {
        summary_keywords: splitList(keywords ?? settings?.summary_keywords.join(', ') ?? ''),
        sync_lookback_days: Number(lookback ?? settings?.sync_lookback_days ?? 30),
      });
      invalidateAdmin('admin-settings');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => sync('all')} disabled={busy !== null}>
          {busy === 'all' ? t('dashboard.syncing') : t('admin.syncAll')}
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>{t('admin.user')}</TH>
            <TH>{t('admin.gmailStatus')}</TH>
            <TH>{t('admin.lastSync')}</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {users?.map((u) => (
            <TR key={u.id}>
              <TD>
                <div className="font-medium">{u.name ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
                {u.connection?.last_error && <div className="text-xs text-destructive mt-1">{u.connection.last_error}</div>}
              </TD>
              <TD><GmailStatusBadge user={u} /></TD>
              <TD className="text-muted-foreground">{u.last_gmail_sync ? new Date(u.last_gmail_sync).toLocaleString() : '—'}</TD>
              <TD className="text-right">
                <Button size="sm" variant="outline" disabled={busy !== null || u.gmail_status !== 'connected'} onClick={() => sync(u.id)}>
                  {busy === u.id ? t('dashboard.syncing') : t('admin.syncUser')}
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.syncResults')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {results.map((r) => (
                <li key={r.userId}>
                  <span className="font-mono text-xs text-muted-foreground">{users?.find((u) => u.id === r.userId)?.email ?? r.userId}</span>:{' '}
                  {r.scanned} {t('admin.scanned')}, {r.created} {t('admin.created')}, {r.skipped} {t('admin.skipped')}, {r.failed} {t('admin.failed')}
                  {r.error && <span className="text-destructive"> — {r.error}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {settings && (
        <Card>
          <CardContent className="pt-5 space-y-3 max-w-xl">
            <div className="space-y-1">
              <Label>{t('admin.keywords')}</Label>
              <Input value={keywords ?? settings.summary_keywords.join(', ')} onChange={(e) => setKeywords(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('admin.lookback')}</Label>
              <Input type="number" min={1} max={365} value={lookback ?? String(settings.sync_lookback_days)} onChange={(e) => setLookback(e.target.value)} />
            </div>
            <Button onClick={saveSettings}>{t('common.save')}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

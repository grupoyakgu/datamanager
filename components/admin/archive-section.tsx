'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useInvalidateArchive } from '@/hooks/use-archive';
import { useAdminUsers, useSettings, useInvalidateAdmin } from './use-admin';
import { GmailStatusBadge } from './users-section';
import { cn } from '@/lib/utils';
import type { ArchiveSyncResult } from '@/lib/archive/sync';

export function ArchiveSection() {
  const t = useT();
  const { data: users } = useAdminUsers();
  const { data: settings } = useSettings();
  const invalidateAdmin = useInvalidateAdmin();
  const invalidateArchive = useInvalidateArchive();
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [lookback, setLookback] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<ArchiveSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mailboxUser = users?.find((u) => u.email.toLowerCase() === (settings?.archive_mailbox ?? '').toLowerCase());

  const save = async () => {
    setStatus(null);
    setError(null);
    try {
      await api.patch('/api/admin/settings', {
        archive_mailbox: (mailbox ?? settings?.archive_mailbox ?? '').trim(),
        archive_drive_folder_id: (folder ?? settings?.archive_drive_folder_id ?? '').trim(),
        archive_sync_lookback_days: Number(lookback ?? settings?.archive_sync_lookback_days ?? 365),
      });
      invalidateAdmin('admin-settings');
      setStatus(t('common.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await api.post<ArchiveSyncResult>('/api/archive/sync');
      setSyncResult(result);
      invalidateAdmin('admin-users');
      invalidateArchive();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSyncing(false);
    }
  };

  if (!settings) return <p className="text-muted-foreground">{t('common.loading')}</p>;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="pt-5 space-y-3 max-w-xl">
          <div className="space-y-1">
            <Label>{t('admin.archiveMailbox')}</Label>
            <Input value={mailbox ?? settings.archive_mailbox} onChange={(e) => setMailbox(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('admin.archiveMailboxHint')}</p>
            {mailboxUser ? (
              <div className="flex items-center gap-2 text-sm pt-1">
                <span className="text-muted-foreground">{t('admin.gmailStatus')}:</span>
                <GmailStatusBadge user={mailboxUser} />
              </div>
            ) : (
              <p className="text-sm text-amber-600 dark:text-amber-400 pt-1">{t('admin.archiveMailboxNotSignedIn')}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>{t('admin.archiveDriveFolder')}</Label>
            <Input value={folder ?? settings.archive_drive_folder_id} onChange={(e) => setFolder(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('admin.archiveDriveFolderHint')}</p>
          </div>
          <div className="space-y-1">
            <Label>{t('admin.archiveLookback')}</Label>
            <Input
              type="number"
              min={1}
              max={3650}
              value={lookback ?? String(settings.archive_sync_lookback_days)}
              onChange={(e) => setLookback(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save}>{t('common.save')}</Button>
            {status && <span className="text-sm text-muted-foreground">{status}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('archive.syncNow')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.archiveSyncHint')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={syncNow} disabled={syncing}>
            <RefreshCw size={16} className={cn('mr-1', syncing && 'animate-spin')} />
            {syncing ? t('dashboard.syncing') : t('archive.syncNow')}
          </Button>
          {syncResult && (
            <div className="text-sm space-y-1">
              {syncResult.connected ? (
                <p className="text-muted-foreground">
                  {t('admin.archiveMailbox')}: <span className="font-medium">{syncResult.mailbox}</span>
                </p>
              ) : (
                <p className="text-destructive">{t('admin.archiveMailboxNotSignedIn')}</p>
              )}
              <p>
                {syncResult.scanned} {t('admin.scanned')}, {syncResult.created} {t('admin.created')}, {syncResult.skipped}{' '}
                {t('admin.skipped')}, {syncResult.failed} {t('admin.failed')}
              </p>
              {syncResult.error && <p className="text-destructive">{syncResult.error}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

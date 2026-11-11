'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useInvalidateArchive } from '@/hooks/use-archive';
import { useAdminUsers, useSettings, useArchiveSenderDomains, useArchiveProjectsAdmin, useInvalidateAdmin, splitList } from './use-admin';
import { GmailStatusBadge } from './users-section';
import { cn } from '@/lib/utils';
import type { ArchiveSyncResult, SummarySyncResult } from '@/lib/mailbox-sync';

export function ArchiveSection() {
  const t = useT();
  const { data: users } = useAdminUsers();
  const { data: settings } = useSettings();
  const { data: senderDomains } = useArchiveSenderDomains();
  const { data: projects } = useArchiveProjectsAdmin();
  const invalidateAdmin = useInvalidateAdmin();
  const invalidateArchive = useInvalidateArchive();
  const queryClient = useQueryClient();
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [lookback, setLookback] = useState<string | null>(null);
  const [excludedExtensions, setExcludedExtensions] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ archive: ArchiveSyncResult; summaries: SummarySyncResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [domainFolderInput, setDomainFolderInput] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [editDomainFolderName, setEditDomainFolderName] = useState('');
  const [savingDomainName, setSavingDomainName] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [savingProjectName, setSavingProjectName] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearResult, setClearResult] = useState<string | null>(null);

  const mailboxUser = users?.find((u) => u.email.toLowerCase() === (settings?.archive_mailbox ?? '').toLowerCase());

  const save = async () => {
    setStatus(null);
    setError(null);
    try {
      await api.patch('/api/admin/settings', {
        archive_mailbox: (mailbox ?? settings?.archive_mailbox ?? '').trim(),
        archive_drive_folder_id: (folder ?? settings?.archive_drive_folder_id ?? '').trim(),
        archive_sync_lookback_days: Number(lookback ?? settings?.archive_sync_lookback_days ?? 365),
        archive_excluded_extensions: splitList(excludedExtensions ?? settings?.archive_excluded_extensions.join(', ') ?? '').map((e) =>
          e.toLowerCase().replace(/^\./, '')
        ),
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
      const result = await api.post<{ archive: ArchiveSyncResult; summaries: SummarySyncResult }>('/api/archive/sync');
      setSyncResult(result);
      invalidateAdmin('admin-users');
      invalidateArchive();
      queryClient.invalidateQueries({ queryKey: ['summaries'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSyncing(false);
    }
  };

  const addDomain = async () => {
    setDomainError(null);
    const domain = domainInput.trim();
    const folderName = domainFolderInput.trim();
    if (!domain || !folderName) return;
    setAddingDomain(true);
    try {
      await api.post('/api/admin/archive-sender-domains', { domain, folderName });
      invalidateAdmin('archive-sender-domains');
      setDomainInput('');
      setDomainFolderInput('');
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAddingDomain(false);
    }
  };

  const deleteDomain = async (id: string) => {
    setDomainError(null);
    try {
      await api.delete(`/api/admin/archive-sender-domains/${id}`);
      invalidateAdmin('archive-sender-domains');
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const saveDomainFolderName = async (id: string) => {
    const name = editDomainFolderName.trim();
    if (!name) return;
    setDomainError(null);
    setSavingDomainName(true);
    try {
      await api.patch(`/api/admin/archive-sender-domains/${id}`, { folderName: name });
      invalidateAdmin('archive-sender-domains');
      setEditingDomainId(null);
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingDomainName(false);
    }
  };

  const saveProjectName = async (id: string) => {
    const name = editProjectName.trim();
    if (!name) return;
    setProjectError(null);
    setSavingProjectName(true);
    try {
      await api.patch(`/api/admin/archive-projects/${id}`, { driveFolderName: name });
      invalidateAdmin('archive-projects-admin');
      setEditingProjectId(null);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingProjectName(false);
    }
  };

  const clearArchive = async () => {
    if (!confirm(t('admin.archiveClearConfirm'))) return;
    setClearing(true);
    setClearError(null);
    setClearResult(null);
    try {
      const result = await api.post<{ deleted: number; filesDeleted: number; tagsDeleted: number; projectsCleared: number }>(
        '/api/admin/archive/clear'
      );
      setClearResult(
        `${result.deleted} ${t('admin.archiveClearDeleted')}, ${result.filesDeleted} ${t('admin.archiveClearFilesDeleted')}, ${result.tagsDeleted} ${t('admin.archiveClearTagsDeleted')}, ${result.projectsCleared} ${t('admin.archiveClearProjectsCleared')}`
      );
      invalidateArchive();
      queryClient.invalidateQueries({ queryKey: ['drive'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      invalidateAdmin('archive-projects-admin');
    } catch (err) {
      setClearError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setClearing(false);
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
          <div className="space-y-1">
            <Label>{t('admin.archiveExcludedExtensions')}</Label>
            <Input
              value={excludedExtensions ?? settings.archive_excluded_extensions.join(', ')}
              onChange={(e) => setExcludedExtensions(e.target.value)}
              placeholder="png, gif"
            />
            <p className="text-xs text-muted-foreground">{t('admin.archiveExcludedExtensionsHint')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save}>{t('common.save')}</Button>
            {status && <span className="text-sm text-muted-foreground">{status}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.archiveSenderDomains')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.archiveSenderDomainsHint')}</p>
        </CardHeader>
        <CardContent className="space-y-4 max-w-2xl">
          {domainError && <p className="text-sm text-destructive">{domainError}</p>}
          <div className="space-y-2">
            {(senderDomains ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t('admin.archiveSenderDomainsEmpty')}</p>
            )}
            {senderDomains?.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                <span className="font-medium truncate">{d.domain}</span>
                <span className="text-muted-foreground">→</span>
                {editingDomainId === d.id ? (
                  <>
                    <Input
                      value={editDomainFolderName}
                      onChange={(e) => setEditDomainFolderName(e.target.value)}
                      className="h-8 max-w-[14rem]"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => saveDomainFolderName(d.id)}
                      disabled={savingDomainName || !editDomainFolderName.trim()}
                    >
                      <Check size={16} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingDomainId(null)}>
                      <X size={16} />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="truncate">{d.folder_name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingDomainId(d.id);
                        setEditDomainFolderName(d.folder_name);
                      }}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => deleteDomain(d.id)}>
                      <Trash2 size={16} />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
            <Input value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder={t('admin.archiveDomainPlaceholder')} />
            <Input
              value={domainFolderInput}
              onChange={(e) => setDomainFolderInput(e.target.value)}
              placeholder={t('admin.archiveDomainFolderPlaceholder')}
            />
            <Button onClick={addDomain} disabled={addingDomain || !domainInput.trim() || !domainFolderInput.trim()}>
              {addingDomain ? t('common.loading') : t('admin.addDomain')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.archiveProjects')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.archiveProjectsHint')}</p>
        </CardHeader>
        <CardContent className="space-y-2 max-w-2xl">
          {projectError && <p className="text-sm text-destructive">{projectError}</p>}
          {(projects ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t('admin.archiveProjectsEmpty')}</p>}
          {projects?.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
              {editingProjectId === p.id ? (
                <>
                  <Input
                    value={editProjectName}
                    onChange={(e) => setEditProjectName(e.target.value)}
                    className="h-8 max-w-[14rem]"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => saveProjectName(p.id)}
                    disabled={savingProjectName || !editProjectName.trim()}
                  >
                    <Check size={16} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingProjectId(null)}>
                    <X size={16} />
                  </Button>
                </>
              ) : (
                <>
                  <span className="truncate">{p.drive_folder_name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => {
                      setEditingProjectId(p.id);
                      setEditProjectName(p.drive_folder_name);
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                </>
              )}
            </div>
          ))}
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
              {syncResult.archive.connected ? (
                <p className="text-muted-foreground">
                  {t('admin.archiveMailbox')}: <span className="font-medium">{syncResult.archive.mailbox}</span>
                </p>
              ) : (
                <p className="text-destructive">{t('admin.archiveMailboxNotSignedIn')}</p>
              )}
              <p>
                {syncResult.archive.scanned} {t('admin.scanned')} — {syncResult.archive.created} {t('admin.created')} ({t('nav.archive')}),{' '}
                {syncResult.summaries.created} {t('admin.created')} ({t('nav.summaries')}),{' '}
                {syncResult.archive.skipped + syncResult.summaries.skipped} {t('admin.skipped')},{' '}
                {syncResult.archive.failed + syncResult.summaries.failed} {t('admin.failed')}
              </p>
              {syncResult.archive.error && <p className="text-destructive">{syncResult.archive.error}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t('admin.archiveClearTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.archiveClearHint')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {clearError && <p className="text-sm text-destructive">{clearError}</p>}
          {clearResult && <p className="text-sm text-muted-foreground">{clearResult}</p>}
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={clearArchive} disabled={clearing}>
            <Trash2 size={16} className="mr-1" />
            {clearing ? t('common.loading') : t('admin.archiveClearButton')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

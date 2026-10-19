'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useInvalidateArchive } from '@/hooks/use-archive';
import { useAdminUsers, useSettings, useArchiveFolderRules, useArchiveDriveFolders, useInvalidateAdmin, splitList } from './use-admin';
import { GmailStatusBadge } from './users-section';
import { cn } from '@/lib/utils';
import type { ArchiveSyncResult } from '@/lib/archive/sync';

export function ArchiveSection() {
  const t = useT();
  const { data: users } = useAdminUsers();
  const { data: settings } = useSettings();
  const { data: folderRules } = useArchiveFolderRules();
  const { data: driveFolders } = useArchiveDriveFolders();
  const invalidateAdmin = useInvalidateAdmin();
  const invalidateArchive = useInvalidateArchive();
  const queryClient = useQueryClient();
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [lookback, setLookback] = useState<string | null>(null);
  const [excludedExtensions, setExcludedExtensions] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<ArchiveSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rulePattern, setRulePattern] = useState('');
  const [ruleFolderId, setRuleFolderId] = useState('');
  const [addingRule, setAddingRule] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createdFolders, setCreatedFolders] = useState<{ id: string; name: string }[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editRuleName, setEditRuleName] = useState('');
  const [savingRuleName, setSavingRuleName] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearResult, setClearResult] = useState<string | null>(null);

  const mailboxUser = users?.find((u) => u.email.toLowerCase() === (settings?.archive_mailbox ?? '').toLowerCase());
  const mailboxConnected = mailboxUser?.gmail_status === 'connected';
  // Folders just created in this session, in case the archive-drive-folders
  // list hasn't refetched yet — kept out of the dropdown once it has.
  const folderOptions = [...(driveFolders ?? []), ...createdFolders.filter((cf) => !driveFolders?.some((f) => f.id === cf.id))];

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

  const addRule = async () => {
    setRuleError(null);
    const targetFolder = folderOptions.find((f) => f.id === ruleFolderId);
    if (!rulePattern.trim() || !targetFolder) return;
    setAddingRule(true);
    try {
      await api.post('/api/admin/archive-folder-rules', {
        pattern: rulePattern.trim(),
        driveFolderId: targetFolder.id,
        driveFolderName: targetFolder.name,
      });
      invalidateAdmin('archive-folder-rules');
      setRulePattern('');
      setRuleFolderId('');
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAddingRule(false);
    }
  };

  const deleteRule = async (id: string) => {
    setRuleError(null);
    try {
      await api.delete(`/api/admin/archive-folder-rules/${id}`);
      invalidateAdmin('archive-folder-rules');
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const saveRuleName = async (id: string) => {
    const name = editRuleName.trim();
    if (!name) return;
    setRuleError(null);
    setSavingRuleName(true);
    try {
      await api.patch(`/api/admin/archive-folder-rules/${id}`, { driveFolderName: name });
      invalidateAdmin('archive-folder-rules');
      invalidateAdmin('archive-drive-folders');
      setEditingRuleId(null);
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingRuleName(false);
    }
  };

  const clearArchive = async () => {
    if (!confirm(t('admin.archiveClearConfirm'))) return;
    setClearing(true);
    setClearError(null);
    setClearResult(null);
    try {
      const result = await api.post<{ deleted: number; filesDeleted: number; tagsDeleted: number }>('/api/admin/archive/clear');
      setClearResult(
        `${result.deleted} ${t('admin.archiveClearDeleted')}, ${result.filesDeleted} ${t('admin.archiveClearFilesDeleted')}, ${result.tagsDeleted} ${t('admin.archiveClearTagsDeleted')}`
      );
      invalidateArchive();
      queryClient.invalidateQueries({ queryKey: ['drive'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    } catch (err) {
      setClearError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setClearing(false);
    }
  };

  const createFolder = async () => {
    setRuleError(null);
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    try {
      const created = await api.post<{ id: string; name: string }>('/api/admin/archive-drive-folders', { name });
      setCreatedFolders((prev) => [...prev, created]);
      setRuleFolderId(created.id);
      setNewFolderName('');
      invalidateAdmin('archive-drive-folders');
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCreatingFolder(false);
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
          <CardTitle>{t('admin.archiveFolderRules')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.archiveFolderRulesHint')}</p>
        </CardHeader>
        <CardContent className="space-y-4 max-w-2xl">
          {!mailboxConnected && (
            <p className="text-sm text-amber-600 dark:text-amber-400">{t('admin.archiveFolderRulesNeedsConnection')}</p>
          )}
          {ruleError && <p className="text-sm text-destructive">{ruleError}</p>}
          <div className="space-y-2">
            {(folderRules ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t('admin.archiveFolderRulesEmpty')}</p>
            )}
            {folderRules?.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                <span className="font-medium truncate">{rule.pattern}</span>
                <span className="text-muted-foreground">→</span>
                {editingRuleId === rule.id ? (
                  <>
                    <Input
                      value={editRuleName}
                      onChange={(e) => setEditRuleName(e.target.value)}
                      className="h-8 max-w-[14rem]"
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" onClick={() => saveRuleName(rule.id)} disabled={savingRuleName || !editRuleName.trim()}>
                      <Check size={16} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingRuleId(null)}>
                      <X size={16} />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="truncate">{rule.drive_folder_name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingRuleId(rule.id);
                        setEditRuleName(rule.drive_folder_name);
                      }}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => deleteRule(rule.id)}>
                      <Trash2 size={16} />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
              placeholder={t('admin.archiveRulePatternPlaceholder')}
            />
            <Select value={ruleFolderId} onChange={(e) => setRuleFolderId(e.target.value)}>
              <option value="">{t('admin.archiveRuleFolderPlaceholder')}</option>
              <option value="__new__">{t('admin.createNewFolder')}</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            <Button onClick={addRule} disabled={addingRule || !rulePattern.trim() || !ruleFolderId || ruleFolderId === '__new__'}>
              {addingRule ? t('common.loading') : t('admin.addRule')}
            </Button>
          </div>
          {ruleFolderId === '__new__' && (
            <div className="flex gap-2">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t('admin.newFolderNamePlaceholder')}
                autoFocus
              />
              <Button type="button" variant="outline" onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()}>
                {creatingFolder ? t('common.loading') : t('common.create')}
              </Button>
            </div>
          )}
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

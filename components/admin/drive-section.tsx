'use client';

import { useState } from 'react';
import { HardDriveUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useInvalidateSummaries } from '@/hooks/use-api';
import { useSettings, useInvalidateAdmin } from './use-admin';

interface ExportAllResult {
  exported: number;
  failed: number;
  skipped: number;
  writer: string | null;
  reauthRequired: boolean;
  sampleError: string | null;
}

export function DriveSection() {
  const t = useT();
  const { data: settings } = useSettings();
  const invalidate = useInvalidateAdmin();
  const invalidateSummaries = useInvalidateSummaries();
  const [root, setRoot] = useState<string | null>(null);
  const [writerEmail, setWriterEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportAllResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const save = async () => {
    setStatus(null);
    try {
      await api.patch('/api/admin/settings', { drive_root_folder_id: (root ?? settings?.drive_root_folder_id ?? 'root').trim() || 'root' });
      invalidate('admin-settings');
      setStatus(t('common.saved'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const saveWriter = async () => {
    setStatus(null);
    try {
      const email = (writerEmail ?? settings?.drive_writer_email ?? '').trim();
      if (!email) return;
      await api.patch('/api/admin/settings', { drive_writer_email: email });
      invalidate('admin-settings');
      setStatus(t('common.saved'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const exportAll = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const result = await api.post<ExportAllResult>('/api/admin/drive/export-all');
      setExportResult(result);
      invalidateSummaries();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  if (!settings) return <p className="text-muted-foreground">{t('common.loading')}</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-3 max-w-xl">
          <div className="space-y-1">
            <Label>{t('admin.driveWriter')}</Label>
            <Input value={writerEmail ?? settings.drive_writer_email} onChange={(e) => setWriterEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('admin.driveWriterHint')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveWriter}>{t('common.save')}</Button>
            {status && <span className="text-sm text-muted-foreground">{status}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3 max-w-xl">
          <div className="space-y-1">
            <Label>{t('admin.driveRoot')}</Label>
            <Input value={root ?? settings.drive_root_folder_id} onChange={(e) => setRoot(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('admin.driveRootHint')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save}>{t('common.save')}</Button>
            {status && <span className="text-sm text-muted-foreground">{status}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.exportAllToDrive')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Saves every summary as a Google Doc under &quot;Data Manager / Summaries&quot; in the connected admin&apos;s Drive, filed
            additionally under a subfolder for each tag it has.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={exportAll} disabled={exporting}>
            <HardDriveUpload size={16} className="mr-1" />
            {exporting ? t('admin.exportingAll') : t('admin.exportAllToDrive')}
          </Button>
          {exportError && <p className="text-sm text-destructive">{exportError}</p>}
          {exportResult && (
            <div className="text-sm space-y-1">
              {exportResult.writer ? (
                <p className="text-muted-foreground">
                  {t('admin.driveWriter')}: <span className="font-medium">{exportResult.writer}</span>
                </p>
              ) : (
                <p className="text-destructive">{t('admin.driveWriterMissing')}</p>
              )}
              <p>
                {t('admin.exportResults')}: {exportResult.exported} {t('admin.exported')}, {exportResult.skipped} {t('admin.skipped')},{' '}
                {exportResult.failed} {t('admin.failed')}
              </p>
              {exportResult.reauthRequired && (
                <p className="text-destructive font-medium">{t('admin.driveReauthRequired')}</p>
              )}
              {exportResult.sampleError && !exportResult.reauthRequired && (
                <p className="text-destructive">{exportResult.sampleError}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

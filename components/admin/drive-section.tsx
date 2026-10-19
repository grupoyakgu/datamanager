'use client';

import { useState } from 'react';
import { HardDriveUpload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useInvalidateSummaries } from '@/hooks/use-api';

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
  const invalidateSummaries = useInvalidateSummaries();
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportAllResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearResult, setClearResult] = useState<string | null>(null);

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

  const clearSummaries = async () => {
    if (!confirm(t('admin.summariesClearConfirm'))) return;
    setClearing(true);
    setClearError(null);
    setClearResult(null);
    try {
      const result = await api.post<{ deleted: number; filesDeleted: number; tagsDeleted: number }>('/api/admin/summaries/clear');
      setClearResult(
        `${result.deleted} ${t('admin.summariesClearDeleted')}, ${result.filesDeleted} ${t('admin.archiveClearFilesDeleted')}, ${result.tagsDeleted} ${t('admin.archiveClearTagsDeleted')}`
      );
      invalidateSummaries();
    } catch (err) {
      setClearError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.exportAllToDrive')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.summariesDriveHint')}</p>
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
                  {t('admin.archiveMailbox')}: <span className="font-medium">{exportResult.writer}</span>
                </p>
              ) : (
                <p className="text-destructive">{t('admin.archiveMailboxNotSignedIn')}</p>
              )}
              <p>
                {t('admin.exportResults')}: {exportResult.exported} {t('admin.exported')}, {exportResult.skipped} {t('admin.skipped')},{' '}
                {exportResult.failed} {t('admin.failed')}
              </p>
              {exportResult.reauthRequired && <p className="text-destructive font-medium">{t('admin.driveReauthRequired')}</p>}
              {exportResult.sampleError && !exportResult.reauthRequired && <p className="text-destructive">{exportResult.sampleError}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t('admin.summariesClearTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.summariesClearHint')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {clearError && <p className="text-sm text-destructive">{clearError}</p>}
          {clearResult && <p className="text-sm text-muted-foreground">{clearResult}</p>}
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={clearSummaries} disabled={clearing}>
            <Trash2 size={16} className="mr-1" />
            {clearing ? t('common.loading') : t('admin.summariesClearButton')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

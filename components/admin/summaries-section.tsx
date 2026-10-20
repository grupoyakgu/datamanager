'use client';

import { useState } from 'react';
import { Check, HardDriveUpload, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useInvalidateSummaries } from '@/hooks/use-api';
import { DEFAULT_SETTINGS, type AppSettings, type CompletenessWeights } from '@/lib/settings';
import { useSettings, useInvalidateAdmin, useSummaryFolderRules } from './use-admin';

const WEIGHT_KEYS = Object.keys(DEFAULT_SETTINGS.completeness_weights) as (keyof CompletenessWeights)[];

interface ExportAllResult {
  exported: number;
  failed: number;
  skipped: number;
  writer: string | null;
  reauthRequired: boolean;
  sampleError: string | null;
}

export function SummariesSection() {
  const t = useT();
  const { data: settings } = useSettings();
  if (!settings) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  return <SummariesForm key={settings.completeness_weights.meeting_date + settings.extraction_fields.join(',')} settings={settings} />;
}

function SummariesForm({ settings }: { settings: AppSettings }) {
  const t = useT();
  const invalidateAdmin = useInvalidateAdmin();
  const invalidateSummaries = useInvalidateSummaries();
  const { data: folderRules } = useSummaryFolderRules();
  const [weights, setWeights] = useState<CompletenessWeights>(settings.completeness_weights);
  const [fields, setFields] = useState<string[]>(settings.extraction_fields);
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportAllResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearResult, setClearResult] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editRuleName, setEditRuleName] = useState('');
  const [savingRuleName, setSavingRuleName] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const total = WEIGHT_KEYS.reduce((sum, k) => sum + (Number(weights[k]) || 0), 0);

  const saveAiSettings = async () => {
    try {
      await api.patch('/api/admin/settings', { completeness_weights: weights, extraction_fields: fields });
      invalidateAdmin('admin-settings');
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

  const clearSummaries = async () => {
    if (!confirm(t('admin.summariesClearConfirm'))) return;
    setClearing(true);
    setClearError(null);
    setClearResult(null);
    try {
      const result = await api.post<{ deleted: number; filesDeleted: number; tagsDeleted: number; rulesCleared: number }>(
        '/api/admin/summaries/clear'
      );
      setClearResult(
        `${result.deleted} ${t('admin.summariesClearDeleted')}, ${result.filesDeleted} ${t('admin.archiveClearFilesDeleted')}, ${result.tagsDeleted} ${t('admin.archiveClearTagsDeleted')}, ${result.rulesCleared} ${t('admin.archiveClearRulesCleared')}`
      );
      invalidateSummaries();
      invalidateAdmin('summary-folder-rules');
    } catch (err) {
      setClearError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setClearing(false);
    }
  };

  const saveRuleName = async (id: string) => {
    const name = editRuleName.trim();
    if (!name) return;
    setRuleError(null);
    setSavingRuleName(true);
    try {
      await api.patch(`/api/admin/summary-folder-rules/${id}`, { driveFolderName: name });
      invalidateAdmin('summary-folder-rules');
      invalidateSummaries();
      setEditingRuleId(null);
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingRuleName(false);
    }
  };

  const deleteRule = async (id: string) => {
    setRuleError(null);
    try {
      await api.delete(`/api/admin/summary-folder-rules/${id}`);
      invalidateAdmin('summary-folder-rules');
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('admin.summariesIntro')}</p>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.extractionFields')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {DEFAULT_SETTINGS.extraction_fields.map((field) => (
            <label key={field} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fields.includes(field)}
                onChange={(e) => setFields(e.target.checked ? [...fields, field] : fields.filter((f) => f !== field))}
              />
              {t(`admin.extractionFieldLabels.${field}`)}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.completenessWeights')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.completenessHint')}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {WEIGHT_KEYS.map((key) => (
            <div key={key} className="space-y-1">
              <Label>{t(`missingFields.${key}`)}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={weights[key]}
                onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
          <p className="col-span-full text-sm text-muted-foreground">Total: {total}</p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={saveAiSettings}>{t('common.save')}</Button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.summaryFolderRules')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.summaryFolderRulesHint')}</p>
        </CardHeader>
        <CardContent className="space-y-2 max-w-2xl">
          {ruleError && <p className="text-sm text-destructive">{ruleError}</p>}
          {(folderRules ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t('admin.summaryFolderRulesEmpty')}</p>}
          {folderRules?.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
              <span className="font-medium truncate">{rule.pattern}</span>
              <span className="text-muted-foreground">→</span>
              {editingRuleId === rule.id ? (
                <>
                  <Input value={editRuleName} onChange={(e) => setEditRuleName(e.target.value)} className="h-8 max-w-[14rem]" autoFocus />
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

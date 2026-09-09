'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { DEFAULT_SETTINGS, type AppSettings, type CompletenessWeights } from '@/lib/settings';
import { useSettings, useInvalidateAdmin } from './use-admin';

const WEIGHT_KEYS = Object.keys(DEFAULT_SETTINGS.completeness_weights) as (keyof CompletenessWeights)[];

export function AiSection() {
  const t = useT();
  const { data: settings } = useSettings();
  if (!settings) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  return <AiForm key={settings.completeness_weights.meeting_date + settings.extraction_fields.join(',')} settings={settings} />;
}

function AiForm({ settings }: { settings: AppSettings }) {
  const t = useT();
  const invalidate = useInvalidateAdmin();
  const [weights, setWeights] = useState<CompletenessWeights>(settings.completeness_weights);
  const [fields, setFields] = useState<string[]>(settings.extraction_fields);
  const [status, setStatus] = useState<string | null>(null);

  const total = WEIGHT_KEYS.reduce((sum, k) => sum + (Number(weights[k]) || 0), 0);

  const save = async () => {
    try {
      await api.patch('/api/admin/settings', { completeness_weights: weights, extraction_fields: fields });
      invalidate('admin-settings');
      setStatus(t('common.saved'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <div className="space-y-6">
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
              {field}
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
        <Button onClick={save}>{t('common.save')}</Button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>
    </div>
  );
}

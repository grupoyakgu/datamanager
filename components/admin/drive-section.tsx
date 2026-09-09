'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useSettings, useInvalidateAdmin } from './use-admin';

export function DriveSection() {
  const t = useT();
  const { data: settings } = useSettings();
  const invalidate = useInvalidateAdmin();
  const [root, setRoot] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const save = async () => {
    try {
      await api.patch('/api/admin/settings', { drive_root_folder_id: (root ?? settings?.drive_root_folder_id ?? 'root').trim() || 'root' });
      invalidate('admin-settings');
      setStatus(t('common.saved'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('common.error'));
    }
  };

  if (!settings) return <p className="text-muted-foreground">{t('common.loading')}</p>;

  return (
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
  );
}

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useSettings, useInvalidateAdmin, splitList } from './use-admin';
import type { AuditLog } from '@/types/database';

type AuditRow = AuditLog & { user: { name: string | null; email: string } | null };

export function SystemSection() {
  const t = useT();
  const { data: settings } = useSettings();
  const invalidate = useInvalidateAdmin();
  const [admins, setAdmins] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { data: logs } = useQuery({ queryKey: ['audit-logs'], queryFn: () => api.get<AuditRow[]>('/api/admin/audit-logs?limit=100') });

  const save = async () => {
    try {
      await api.patch('/api/admin/settings', { admin_emails: splitList((admins ?? settings?.admin_emails.join(', ') ?? '').toLowerCase()) });
      invalidate('admin-settings');
      setStatus(t('common.saved'));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <div className="space-y-6">
      {settings && (
        <Card>
          <CardContent className="pt-5 space-y-3 max-w-xl">
            <div className="space-y-1">
              <Label>{t('admin.adminEmails')}</Label>
              <Input value={admins ?? settings.admin_emails.join(', ')} onChange={(e) => setAdmins(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={save}>{t('common.save')}</Button>
              {status && <span className="text-sm text-muted-foreground">{status}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.auditLog')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>{t('admin.when')}</TH>
                <TH>{t('admin.user')}</TH>
                <TH>{t('admin.action')}</TH>
                <TH>{t('admin.resource')}</TH>
              </TR>
            </THead>
            <TBody>
              {logs?.map((log) => (
                <TR key={log.id}>
                  <TD className="text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TD>
                  <TD>{log.user?.name ?? log.user?.email ?? '—'}</TD>
                  <TD className="font-mono text-xs">{log.action}</TD>
                  <TD className="text-muted-foreground text-xs">
                    {log.resource_type} {log.resource_id !== '*' && log.resource_id.slice(0, 8)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

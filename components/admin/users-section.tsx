'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useUser } from '@/hooks/use-user';
import { useAdminUsers, useInvalidateAdmin, type AdminUser } from './use-admin';

export function GmailStatusBadge({ user }: { user: AdminUser }) {
  const t = useT();
  if (user.gmail_status === 'connected') return <Badge variant="success">{t('admin.connected')}</Badge>;
  if (user.gmail_status === 'authorization_required') return <Badge variant="danger">🔴 {t('admin.authRequired')}</Badge>;
  return <Badge variant="secondary">{t('admin.disconnected')}</Badge>;
}

export function UsersSection() {
  const t = useT();
  const { user: me } = useUser();
  const { data: users, isLoading } = useAdminUsers();
  const invalidate = useInvalidateAdmin();
  const [error, setError] = useState<string | null>(null);

  const update = async (id: string, patch: { status?: string; role?: string }) => {
    setError(null);
    try {
      await api.patch(`/api/admin/users/${id}`, patch);
      invalidate('admin-users');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  if (isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Table>
        <THead>
          <TR>
            <TH>{t('admin.user')}</TH>
            <TH>{t('admin.email')}</TH>
            <TH>{t('admin.role')}</TH>
            <TH>{t('admin.gmailStatus')}</TH>
            <TH>{t('admin.lastSync')}</TH>
            <TH>{t('admin.status')}</TH>
            <TH>{t('common.actions')}</TH>
          </TR>
        </THead>
        <TBody>
          {users?.map((u) => (
            <TR key={u.id}>
              <TD className="font-medium">{u.name ?? '—'}</TD>
              <TD className="text-muted-foreground">{u.email}</TD>
              <TD>{u.role}</TD>
              <TD><GmailStatusBadge user={u} /></TD>
              <TD className="text-muted-foreground">{u.last_gmail_sync ? new Date(u.last_gmail_sync).toLocaleString() : '—'}</TD>
              <TD>
                <Badge variant={u.status === 'active' ? 'success' : 'danger'}>
                  {u.status === 'active' ? t('admin.active') : t('admin.suspended')}
                </Badge>
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={u.id === me?.id}
                    onClick={() => update(u.id, { status: u.status === 'active' ? 'suspended' : 'active' })}
                  >
                    {u.status === 'active' ? t('admin.suspend') : t('admin.activate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={u.id === me?.id}
                    onClick={() => update(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })}
                  >
                    {u.role === 'admin' ? t('admin.makeUser') : t('admin.makeAdmin')}
                  </Button>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

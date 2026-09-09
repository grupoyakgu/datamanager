'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import type { SummaryView } from '@/types/database';

export function SendEmailDialog({ summary, open, onClose }: { summary: SummaryView; open: boolean; onClose: () => void }) {
  const t = useT();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(summary.title);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    setSending(true);
    setStatus(null);
    try {
      await api.post(`/api/summaries/${summary.id}/send`, { to, cc, subject, message });
      setStatus({ ok: true, text: t('email.sent') });
      setTimeout(onClose, 1200);
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : t('common.error') });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('summaries.sendByEmail')} description={t('email.hint')}>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="email-to">{t('email.to')}</Label>
          <Input id="email-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com, other@company.com" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email-cc">{t('email.cc')}</Label>
          <Input id="email-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email-subject">{t('email.subject')}</Label>
          <Input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email-message">{t('email.message')}</Label>
          <Textarea id="email-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
        </div>
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground max-h-32 overflow-auto whitespace-pre-wrap">
          {summary.content.slice(0, 600)}
          {summary.content.length > 600 && '…'}
        </div>
        {status && <p className={status.ok ? 'text-sm text-emerald-600' : 'text-sm text-destructive'}>{status.text}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={send} disabled={sending || !to.trim()}>
            {sending ? t('login.signingIn').replace('Signing in', 'Sending') : t('email.sendSummary')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

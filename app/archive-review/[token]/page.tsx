'use client';

import { use, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n/context';

interface TokenInfo {
  title: string;
  subject: string;
}

/**
 * Public, unauthenticated page (outside the (app) layout, no sidebar, no
 * login required) — reached from the "Action needed" email sent when an
 * archived item had no "tags:project_name" line to route by. The token
 * alone authorizes this one action; the sender has no account here.
 */
export default function ArchiveReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useT();
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/archive/assign/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t('archiveReview.invalidLink'));
        return res.json() as Promise<TokenInfo>;
      })
      .then(setInfo)
      .catch((err) => setLoadError(err instanceof Error ? err.message : t('archiveReview.invalidLink')));
  }, [token, t]);

  const submit = async () => {
    const name = projectName.trim();
    if (!name) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/archive/assign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t('common.error'));
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold">Grupo Yakgu</h1>
            <p className="text-sm text-muted-foreground">Data Manager</p>
          </div>
          <CardTitle>{t('archiveReview.title')}</CardTitle>
          <CardDescription>{t('archiveReview.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError ? (
            <p className="text-sm text-destructive text-center">{loadError}</p>
          ) : done ? (
            <p className="text-sm text-center text-emerald-600 dark:text-emerald-400">{t('archiveReview.done')}</p>
          ) : !info ? (
            <p className="text-sm text-muted-foreground text-center">{t('common.loading')}</p>
          ) : (
            <>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">{t('archive.subject')}</p>
                <p className="font-medium break-words">{info.subject || info.title}</p>
              </div>
              <div className="space-y-1">
                <Label>{t('archiveReview.projectLabel')}</Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={t('archiveReview.projectPlaceholder')}
                  autoFocus
                />
              </div>
              {submitError && <p className="text-sm text-destructive">{submitError}</p>}
              <Button onClick={submit} disabled={submitting || !projectName.trim()} className="w-full">
                {submitting ? t('common.loading') : t('archiveReview.submit')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

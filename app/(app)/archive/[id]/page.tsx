'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Mail, Paperclip, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LinkifiedText } from '@/components/summaries/linkified-text';
import { formatDate } from '@/components/summaries/summary-card';
import { EmptyState } from '@/components/layout/page-header';
import { useArchiveItem, useInvalidateArchive } from '@/hooks/use-archive';
import { useUser } from '@/hooks/use-user';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';

export default function ArchiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const router = useRouter();
  const { user } = useUser();
  const { data: item, isLoading, error } = useArchiveItem(id);
  const invalidate = useInvalidateArchive();
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (error || !item) return <EmptyState>{t('archive.notFound')}</EmptyState>;

  const deleteItem = async () => {
    if (!confirm(t('archive.confirmDelete'))) return;
    setDeleting(true);
    try {
      await api.delete(`/api/archive/${item.id}`);
      invalidate();
      router.push('/archive');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.error'));
      setDeleting(false);
    }
  };

  const senderLabel = item.original_sender_name || item.original_sender_email;

  return (
    <div className="space-y-6">
      <Link href="/archive" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> {t('common.back')}
      </Link>

      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight min-w-0 flex-1 break-words">{item.title}</h1>
          {user?.role === 'admin' && (
            <Button variant="outline" className="text-destructive hover:text-destructive shrink-0" onClick={deleteItem} disabled={deleting}>
              <Trash2 size={16} className="mr-1" />
              {deleting ? t('common.loading') : t('common.delete')}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar size={16} /> {formatDate(item.email_received_at) ?? '—'}
          </span>
          {senderLabel && (
            <span className="inline-flex items-center gap-1">
              <Mail size={16} /> {senderLabel}
            </span>
          )}
        </div>

        {item.drive_sync_error && (
          <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{item.drive_sync_error}</span>
          </div>
        )}
        {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('summaries.content')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap leading-relaxed text-sm break-words" dir="auto">
                <LinkifiedText text={item.body_text} />
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardContent className="pt-5 text-sm space-y-2">
              <Row label={t('archive.subject')} value={item.subject} />
              {item.original_sender_name && <Row label={t('archive.originalSender')} value={item.original_sender_name} />}
              {item.original_sender_email && <Row label={t('archive.originalSenderEmail')} value={item.original_sender_email} />}
              {item.is_forward && item.forwarded_by_name && <Row label={t('archive.forwardedBy')} value={item.forwarded_by_name} />}
              {item.is_forward && item.forwarded_by_email && <Row label={t('archive.forwardedByEmail')} value={item.forwarded_by_email} />}

              {item.attachments.length > 0 && (
                <div className="pt-2 border-t border-border space-y-1">
                  <span className="text-muted-foreground">{t('summaries.attachments')}</span>
                  <ul className="space-y-1">
                    {item.attachments.map((attachment) => (
                      <li key={attachment.id} className="flex items-center gap-1.5 text-xs">
                        <Paperclip size={12} className="shrink-0 text-muted-foreground" />
                        {attachment.driveUrl ? (
                          <a
                            href={attachment.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline truncate inline-flex items-center gap-1"
                          >
                            {attachment.filename} <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="truncate text-muted-foreground">{attachment.filename}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right truncate">{value}</span>
    </div>
  );
}

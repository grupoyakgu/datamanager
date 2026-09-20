'use client';

import Link from 'next/link';
import { Calendar, Paperclip, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/components/summaries/summary-card';
import { useT } from '@/lib/i18n/context';
import type { ArchiveItemView } from '@/types/database';

export function ArchiveCard({ item }: { item: ArchiveItemView }) {
  const t = useT();
  const senderLabel = item.original_sender_name || item.original_sender_email;

  return (
    <Link href={`/archive/${item.id}`} className="block min-w-0">
      <Card className="hover:shadow-md hover:border-primary/40 transition-shadow">
        <CardContent className="pt-4">
          <span className="font-medium line-clamp-1 min-w-0 block">{item.title}</span>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar size={14} />
              {formatDate(item.email_received_at) ?? '—'}
            </span>
            {senderLabel && (
              <span className="inline-flex items-center gap-1 truncate max-w-[14rem]">
                <User size={14} />
                {senderLabel}
              </span>
            )}
            {item.attachments.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip size={14} />
                {item.attachments.length}
              </span>
            )}
            {item.is_forward && (
              <Badge variant="secondary" className="ml-auto">
                {t('archive.forwarded')}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

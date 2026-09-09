'use client';

import Link from 'next/link';
import { Calendar, Users, Tag as TagIcon, Folder, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CompletenessBadge } from './completeness-badge';
import { useToggleFavorite } from '@/hooks/use-api';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import type { SummaryView } from '@/types/database';

export function formatDate(value: string | null | undefined, locale = 'es-ES') {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale);
}

export function SummaryCard({ summary, compact = false }: { summary: SummaryView; compact?: boolean }) {
  const t = useT();
  const toggleFavorite = useToggleFavorite();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className={cn('pt-4', compact && 'pb-4')}>
        <div className="flex items-start justify-between gap-3">
          <Link href={`/summaries/${summary.id}`} className="font-medium hover:underline line-clamp-2">
            {summary.title}
          </Link>
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-amber-500"
            onClick={() => toggleFavorite.mutate({ id: summary.id, isFavorite: summary.is_favorite })}
            aria-label={summary.is_favorite ? t('summaries.unfavorite') : t('summaries.favorite')}
          >
            <Star size={18} className={cn(summary.is_favorite && 'fill-amber-400 text-amber-500')} />
          </button>
        </div>

        {!compact && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{summary.content}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar size={14} />
            {formatDate(summary.meeting_date) ?? t('summaries.noDate')}
          </span>
          {summary.participants.length > 0 && (
            <span className="inline-flex items-center gap-1 truncate max-w-[16rem]">
              <Users size={14} />
              {summary.participants.slice(0, 3).join(', ')}
              {summary.participants.length > 3 && ` +${summary.participants.length - 3}`}
            </span>
          )}
          {summary.tags.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <TagIcon size={14} />
              {summary.tags.map((tag) => tag.name).join(', ')}
            </span>
          )}
          {summary.folder && (
            <span className="inline-flex items-center gap-1">
              <Folder size={14} />
              {summary.folder.name}
            </span>
          )}
          <CompletenessBadge score={summary.completeness_score} className="ml-auto" />
        </div>
      </CardContent>
    </Card>
  );
}

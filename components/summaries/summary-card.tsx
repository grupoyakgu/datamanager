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

/** Join up to `max` items, appending a "+N" count for the rest. */
function summarizeList(items: string[], max: number): string {
  if (items.length === 0) return '';
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown} +${items.length - max}` : shown;
}

/**
 * Cap the preview to a fixed character count on top of the CSS line-clamp.
 * A short DOM string can never blow out a flex/grid item's intrinsic width,
 * so this is a second line of defense independent of any layout quirk.
 */
function previewText(content: string, max = 140): string {
  const trimmed = content.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

/**
 * A compact, bounded-height preview card. The whole card opens the full
 * summary; only the star button intercepts the click to toggle favorites.
 */
export function SummaryCard({ summary, compact = false }: { summary: SummaryView; compact?: boolean }) {
  const t = useT();
  const toggleFavorite = useToggleFavorite();

  return (
    <Link href={`/summaries/${summary.id}`} className="block min-w-0">
      <Card className="hover:shadow-md hover:border-primary/40 transition-shadow">
        <CardContent className={cn('pt-4', compact && 'pb-4')}>
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium line-clamp-1 min-w-0 flex-1">{summary.title}</span>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-amber-500"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite.mutate({ id: summary.id, isFavorite: summary.is_favorite });
              }}
              aria-label={summary.is_favorite ? t('summaries.unfavorite') : t('summaries.favorite')}
            >
              <Star size={18} className={cn(summary.is_favorite && 'fill-amber-400 text-amber-500')} />
            </button>
          </div>

          {!compact && summary.content && (
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-1 min-w-0">{previewText(summary.content)}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar size={14} />
              {formatDate(summary.meeting_date) ?? t('summaries.noDate')}
            </span>
            {summary.participants.length > 0 && (
              <span className="inline-flex items-center gap-1 truncate max-w-[12rem]">
                <Users size={14} />
                {summarizeList(summary.participants, 2)}
              </span>
            )}
            {summary.tags.length > 0 && (
              <span className="inline-flex items-center gap-1 truncate max-w-[10rem]">
                <TagIcon size={14} />
                {summarizeList(summary.tags.map((tag) => tag.name), 2)}
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
    </Link>
  );
}

'use client';

import { Badge } from '@/components/ui/badge';
import { completenessLevel } from '@/lib/completeness';
import { useT } from '@/lib/i18n/context';

const variantByLevel = { high: 'success', medium: 'warning', low: 'danger' } as const;
const dotByLevel = { high: '🟢', medium: '🟡', low: '🔴' } as const;

export function CompletenessBadge({ score, className }: { score: number; className?: string }) {
  const t = useT();
  const level = completenessLevel(score);
  return (
    <Badge variant={variantByLevel[level]} className={className}>
      <span className="mr-1">{dotByLevel[level]}</span>
      {score}% {t('summaries.complete')}
    </Badge>
  );
}

export function MissingList({ missing }: { missing: string[] }) {
  const t = useT();
  if (missing.length === 0) return null;
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{t('summaries.missing')}:</span>
      <ul className="list-disc list-inside mt-1 space-y-0.5">
        {missing.map((m) => (
          <li key={m}>{t(`missingFields.${m}`)}</li>
        ))}
      </ul>
    </div>
  );
}

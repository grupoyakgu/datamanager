'use client';

import Link from 'next/link';
import { Tag as TagIcon } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { useTags } from '@/hooks/use-api';
import { useT } from '@/lib/i18n/context';

export default function TagsPage() {
  const t = useT();
  const { data: tags, isLoading } = useTags();

  return (
    <div>
      <PageHeader title={t('tags.title')} subtitle={t('tags.subtitle')} />
      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : !tags || tags.length === 0 ? (
        <EmptyState>{t('common.noResults')}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tags.map((tag) => (
            <Link key={tag.id} href={`/summaries?tagId=${tag.id}`}>
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="pt-5 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <TagIcon size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{tag.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {tag.summary_count} {t('tags.summaries')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

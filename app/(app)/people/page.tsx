'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/components/summaries/summary-card';
import { api } from '@/lib/api-client';
import { useUser } from '@/hooks/use-user';
import { useT } from '@/lib/i18n/context';

interface Person {
  name: string;
  meetings: number;
  lastMeeting: string | null;
}

export default function PeoplePage() {
  const t = useT();
  const { user } = useUser();
  const { data: people, isLoading } = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<Person[]>('/api/people'),
    enabled: !!user,
  });

  return (
    <div>
      <PageHeader title={t('people.title')} subtitle={t('people.subtitle')} />
      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : !people || people.length === 0 ? (
        <EmptyState>{t('people.empty')}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {people.map((person) => (
            <Link key={person.name} href={`/summaries?participant=${encodeURIComponent(person.name)}`}>
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="pt-5 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-semibold">
                    {person.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{person.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {person.meetings} {t('people.meetings')}
                      {person.lastMeeting && ` · ${t('people.lastMeeting')}: ${formatDate(person.lastMeeting)}`}
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

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/hooks/use-user';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { apiFetch } from '@/lib/api-client';
import type { MeetingSummary } from '@/types/database';

export default function SummariesPage() {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  const getSummaries = () => apiFetch<MeetingSummary[]>('/api/summaries');

  const { data: summaries, isLoading } = useQuery({
    queryKey: ['summaries'],
    queryFn: getSummaries,
    enabled: !!user,
  });

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col md:ml-0 ml-20">
        <Header />
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold">Meeting Summaries</h1>
                <p className="text-muted-foreground mt-1">
                  View and manage all meeting summaries
                </p>
              </div>

              {isLoading ? (
                <div>Loading summaries...</div>
              ) : summaries && summaries.length > 0 ? (
                <div className="grid gap-4">
                  {summaries.map((summary) => (
                    <Card
                      key={summary.id}
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                    >
                      <CardHeader>
                        <CardTitle className="text-lg">
                          {summary.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {summary.content}
                        </p>
                        <div className="flex items-center justify-between mt-4">
                          <span className="text-xs text-muted-foreground">
                            {new Date(summary.created_at).toLocaleDateString()}
                          </span>
                          <span className="text-xs font-semibold">
                            {summary.completeness_score}% Complete
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    No summaries yet. Connect your Gmail to get started.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

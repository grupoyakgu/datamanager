'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/hooks/use-user';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

interface DashboardStats {
  newSummaries: number;
  incompleteSummaries: number;
  meetingsThisMonth: number;
  openActionItems: number;
  recentSummaries: { id: string; title: string; created_at: string }[];
  missingSummaries: { id: string; title: string; completeness_score: number }[];
}

export default function DashboardPage() {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  const getDashboardStats = () => apiFetch<DashboardStats>('/api/dashboard/stats');

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    enabled: !!user,
  });

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Good {getGreeting()}, {user.name}</h1>
        <p className="text-muted-foreground mt-1">Welcome to the Grupo Yakgu Data Manager</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="New Summaries"
          value={stats?.newSummaries || 0}
          description="This month"
        />
        <StatCard
          label="Incomplete Summaries"
          value={stats?.incompleteSummaries || 0}
          description="Need attention"
        />
        <StatCard
          label="Meetings This Month"
          value={stats?.meetingsThisMonth || 0}
          description="Tracked meetings"
        />
        <StatCard
          label="Open Action Items"
          value={stats?.openActionItems || 0}
          description="To be completed"
        />
      </div>

      {/* Recent Summaries and Missing Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Summaries</h2>
          <div className="space-y-3">
            {stats?.recentSummaries?.map((summary) => (
              <Card key={summary.id} className="cursor-pointer hover:bg-accent">
                <CardContent className="pt-4">
                  <p className="font-medium">{summary.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(summary.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Missing Information</h2>
          <div className="space-y-3">
            {stats?.missingSummaries?.map((summary) => (
              <Card key={summary.id} className="cursor-pointer hover:bg-accent border-yellow-200">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{summary.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {summary.completeness_score}% complete
                      </p>
                    </div>
                    <span className="text-yellow-600 font-semibold">!</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Search */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Search</CardTitle>
          <CardDescription>Ask anything about Yakgu...</CardDescription>
        </CardHeader>
        <CardContent>
          <input
            type="text"
            placeholder="Search summaries, people, or projects..."
            className="w-full px-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, description }: { label: string; value: number; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      </CardContent>
    </Card>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

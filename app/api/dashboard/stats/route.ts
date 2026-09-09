import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getFavoriteIds, SUMMARY_SELECT, toSummaryView } from '@/lib/summaries/repository';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  const { user } = await requireUser(request);
  const supabaseAdmin = getSupabaseAdmin();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();
  const monthStartDate = monthStartIso.slice(0, 10);

  const [newSummaries, incomplete, meetingsThisMonth, recent, missing, recentMeetings, actions, favorites] =
    await Promise.all([
      supabaseAdmin.from('meeting_summaries').select('id', { count: 'exact', head: true }).gte('created_at', monthStartIso),
      supabaseAdmin.from('meeting_summaries').select('id', { count: 'exact', head: true }).lt('completeness_score', 90),
      supabaseAdmin.from('meeting_summaries').select('id', { count: 'exact', head: true }).gte('meeting_date', monthStartDate),
      supabaseAdmin.from('meeting_summaries').select(SUMMARY_SELECT).order('created_at', { ascending: false }).limit(5),
      supabaseAdmin
        .from('meeting_summaries')
        .select(SUMMARY_SELECT)
        .lt('completeness_score', 90)
        .order('completeness_score', { ascending: true })
        .limit(5),
      supabaseAdmin
        .from('meeting_summaries')
        .select(SUMMARY_SELECT)
        .not('meeting_date', 'is', null)
        .order('meeting_date', { ascending: false })
        .limit(5),
      supabaseAdmin.from('extracted_data').select('action_items'),
      getFavoriteIds(user.id),
    ]);

  const openActionItems = (actions.data ?? []).reduce((sum, row) => sum + ((row.action_items as string[]) ?? []).length, 0);

  return NextResponse.json({
    newSummaries: newSummaries.count ?? 0,
    incompleteSummaries: incomplete.count ?? 0,
    meetingsThisMonth: meetingsThisMonth.count ?? 0,
    openActionItems,
    recentSummaries: (recent.data ?? []).map((r) => toSummaryView(r, favorites)),
    missingSummaries: (missing.data ?? []).map((r) => toSummaryView(r, favorites)),
    recentMeetings: (recentMeetings.data ?? []).map((r) => toSummaryView(r, favorites)),
  });
});

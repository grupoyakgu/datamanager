import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = data.user.id;

    // Get new summaries this month
    const monthStart = new Date();
    monthStart.setDate(1);

    const { count: newSummaries } = await supabaseAdmin
      .from('meeting_summaries')
      .select('id', { count: 'exact' })
      .eq('created_by', userId)
      .gte('created_at', monthStart.toISOString());

    // Get incomplete summaries
    const { count: incompleteSummaries } = await supabaseAdmin
      .from('meeting_summaries')
      .select('id', { count: 'exact' })
      .eq('created_by', userId)
      .lt('completeness_score', 70);

    // Get meetings this month
    const { count: meetingsThisMonth } = await supabaseAdmin
      .from('meeting_summaries')
      .select('id', { count: 'exact' })
      .eq('created_by', userId)
      .gte('meeting_date', monthStart.toISOString().split('T')[0]);

    // Get recent summaries
    const { data: recentSummaries } = await supabaseAdmin
      .from('meeting_summaries')
      .select('id, title, created_at')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get incomplete summaries (missing info)
    const { data: missingSummaries } = await supabaseAdmin
      .from('meeting_summaries')
      .select('id, title, completeness_score')
      .eq('created_by', userId)
      .lt('completeness_score', 70)
      .order('completeness_score', { ascending: true })
      .limit(5);

    return NextResponse.json({
      newSummaries: newSummaries || 0,
      incompleteSummaries: incompleteSummaries || 0,
      meetingsThisMonth: meetingsThisMonth || 0,
      openActionItems: 0, // TODO: Implement action items tracking
      recentSummaries: recentSummaries || [],
      missingSummaries: missingSummaries || [],
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

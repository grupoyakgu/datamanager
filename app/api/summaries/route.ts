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

    const { data: summaries, error: summariesError } = await supabaseAdmin
      .from('meeting_summaries')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (summariesError) throw summariesError;

    return NextResponse.json(summaries || []);
  } catch (error) {
    console.error('Error fetching summaries:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { title, content, folderId, meetingDate } = body;

    const { data: summary, error: insertError } = await supabaseAdmin
      .from('meeting_summaries')
      .insert({
        title,
        content,
        folder_id: folderId,
        meeting_date: meetingDate,
        created_by: data.user.id,
        source: 'manual',
        original_email_id: `manual-${Date.now()}`,
        completeness_score: 0,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    console.error('Error creating summary:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

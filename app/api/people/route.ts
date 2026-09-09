import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const { data, error } = await getSupabaseAdmin()
    .from('extracted_data')
    .select('participants, meeting_summaries!inner ( id, meeting_date, created_at )');
  if (error) throw new Error(error.message);

  const people = new Map<string, { name: string; meetings: number; lastMeeting: string | null }>();
  for (const row of data ?? []) {
    const summary = row.meeting_summaries as unknown as { meeting_date: string | null; created_at: string } | { meeting_date: string | null; created_at: string }[];
    const s = Array.isArray(summary) ? summary[0] : summary;
    const date = s?.meeting_date ?? s?.created_at?.slice(0, 10) ?? null;
    for (const participant of (row.participants as string[]) ?? []) {
      const key = participant.trim().toLowerCase();
      if (!key) continue;
      const entry = people.get(key) ?? { name: participant.trim(), meetings: 0, lastMeeting: null };
      entry.meetings += 1;
      if (date && (!entry.lastMeeting || date > entry.lastMeeting)) entry.lastMeeting = date;
      people.set(key, entry);
    }
  }
  const list = Array.from(people.values()).sort((a, b) => b.meetings - a.meetings || a.name.localeCompare(b.name));
  return NextResponse.json(list);
});

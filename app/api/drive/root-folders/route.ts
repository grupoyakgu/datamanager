import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Distinct Drive folder names summaries have actually been filed under (sender domains) — used to drive the "Folder" filter. */
export const GET = handleRoute(async (request: Request) => {
  await requireUser(request);
  const { data } = await getSupabaseAdmin().from('meeting_summaries').select('drive_folder_name').not('drive_folder_name', 'is', null);
  const names = Array.from(new Set((data ?? []).map((r) => r.drive_folder_name as string))).sort((a, b) => a.localeCompare(b));
  return NextResponse.json(names.map((name) => ({ id: name, name })));
});

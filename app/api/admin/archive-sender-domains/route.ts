import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listSenderDomains } from '@/lib/archive/sender-domains';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  return NextResponse.json(await listSenderDomains());
});

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ domain?: string; folderName?: string }>(request);
  const domain = body.domain?.trim().toLowerCase().replace(/^@/, '');
  const folderName = body.folderName?.trim();
  if (!domain) throw new HttpError(400, 'domain is required');
  if (!folderName) throw new HttpError(400, 'folderName is required');

  const { data, error } = await getSupabaseAdmin()
    .from('archive_sender_domains')
    .insert({ domain, folder_name: folderName })
    .select('*')
    .single();
  if (error) throw new HttpError(error.code === '23505' ? 409 : 500, error.message);

  await logAudit(user.id, 'archive_sender_domain.created', 'archive_sender_domain', data.id, { domain, folderName });
  return NextResponse.json(data, { status: 201 });
});

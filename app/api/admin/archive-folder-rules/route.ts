import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listArchiveFolderRules } from '@/lib/archive/folder-rules';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request: Request) => {
  await requireAdmin(request);
  return NextResponse.json(await listArchiveFolderRules());
});

export const POST = handleRoute(async (request: Request) => {
  const { user } = await requireAdmin(request);
  const body = await readJson<{ pattern?: string; driveFolderId?: string; driveFolderName?: string }>(request);

  const raw = body.pattern?.trim().toLowerCase();
  if (!raw) throw new HttpError(400, 'pattern is required');
  if (!body.driveFolderId?.trim()) throw new HttpError(400, 'driveFolderId is required');

  // A bare domain ("cm4arquitectos.com") routes any sender at that domain;
  // a full address ("cris@grupoyakgu.es") is more specific and wins over it.
  const patternType: 'email' | 'domain' = raw.includes('@') ? 'email' : 'domain';
  const pattern = patternType === 'domain' ? raw.replace(/^@/, '') : raw;

  const { data, error } = await getSupabaseAdmin()
    .from('archive_folder_rules')
    .insert({
      pattern,
      pattern_type: patternType,
      drive_folder_id: body.driveFolderId.trim(),
      drive_folder_name: body.driveFolderName?.trim() || body.driveFolderId.trim(),
    })
    .select('*')
    .single();
  if (error) throw new HttpError(error.code === '23505' ? 409 : 500, error.message);

  await logAudit(user.id, 'archive_folder_rule.created', 'archive_folder_rule', data.id, { pattern });
  return NextResponse.json(data, { status: 201 });
});

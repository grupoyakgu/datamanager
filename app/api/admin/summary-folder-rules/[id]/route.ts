import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { renameFile } from '@/lib/google/drive';
import { getArchiveMailboxUser } from '@/lib/archive/sync';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Rename a rule's display name — and the actual Drive folder it points to, so the Summaries table reflects it too. */
export const PATCH = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const body = await readJson<{ driveFolderName?: string }>(request);
  const name = body.driveFolderName?.trim();
  if (!name) throw new HttpError(400, 'driveFolderName is required');

  const supabaseAdmin = getSupabaseAdmin();
  const { data: rule } = await supabaseAdmin.from('summary_folder_rules').select('*').eq('id', id).maybeSingle();
  if (!rule) throw new HttpError(404, 'Rule not found');

  const mailboxUser = await getArchiveMailboxUser();
  if (mailboxUser) {
    try {
      await renameFile(mailboxUser.id, rule.drive_folder_id, name);
    } catch (error) {
      console.error('Failed to rename Drive folder', rule.drive_folder_id, error);
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('summary_folder_rules')
    .update({ drive_folder_name: name })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new HttpError(500, error.message);

  await logAudit(user.id, 'summary_folder_rule.renamed', 'summary_folder_rule', id, { name });

  // Any summaries already filed under this rule's old display name should
  // reflect the rename too, not just newly-exported ones.
  await supabaseAdmin.from('meeting_summaries').update({ drive_folder_name: name }).eq('drive_folder_name', rule.drive_folder_name);

  return NextResponse.json(updated);
});

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('summary_folder_rules').delete().eq('id', id);
  if (error) throw new HttpError(500, error.message);
  await logAudit(user.id, 'summary_folder_rule.deleted', 'summary_folder_rule', id);
  return NextResponse.json({ ok: true });
});

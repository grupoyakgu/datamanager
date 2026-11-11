import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { renameSenderDomainSubfolders } from '@/lib/archive/sender-domains';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Rename a configured domain's subfolder display name (the domain itself can't be changed — delete and re-add instead). */
export const PATCH = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const body = await readJson<{ folderName?: string }>(request);
  const folderName = body.folderName?.trim();
  if (!folderName) throw new HttpError(400, 'folderName is required');

  const { data: existing } = await getSupabaseAdmin().from('archive_sender_domains').select('folder_name').eq('id', id).maybeSingle();
  if (!existing) throw new HttpError(404, 'Sender domain not found');
  const oldFolderName = existing.folder_name as string;

  const { data, error } = await getSupabaseAdmin()
    .from('archive_sender_domains')
    .update({ folder_name: folderName })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new HttpError(500, error.message);

  // Best-effort: also rename every already-existing Drive subfolder created
  // under the old name, across all projects, so historical files stay found
  // under the new name instead of being orphaned (see renameSenderDomainSubfolders).
  const mailboxUser = await getArchiveMailboxUser();
  if (mailboxUser) {
    try {
      await renameSenderDomainSubfolders(mailboxUser.id, oldFolderName, folderName);
    } catch (error) {
      console.error('Failed to rename sender-domain Drive subfolders', error);
    }
  }

  await logAudit(user.id, 'archive_sender_domain.renamed', 'archive_sender_domain', id, { folderName });
  return NextResponse.json(data);
});

export const DELETE = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('archive_sender_domains').delete().eq('id', id);
  if (error) throw new HttpError(500, error.message);
  await logAudit(user.id, 'archive_sender_domain.deleted', 'archive_sender_domain', id);
  return NextResponse.json({ ok: true });
});

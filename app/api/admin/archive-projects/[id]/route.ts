import { NextResponse } from 'next/server';
import { handleRoute, HttpError, readJson } from '@/lib/http';
import { requireAdmin, logAudit } from '@/lib/auth';
import { renameFile } from '@/lib/google/drive';
import { getArchiveMailboxUser } from '@/lib/archive/sync';
import { renameArchiveProject } from '@/lib/archive/projects';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Rename a project's display name — and the actual Drive folder it points to. */
export const PATCH = handleRoute(async (request: Request, { params }: Params) => {
  const { user } = await requireAdmin(request);
  const { id } = await params;
  const body = await readJson<{ driveFolderName?: string }>(request);
  const name = body.driveFolderName?.trim();
  if (!name) throw new HttpError(400, 'driveFolderName is required');

  const { data: project } = await getSupabaseAdmin().from('archive_projects').select('drive_folder_id').eq('id', id).maybeSingle();
  if (!project) throw new HttpError(404, 'Project not found');

  const mailboxUser = await getArchiveMailboxUser();
  if (mailboxUser) {
    try {
      await renameFile(mailboxUser.id, project.drive_folder_id as string, name);
    } catch (error) {
      console.error('Failed to rename Drive folder', project.drive_folder_id, error);
    }
  }

  const updated = await renameArchiveProject(id, name);
  await logAudit(user.id, 'archive_project.renamed', 'archive_project', id, { name });
  return NextResponse.json(updated);
});

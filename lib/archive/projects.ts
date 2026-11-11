import { getSupabaseAdmin } from '@/lib/supabase';
import { ensureFolder } from '@/lib/google/drive';
import { getArchiveDriveRootId } from './folder-rules';
import type { ArchiveProject } from '@/types/database';

export async function listArchiveProjects(): Promise<ArchiveProject[]> {
  const { data, error } = await getSupabaseAdmin().from('archive_projects').select('*').order('name');
  if (error) {
    // 42P01 = relation does not exist — deployed before its migration landed.
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return (data ?? []) as ArchiveProject[];
}

/**
 * The project named by the first value in a sender's "tags:" line —
 * case-insensitive match against an existing project, or auto-created with
 * its own top-level Drive folder (directly under the archive root) the
 * first time that name is used. Mirrors the old per-sender folder
 * auto-create behavior, just keyed on the declared project name instead of
 * the sender's domain.
 *
 * Matches against EITHER `name` (the original tag text a project was first
 * created from — stable, never changes) OR `drive_folder_name` (the
 * admin-editable display name). The latter matters for manual re-filing:
 * the "move/assign to project" UI offers the current display name, which
 * may already have been renamed away from the original tag text — matching
 * only on `name` there would silently create a duplicate project instead of
 * reusing the existing one (the exact bug class already hit once with
 * Summaries' folder rules).
 */
export async function resolveOrCreateProject(mailboxUserId: string, rawName: string): Promise<ArchiveProject> {
  const name = rawName.trim();
  const supabaseAdmin = getSupabaseAdmin();
  const escaped = name.replace(/[%_,]/g, '\\$&');
  const { data: existing } = await supabaseAdmin
    .from('archive_projects')
    .select('*')
    .or(`name.ilike.${escaped},drive_folder_name.ilike.${escaped}`)
    .maybeSingle();
  if (existing) return existing as ArchiveProject;

  const root = await getArchiveDriveRootId(mailboxUserId);
  const folderId = await ensureFolder(mailboxUserId, root, name);
  const { data: inserted, error } = await supabaseAdmin
    .from('archive_projects')
    .insert({ name, drive_folder_id: folderId, drive_folder_name: name })
    .select('*')
    .single();
  if (error) {
    // Unique violation — another ingest created the same project concurrently.
    if (error.code === '23505') {
      const { data: raced } = await supabaseAdmin.from('archive_projects').select('*').ilike('name', name).maybeSingle();
      if (raced) return raced as ArchiveProject;
    }
    throw new Error(error.message);
  }
  return inserted as ArchiveProject;
}

export async function renameArchiveProject(id: string, name: string): Promise<ArchiveProject> {
  const { data, error } = await getSupabaseAdmin().from('archive_projects').update({ drive_folder_name: name }).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return data as ArchiveProject;
}

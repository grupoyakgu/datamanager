import { getSupabaseAdmin, isMissingTableError } from '@/lib/supabase';
import type { ArchiveClassificationCategory } from '@/types/database';

/** The admin-configured list of categories the classification scan looks for — see app/api/admin/archive/classify. */
export async function listClassificationCategories(): Promise<ArchiveClassificationCategory[]> {
  const { data, error } = await getSupabaseAdmin().from('archive_classification_categories').select('*').order('name');
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as ArchiveClassificationCategory[];
}

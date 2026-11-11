import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';

const TOKEN_TTL_DAYS = 14;

/** A single-use, expiring link so an external sender (who has no account in this system) can assign a project to an item flagged for having no "tags:" line. */
export async function createReviewToken(archivedItemId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await getSupabaseAdmin()
    .from('archive_review_tokens')
    .insert({ archived_item_id: archivedItemId, token, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return token;
}

export interface ReviewTokenLookup {
  archivedItemId: string;
  title: string;
  subject: string;
}

interface RawReviewTokenRow {
  archived_item_id: string;
  expires_at: string;
  used_at: string | null;
  archived_items: { title: string; subject: string } | { title: string; subject: string }[] | null;
}

/** Resolves a token to its archived item, or null if it doesn't exist, already expired, or was already used. */
export async function resolveReviewToken(token: string): Promise<ReviewTokenLookup | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('archive_review_tokens')
    .select('archived_item_id, expires_at, used_at, archived_items ( title, subject )')
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as RawReviewTokenRow;
  if (row.used_at || new Date(row.expires_at) < new Date()) return null;

  const item = Array.isArray(row.archived_items) ? (row.archived_items[0] ?? null) : row.archived_items;
  if (!item) return null;
  return { archivedItemId: row.archived_item_id, title: item.title, subject: item.subject };
}

export async function consumeReviewToken(token: string): Promise<void> {
  await getSupabaseAdmin().from('archive_review_tokens').update({ used_at: new Date().toISOString() }).eq('token', token);
}

'use client';

import { supabase } from '@/lib/supabase';

/**
 * Full scope set for Gmail + Drive access, requested only when a user opts in
 * via connectGoogleServices() — kept separate from the minimal sign-in scopes
 * in app/login/page.tsx so signing in never requires granting them.
 */
export const GOOGLE_CONNECT_SCOPES = [
  'email',
  'profile',
  // .modify (superset of .readonly) is required to move a processed Archive
  // email to Trash after it's safely saved.
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  // Full Drive access (not drive.readonly / drive.file): the app must be able
  // to find pre-existing folders the admin created by hand (e.g. "Data
  // Manager/Summaries") and create tag subfolders and Docs inside them.
  'https://www.googleapis.com/auth/drive',
].join(' ');

/**
 * Starts (or restarts) the Google OAuth flow requesting Gmail + Drive access.
 * The `google=connect` marker tells AuthReturnHandler to persist the
 * resulting Google tokens — plain sign-in round-trips never carry it, so a
 * login never accidentally marks a user as having granted Gmail/Drive access.
 */
export async function connectGoogleServices() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback?google=connect`,
      scopes: GOOGLE_CONNECT_SCOPES,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
}

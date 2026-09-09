import { supabase } from './supabase';

/** Fetch an internal API route with the current Supabase session token attached. */
export async function apiFetch<T>(input: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(input, { ...init, headers });
  if (!response.ok) {
    throw new Error(`Request to ${input} failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

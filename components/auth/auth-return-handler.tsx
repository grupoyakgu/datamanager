'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api-client';

/**
 * Completes a Google/Supabase sign-in when the browser returns to the app.
 * Handles both the PKCE `?code=` and the implicit `#access_token=` forms, on any
 * path (Supabase falls back to the Site URL when the redirect is not allow-listed),
 * stores the Google provider tokens, then sends the user to the dashboard.
 */
export function AuthReturnHandler({ fallback = '/login' }: { fallback?: string }) {
  const router = useRouter();
  const done = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const finish = async (session: Session) => {
      if (done.current) return;
      done.current = true;
      if (session.provider_token || session.provider_refresh_token) {
        try {
          await api.post('/api/auth/google-tokens', {
            provider_token: session.provider_token ?? null,
            provider_refresh_token: session.provider_refresh_token ?? null,
          });
        } catch (err) {
          console.error('Failed to store Google tokens:', err);
        }
      }
      router.replace('/dashboard');
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void finish(session);
    });

    const run = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
      if (oauthError) {
        setError(oauthError);
        return;
      }

      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          // The client may already have consumed the code via detectSessionInUrl.
          const { data: existing } = await supabase.auth.getSession();
          if (existing.session) return finish(existing.session);
          setError(exchangeError.message);
          return;
        }
        window.history.replaceState({}, '', url.pathname);
        if (data.session) return finish(data.session);
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) return finish(data.session);

      // Implicit-flow hash is processed asynchronously by supabase-js; give it a moment.
      const hasHashTokens = window.location.hash.includes('access_token');
      window.setTimeout(async () => {
        if (done.current) return;
        const { data: later } = await supabase.auth.getSession();
        if (later.session) return finish(later.session);
        if (!hasHashTokens) router.replace(fallback);
      }, hasHashTokens ? 4000 : 800);
    };

    void run();
    return () => listener.subscription.unsubscribe();
  }, [router, fallback]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-destructive">{error}</p>
        <a href="/login" className="text-sm underline">
          Back to login
        </a>
      </div>
    );
  }
  return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Signing you in...</div>;
}

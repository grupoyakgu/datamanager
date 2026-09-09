'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api-client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    const finish = async (session: Session) => {
      if (handled.current) return;
      handled.current = true;
      if (session.provider_token || session.provider_refresh_token) {
        try {
          await api.post('/api/auth/google-tokens', {
            provider_token: session.provider_token ?? null,
            provider_refresh_token: session.provider_refresh_token ?? null,
          });
        } catch (error) {
          console.error('Failed to store Google tokens:', error);
        }
      }
      router.replace('/dashboard');
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(data.session);
      else setTimeout(() => !handled.current && router.replace('/login'), 4000);
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Signing you in...</div>;
}

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/i18n/context';
import type { Language, ThemePreference, User } from '@/types/database';

interface UserContextValue {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updatePreferences: (patch: { language?: Language; theme?: ThemePreference }) => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();
  const { setLanguage } = useI18n();

  const applyPreferences = useCallback(
    (profile: User | null) => {
      if (!profile) return;
      setLanguage(profile.language ?? 'en');
      if (profile.theme) setTheme(profile.theme);
    },
    [setLanguage, setTheme]
  );

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setUser(null);
        return;
      }
      const profile = await api.get<User>('/api/me');
      setUser(profile);
      applyPreferences(profile);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyPreferences]);

  useEffect(() => {
    // INITIAL_SESSION fires once on subscribe, which performs the first load.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void load();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [load]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const updatePreferences = useCallback(
    async (patch: { language?: Language; theme?: ThemePreference }) => {
      if (patch.language) setLanguage(patch.language);
      if (patch.theme) setTheme(patch.theme);
      const updated = await api.patch<User>('/api/me', patch);
      setUser(updated);
    },
    [setLanguage, setTheme]
  );

  const value = useMemo(
    () => ({ user, loading, logout, refresh: load, updatePreferences }),
    [user, loading, logout, load, updatePreferences]
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}

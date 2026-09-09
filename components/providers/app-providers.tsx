'use client';

import { ThemeProvider } from 'next-themes';
import { QueryClientProvider } from './query-client-provider';
import { I18nProvider } from '@/lib/i18n/context';
import { UserProvider } from './user-provider';
import type { ReactNode } from 'react';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <I18nProvider>
        <QueryClientProvider>
          <UserProvider>{children}</UserProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

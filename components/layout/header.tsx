'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun, LogOut, Languages } from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useI18n } from '@/lib/i18n/context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function Header() {
  const { resolvedTheme } = useTheme();
  const { user, logout, updatePreferences } = useUser();
  const { t, language } = useI18n();

  const toggleTheme = () => updatePreferences({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' }).catch(console.error);
  const toggleLanguage = () => updatePreferences({ language: language === 'en' ? 'es' : 'en' }).catch(console.error);

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
      <div className="pl-10 md:pl-0 flex items-center gap-3 min-w-0">
        <span className="font-medium truncate hidden sm:inline">{t('appName')}</span>
        {user?.gmail_status === 'authorization_required' && (
          <Badge variant="danger" className="hidden sm:inline-flex">
            {t('admin.authRequired')}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggleLanguage} title={t('common.language')} aria-label={t('common.language')}>
          <span className="flex items-center gap-1 text-xs font-semibold uppercase">
            <Languages size={16} />
            {language}
          </span>
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} title={t('common.theme')} aria-label={t('common.theme')}>
          {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt={user.name || 'User'} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">
                  {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden sm:inline text-sm">{user?.name ?? user?.email}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>{user?.email}</DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              {t('common.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  HomeIcon,
  FileTextIcon,
  FolderIcon,
  TagIcon,
  UsersIcon,
  StarIcon,
  SettingsIcon,
  MenuIcon,
  XIcon,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useUser } from '@/hooks/use-user';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';

const menuItems = [
  { href: '/dashboard', key: 'nav.dashboard', icon: HomeIcon },
  { href: '/summaries', key: 'nav.summaries', icon: FileTextIcon },
  { href: '/files', key: 'nav.files', icon: FolderIcon },
  { href: '/tags', key: 'nav.tags', icon: TagIcon },
  { href: '/people', key: 'nav.people', icon: UsersIcon },
  { href: '/favorites', key: 'nav.favorites', icon: StarIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Read the persisted preference after mount so server and client markup match.
  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      /* ignore */
    }
    const frame = requestAnimationFrame(() => {
      setCollapsed(stored);
      setHydrated(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const items = user?.role === 'admin' ? [...menuItems, { href: '/admin', key: 'nav.admin', icon: SettingsIcon }] : menuItems;

  const nav = (
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={t(item.key)}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
              collapsed && 'justify-center px-2'
            )}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{t(item.key)}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-md bg-card border shadow-sm"
        aria-label="Menu"
      >
        {mobileOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
      </button>

      <aside
        className={cn(
          'bg-card border-r border-border flex flex-col h-screen z-40',
          hydrated && 'transition-all duration-200',
          'fixed left-0 top-0 md:relative',
          collapsed ? 'md:w-16' : 'md:w-60',
          mobileOpen ? 'w-60 translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className={cn('h-14 flex items-center border-b border-border px-4', collapsed && 'justify-center px-2')}>
          <Link href="/dashboard" className="font-semibold tracking-tight truncate">
            {collapsed ? 'Y' : 'YAKGU'}
          </Link>
        </div>
        {nav}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden md:flex items-center justify-center h-10 border-t border-border text-muted-foreground hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </aside>

      {mobileOpen && <div className="fixed inset-0 bg-black/40 md:hidden z-30" onClick={() => setMobileOpen(false)} />}
    </>
  );
}

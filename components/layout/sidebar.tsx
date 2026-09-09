'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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
} from 'lucide-react';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/summaries', label: 'Summaries', icon: FileTextIcon },
  { href: '/files', label: 'Files', icon: FolderIcon },
  { href: '/tags', label: 'Tags', icon: TagIcon },
  { href: '/people', label: 'People', icon: UsersIcon },
  { href: '/favorites', label: 'Favorites', icon: StarIcon },
];

const adminItems = [
  { href: '/admin', label: 'Admin', icon: SettingsIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 hover:bg-accent rounded-lg"
      >
        {isOpen ? <XIcon size={24} /> : <MenuIcon size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`${
          isOpen ? 'w-64' : 'w-20'
        } bg-card border-r border-border transition-all duration-300 flex flex-col h-screen fixed left-0 top-0 z-40 md:relative md:z-auto`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-border">
          <div className={`font-bold text-lg ${isOpen ? 'block' : 'hidden md:block'}`}>
            {isOpen ? 'YAKGU' : 'Y'}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent text-foreground'
                  }`}
                >
                  <Icon size={20} />
                  {isOpen && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Admin Section */}
          <div className="mt-8 pt-4 border-t border-border">
            {adminItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent text-foreground'
                  }`}
                >
                  <Icon size={20} />
                  {isOpen && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-30"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

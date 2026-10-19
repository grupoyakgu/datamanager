'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/hooks/use-user';
import { useT } from '@/lib/i18n/context';
import { UsersSection } from '@/components/admin/users-section';
import { TagsSection } from '@/components/admin/tags-section';
import { SummariesSection } from '@/components/admin/summaries-section';
import { SystemSection } from '@/components/admin/system-section';
import { ArchiveSection } from '@/components/admin/archive-section';

export default function AdminPage() {
  const t = useT();
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/dashboard');
  }, [user, router]);

  if (!user || user.role !== 'admin') return null;

  return (
    <div>
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <Tabs defaultValue="users">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="users">{t('admin.users')}</TabsTrigger>
          <TabsTrigger value="tags">{t('admin.tags')}</TabsTrigger>
          <TabsTrigger value="archive">{t('nav.archive')}</TabsTrigger>
          <TabsTrigger value="summaries">{t('nav.summaries')}</TabsTrigger>
          <TabsTrigger value="system">{t('admin.system')}</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-6"><UsersSection /></TabsContent>
        <TabsContent value="tags" className="mt-6"><TagsSection /></TabsContent>
        <TabsContent value="archive" className="mt-6"><ArchiveSection /></TabsContent>
        <TabsContent value="summaries" className="mt-6"><SummariesSection /></TabsContent>
        <TabsContent value="system" className="mt-6"><SystemSection /></TabsContent>
      </Tabs>
    </div>
  );
}

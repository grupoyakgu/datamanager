'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/hooks/use-user';
import { useT } from '@/lib/i18n/context';
import { UsersSection } from '@/components/admin/users-section';
import { FoldersSection } from '@/components/admin/folders-section';
import { TagsSection } from '@/components/admin/tags-section';
import { GmailSection } from '@/components/admin/gmail-section';
import { DriveSection } from '@/components/admin/drive-section';
import { AiSection } from '@/components/admin/ai-section';
import { SystemSection } from '@/components/admin/system-section';

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
          <TabsTrigger value="folders">{t('admin.folders')}</TabsTrigger>
          <TabsTrigger value="tags">{t('admin.tags')}</TabsTrigger>
          <TabsTrigger value="gmail">{t('admin.gmail')}</TabsTrigger>
          <TabsTrigger value="drive">{t('admin.drive')}</TabsTrigger>
          <TabsTrigger value="ai">{t('admin.ai')}</TabsTrigger>
          <TabsTrigger value="system">{t('admin.system')}</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-6"><UsersSection /></TabsContent>
        <TabsContent value="folders" className="mt-6"><FoldersSection /></TabsContent>
        <TabsContent value="tags" className="mt-6"><TagsSection /></TabsContent>
        <TabsContent value="gmail" className="mt-6"><GmailSection /></TabsContent>
        <TabsContent value="drive" className="mt-6"><DriveSection /></TabsContent>
        <TabsContent value="ai" className="mt-6"><AiSection /></TabsContent>
        <TabsContent value="system" className="mt-6"><SystemSection /></TabsContent>
      </Tabs>
    </div>
  );
}

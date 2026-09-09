'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';

export default function FilesPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col md:ml-0 ml-20">
        <Header />
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <h1 className="text-3xl font-bold">Google Drive Files</h1>
            <p className="text-muted-foreground mt-1">
              Access files from your Google Drive
            </p>
            <Card className="mt-6">
              <CardContent className="pt-6 text-center text-muted-foreground">
                Connect your Google Drive to view files here.
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

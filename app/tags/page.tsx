'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';

export default function TagsPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col md:ml-0 ml-20">
        <Header />
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <h1 className="text-3xl font-bold">Tags</h1>
            <p className="text-muted-foreground mt-1">
              Manage and organize tags
            </p>
            <Card className="mt-6">
              <CardContent className="pt-6 text-center text-muted-foreground">
                No tags yet.
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

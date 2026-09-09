'use client';

import { useState } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useTags, useInvalidateSummaries } from '@/hooks/use-api';

export function TagsSection() {
  const t = useT();
  const { data: tags } = useTags(true);
  const invalidate = useInvalidateSummaries();
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAliases, setEditAliases] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <form
        className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          run(() => api.post('/api/admin/tags', { name: newName, aliases: newAliases })).then(() => { setNewName(''); setNewAliases(''); });
        }}
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('admin.newTag')} />
        <Input value={newAliases} onChange={(e) => setNewAliases(e.target.value)} placeholder={t('admin.aliases')} />
        <Button type="submit">{t('common.create')}</Button>
      </form>

      <div className="space-y-2">
        {tags?.map((tag) => (
          <div key={tag.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2">
            {editingId === tag.id ? (
              <>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 max-w-[12rem]" />
                <Input value={editAliases} onChange={(e) => setEditAliases(e.target.value)} className="h-8 max-w-xs" placeholder={t('admin.aliases')} />
                <Button size="sm" variant="ghost" onClick={() => run(() => api.patch(`/api/admin/tags/${tag.id}`, { name: editName, aliases: editAliases })).then(() => setEditingId(null))}>
                  <Check size={16} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X size={16} />
                </Button>
              </>
            ) : (
              <>
                <span className="font-medium">{tag.name}</span>
                {tag.aliases.length > 0 && <span className="text-xs text-muted-foreground">({tag.aliases.join(', ')})</span>}
                <span className="text-xs text-muted-foreground ml-auto">{tag.summary_count}</span>
                <Badge variant={tag.is_active ? 'success' : 'secondary'}>{tag.is_active ? t('admin.enabled') : t('admin.disabled')}</Badge>
                <Button size="sm" variant="ghost" onClick={() => run(() => api.patch(`/api/admin/tags/${tag.id}`, { is_active: !tag.is_active }))}>
                  {tag.is_active ? t('admin.disabled') : t('admin.enabled')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingId(tag.id); setEditName(tag.name); setEditAliases(tag.aliases.join(', ')); }}>
                  <Pencil size={16} />
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(t('common.confirmDelete')) && run(() => api.delete(`/api/admin/tags/${tag.id}`))}>
                  <Trash2 size={16} />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

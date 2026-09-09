'use client';

import { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Star, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { useT } from '@/lib/i18n/context';
import { useFolders, useTags, useInvalidateSummaries } from '@/hooks/use-api';
import { useFolderRules, useInvalidateAdmin } from './use-admin';

export function FoldersSection() {
  const t = useT();
  const { data: folders } = useFolders();
  const { data: tags } = useTags(true);
  const { data: rules } = useFolderRules();
  const invalidateAdmin = useInvalidateAdmin();
  const invalidateAll = useInvalidateSummaries();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [ruleTag, setRuleTag] = useState('');
  const [ruleFolder, setRuleFolder] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      invalidateAll();
      invalidateAdmin('folder-rules');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const list = folders ?? [];
  const move = (index: number, direction: -1 | 1) => {
    const ids = list.map((f) => f.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => api.put('/api/admin/folders', { ids }));
  };

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <form
        className="flex gap-2 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          run(() => api.post('/api/admin/folders', { name: newName })).then(() => setNewName(''));
        }}
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('admin.newFolder')} />
        <Button type="submit">{t('common.create')}</Button>
      </form>

      <div className="space-y-2">
        {list.map((folder, index) => (
          <div key={folder.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="text-muted-foreground disabled:opacity-30" aria-label={t('admin.moveUp')}>
                <ArrowUp size={14} />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === list.length - 1} className="text-muted-foreground disabled:opacity-30" aria-label={t('admin.moveDown')}>
                <ArrowDown size={14} />
              </button>
            </div>
            {editingId === folder.id ? (
              <>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 max-w-xs" />
                <Button size="sm" variant="ghost" onClick={() => run(() => api.patch(`/api/admin/folders/${folder.id}`, { name: editName })).then(() => setEditingId(null))}>
                  <Check size={16} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X size={16} />
                </Button>
              </>
            ) : (
              <>
                <span className="font-medium flex-1 truncate">{folder.name}</span>
                <span className="text-xs text-muted-foreground">{folder.summary_count}</span>
                {folder.is_default && <Badge variant="secondary">{t('admin.defaultFolder')}</Badge>}
                <Button size="sm" variant="ghost" onClick={() => { setEditingId(folder.id); setEditName(folder.name); }} aria-label={t('common.edit')}>
                  <Pencil size={16} />
                </Button>
                {!folder.is_default && (
                  <Button size="sm" variant="ghost" title={t('admin.setDefault')} onClick={() => run(() => api.patch(`/api/admin/folders/${folder.id}`, { is_default: true }))}>
                    <Star size={16} />
                  </Button>
                )}
                {!folder.is_default && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(t('common.confirmDelete')) && run(() => api.delete(`/api/admin/folders/${folder.id}`))}>
                    <Trash2 size={16} />
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.folderRules')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('admin.folderRulesHint')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <div className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">{t('admin.ifTag')}</span>
              <Select value={ruleTag} onChange={(e) => setRuleTag(e.target.value)}>
                <option value="">—</option>
                {tags?.map((tag) => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">{t('admin.thenFolder')}</span>
              <Select value={ruleFolder} onChange={(e) => setRuleFolder(e.target.value)}>
                <option value="">—</option>
                {list.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </div>
            <Button disabled={!ruleTag || !ruleFolder} onClick={() => run(() => api.post('/api/admin/folder-rules', { tagId: ruleTag, folderId: ruleFolder }))}>
              {t('admin.addRule')}
            </Button>
          </div>
          <ul className="space-y-1 text-sm">
            {rules?.map((rule) => (
              <li key={rule.id} className="flex items-center gap-2">
                <span>
                  {t('admin.ifTag')} <strong>{tags?.find((x) => x.id === rule.tag_id)?.name ?? '?'}</strong> → {t('admin.thenFolder')}{' '}
                  <strong>{list.find((f) => f.id === rule.folder_id)?.name ?? '?'}</strong>
                </span>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => run(() => api.delete(`/api/admin/folder-rules/${rule.id}`))}>
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

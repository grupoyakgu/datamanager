'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';

interface Tag {
  id: string;
  name: string;
}

interface TagEditorProps {
  allTags: Tag[];
  selectedTags: Tag[];
  editing: boolean;
  onToggle: (tagId: string) => void;
  onAddNew: (name: string) => void;
  busy?: boolean;
}

/**
 * Tag chip grid — toggle any existing tag on/off, or type a name that isn't
 * in the list yet to create and apply a brand-new one. Shared by Archive and
 * Summaries so both can go beyond picking from the existing tag list.
 */
export function TagEditor({ allTags, selectedTags, editing, onToggle, onAddNew, busy }: TagEditorProps) {
  const t = useT();
  const [newTagName, setNewTagName] = useState('');

  const submitNew = () => {
    const name = newTagName.trim();
    if (!name) return;
    onAddNew(name);
    setNewTagName('');
  };

  const visibleTags = editing ? allTags : selectedTags;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {visibleTags.map((tag) => {
          const selected = selectedTags.some((x) => x.id === tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              disabled={!editing}
              onClick={() => onToggle(tag.id)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                selected ? 'bg-primary text-primary-foreground border-transparent' : 'hover:bg-accent'
              )}
            >
              {tag.name}
            </button>
          );
        })}
        {!editing && selectedTags.length === 0 && <span className="text-xs text-muted-foreground">{t('common.none')}</span>}
      </div>
      {editing && (
        <div className="flex items-center gap-1.5">
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitNew();
              }
            }}
            placeholder={t('admin.newTag')}
            className="h-8 text-xs"
          />
          <Button type="button" size="sm" variant="outline" onClick={submitNew} disabled={busy || !newTagName.trim()}>
            <Plus size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}

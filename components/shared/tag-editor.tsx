'use client';

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/context';

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
 * Selected tags as removable chips, plus — while editing — a text box that
 * autocompletes against every existing tag as the user types: picking a
 * suggestion applies that exact tag (avoiding a near-duplicate like
 * "invoice" vs "invoices"), while a name with no match creates a new tag
 * on Enter or via the add button. Replaces an earlier design that listed
 * every tag in the system as a toggle grid, which buried the few tags
 * relevant to one item under everything else ever created. Shared by
 * Archive and Summaries.
 */
export function TagEditor({ allTags, selectedTags, editing, onToggle, onAddNew, busy }: TagEditorProps) {
  const t = useT();
  const [query, setQuery] = useState('');

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allTags.filter((tag) => !selectedTags.some((s) => s.id === tag.id) && tag.name.toLowerCase().includes(q)).slice(0, 8);
  }, [allTags, selectedTags, query]);

  const exactMatch = useMemo(() => allTags.find((tag) => tag.name.toLowerCase() === query.trim().toLowerCase()), [allTags, query]);

  const commit = () => {
    const name = query.trim();
    if (!name) return;
    if (exactMatch) {
      if (!selectedTags.some((s) => s.id === exactMatch.id)) onToggle(exactMatch.id);
    } else {
      onAddNew(name);
    }
    setQuery('');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {selectedTags.map((tag) => (
          <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs text-primary-foreground">
            {tag.name}
            {editing && (
              <button type="button" onClick={() => onToggle(tag.id)} className="hover:opacity-75" aria-label={t('common.remove')}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        {selectedTags.length === 0 && <span className="text-xs text-muted-foreground">{t('common.none')}</span>}
      </div>
      {editing && (
        <div className="relative">
          <div className="flex items-center gap-1.5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
              }}
              placeholder={t('admin.newTag')}
              className="h-8 text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={commit} disabled={busy || !query.trim()}>
              <Plus size={14} />
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-md max-h-48 overflow-auto">
              {suggestions.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    onToggle(tag.id);
                    setQuery('');
                  }}
                  className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

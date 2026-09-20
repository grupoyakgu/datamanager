'use client';

import { useState, type FormEvent } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/context';

interface SearchBarProps {
  initialValue?: string;
  onSearch: (query: string) => void;
  onAsk?: (question: string) => void;
  busy?: boolean;
  placeholder?: string;
  /** false collapses to a single AI-powered button (Search === Ask), for contexts with no separate keyword-filter mode. */
  showAskButton?: boolean;
}

export function SearchBar({ initialValue = '', onSearch, onAsk, busy, placeholder, showAskButton = true }: SearchBarProps) {
  const t = useT();
  const [value, setValue] = useState(initialValue);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(value.trim());
  };

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder ?? t('summaries.searchPlaceholder')}
          className="pl-9"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant={showAskButton ? 'outline' : 'default'} disabled={busy}>
          {!showAskButton && <Sparkles size={16} className="mr-1" />}
          {t('common.search')}
        </Button>
        {showAskButton && (
          <Button type="button" onClick={() => value.trim() && onAsk?.(value.trim())} disabled={busy || !value.trim()}>
            <Sparkles size={16} className="mr-1" />
            {t('summaries.ask')}
          </Button>
        )}
      </div>
    </form>
  );
}

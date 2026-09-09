'use client';

import { useState, type FormEvent } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/context';

interface SearchBarProps {
  initialValue?: string;
  onSearch: (query: string) => void;
  onAsk: (question: string) => void;
  busy?: boolean;
  placeholder?: string;
}

export function SearchBar({ initialValue = '', onSearch, onAsk, busy, placeholder }: SearchBarProps) {
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
        <Button type="submit" variant="outline" disabled={busy}>
          {t('common.search')}
        </Button>
        <Button type="button" onClick={() => value.trim() && onAsk(value.trim())} disabled={busy || !value.trim()}>
          <Sparkles size={16} className="mr-1" />
          {t('summaries.ask')}
        </Button>
      </div>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { FolderInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useT } from '@/lib/i18n/context';

const CREATE_NEW = '__new__';

interface MoveToFolderProps {
  currentFolderName: string | null;
  options: { id: string; name: string }[];
  onMove: (folderName: string) => void | Promise<void>;
  busy?: boolean;
  /** Icon-only trigger (for a row of action icons) instead of the default icon+label button. The dropdown then floats in a popover anchored to the icon, instead of expanding inline. */
  iconOnly?: boolean;
}

/** Inline "move to folder" control — pick an existing Drive folder or type a new name. Shared by Archive, Summaries and Files. */
export function MoveToFolder({ currentFolderName, options, onMove, busy, iconOnly }: MoveToFolderProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const [newName, setNewName] = useState('');

  const folderOptions = options.filter((o) => o.name !== currentFolderName);

  const submit = () => {
    const name = choice === CREATE_NEW ? newName.trim() : choice;
    if (!name) return;
    void onMove(name);
    setOpen(false);
    setChoice('');
    setNewName('');
  };

  const form = (
    <div className="space-y-1.5">
      <Select value={choice} onChange={(e) => setChoice(e.target.value)} className="h-9">
        <option value="">{t('files.selectFolder')}</option>
        <option value={CREATE_NEW}>{t('admin.createNewFolder')}</option>
        {folderOptions.map((o) => (
          <option key={o.id} value={o.name}>
            {o.name}
          </option>
        ))}
      </Select>
      {choice === CREATE_NEW && (
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('admin.newFolderNamePlaceholder')} autoFocus />
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={submit} disabled={busy || !choice || (choice === CREATE_NEW && !newName.trim())}>
          {busy ? t('common.loading') : t('files.moveToFolder')}
        </Button>
      </div>
    </div>
  );

  if (iconOnly) {
    return (
      <div className="relative inline-block">
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} title={t('files.moveToFolder')} aria-label={t('files.moveToFolder')}>
          <FolderInput size={14} />
        </Button>
        {open && <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border bg-card p-2 shadow-md">{form}</div>}
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <FolderInput size={14} className="mr-1" />
        {t('files.moveToFolder')}
      </Button>
    );
  }

  return form;
}

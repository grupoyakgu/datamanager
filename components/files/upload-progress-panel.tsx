'use client';

import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useT } from '@/lib/i18n/context';

export interface UploadTask {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

/** Fixed bottom-right panel showing per-file drag-and-drop upload progress, success and errors. */
export function UploadProgressPanel({ tasks, onDismiss }: { tasks: UploadTask[]; onDismiss: () => void }) {
  const t = useT();
  if (tasks.length === 0) return null;
  const allSettled = tasks.every((task) => task.status !== 'uploading');

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-card shadow-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium">{t('files.uploading')}</span>
        {allSettled && (
          <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label={t('common.close')}>
            <X size={14} />
          </button>
        )}
      </div>
      <ul className="max-h-64 overflow-auto p-2 space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="text-xs space-y-1">
            <div className="flex items-center gap-1.5">
              {task.status === 'done' && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
              {task.status === 'error' && <AlertCircle size={14} className="text-destructive shrink-0" />}
              <span className="truncate flex-1">{task.name}</span>
              {task.status === 'uploading' && <span className="text-muted-foreground shrink-0">{task.progress}%</span>}
            </div>
            {task.status === 'uploading' && (
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${task.progress}%` }} />
              </div>
            )}
            {task.status === 'error' && task.error && <p className="text-destructive">{task.error}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

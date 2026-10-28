'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/components/summaries/summary-card';
import { useActionItems, useUpdateActionItemStatus } from '@/hooks/use-api';
import { useT } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import type { ActionItemListEntry, ActionItemStatus } from '@/types/database';

type SortKey = 'text' | 'origin' | 'emailDate' | 'added' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'not_closed' | 'all' | ActionItemStatus;

const STATUS_ORDER: Record<ActionItemStatus, number> = { open: 0, in_process: 1, closed: 2 };

function inRange(value: string | null, from: string, to: string): boolean {
  if (!value) return !from && !to;
  const date = value.slice(0, 10);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function SortableHeader({
  sortKeyName,
  activeKey,
  dir,
  onToggle,
  children,
}: {
  sortKeyName: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
  children: React.ReactNode;
}) {
  const icon =
    activeKey !== sortKeyName ? (
      <ArrowUpDown size={13} className="text-muted-foreground/50" />
    ) : dir === 'asc' ? (
      <ArrowUp size={13} />
    ) : (
      <ArrowDown size={13} />
    );
  return (
    <TH>
      <button type="button" onClick={() => onToggle(sortKeyName)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        {icon}
      </button>
    </TH>
  );
}

export default function ActionItemsPage() {
  const t = useT();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('not_closed');
  const [summaryId, setSummaryId] = useState('');
  const [textFilter, setTextFilter] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [addedFrom, setAddedFrom] = useState('');
  const [addedTo, setAddedTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('emailDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: allItems, isLoading } = useActionItems(['open', 'in_process', 'closed']);
  const updateStatus = useUpdateActionItemStatus();

  const summaryOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const item of allItems ?? []) {
      if (item.summary) byId.set(item.summary.id, item.summary.title);
    }
    return Array.from(byId.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allItems]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'emailDate' || key === 'added' ? 'desc' : 'asc');
    }
  };

  const items = useMemo(() => {
    const text = textFilter.trim().toLowerCase();
    const filtered = (allItems ?? []).filter((item) => {
      if (statusFilter === 'not_closed' && item.status === 'closed') return false;
      if (statusFilter !== 'not_closed' && statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (summaryId && item.summary?.id !== summaryId) return false;
      if (text && !item.text.toLowerCase().includes(text)) return false;
      if (!inRange(item.summary?.email_received_at ?? null, emailFrom, emailTo)) return false;
      if (!inRange(item.created_at, addedFrom, addedTo)) return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'text':
          return dir * a.text.localeCompare(b.text);
        case 'origin':
          return dir * (a.summary?.title ?? '').localeCompare(b.summary?.title ?? '');
        case 'status':
          return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
        case 'added':
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        case 'emailDate':
        default: {
          const dateA = a.summary?.email_received_at ?? a.created_at;
          const dateB = b.summary?.email_received_at ?? b.created_at;
          return dir * (new Date(dateA).getTime() - new Date(dateB).getTime());
        }
      }
    });
  }, [allItems, statusFilter, summaryId, textFilter, emailFrom, emailTo, addedFrom, addedTo, sortKey, sortDir]);

  return (
    <div>
      <PageHeader title={t('actionItems.title')} subtitle={t('actionItems.subtitle')} />

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div className="space-y-1">
          <Label>{t('actionItems.text')}</Label>
          <Input
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder={t('common.search')}
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label>{t('actionItems.origin')}</Label>
          <Select value={summaryId} onChange={(e) => setSummaryId(e.target.value)} className="w-56">
            <option value="">{t('common.all')}</option>
            {summaryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('actionItems.status')}</Label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="w-44">
            <option value="not_closed">{t('actionItems.statusOpen')} + {t('actionItems.statusInProcess')}</option>
            <option value="all">{t('common.all')}</option>
            <option value="open">{t('actionItems.statusOpen')}</option>
            <option value="in_process">{t('actionItems.statusInProcess')}</option>
            <option value="closed">{t('actionItems.statusClosed')}</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('actionItems.emailDate')}</Label>
          <div className="flex items-center gap-1.5">
            <Input type="date" value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} className="w-36" />
            <span className="text-muted-foreground text-sm">–</span>
            <Input type="date" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className="w-36" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>{t('actionItems.date')}</Label>
          <div className="flex items-center gap-1.5">
            <Input type="date" value={addedFrom} onChange={(e) => setAddedFrom(e.target.value)} className="w-36" />
            <span className="text-muted-foreground text-sm">–</span>
            <Input type="date" value={addedTo} onChange={(e) => setAddedTo(e.target.value)} className="w-36" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : !items || items.length === 0 ? (
        <EmptyState>{t('actionItems.empty')}</EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <SortableHeader sortKeyName="text" activeKey={sortKey} dir={sortDir} onToggle={toggleSort}>
                {t('actionItems.text')}
              </SortableHeader>
              <SortableHeader sortKeyName="origin" activeKey={sortKey} dir={sortDir} onToggle={toggleSort}>
                {t('actionItems.origin')}
              </SortableHeader>
              <SortableHeader sortKeyName="emailDate" activeKey={sortKey} dir={sortDir} onToggle={toggleSort}>
                {t('actionItems.emailDate')}
              </SortableHeader>
              <SortableHeader sortKeyName="added" activeKey={sortKey} dir={sortDir} onToggle={toggleSort}>
                {t('actionItems.date')}
              </SortableHeader>
              <SortableHeader sortKeyName="status" activeKey={sortKey} dir={sortDir} onToggle={toggleSort}>
                {t('actionItems.status')}
              </SortableHeader>
            </TR>
          </THead>
          <TBody>
            {items.map((item: ActionItemListEntry) => (
              <TR key={item.id}>
                <TD className="max-w-md">{item.text}</TD>
                <TD>
                  {item.summary ? (
                    <Link href={`/summaries/${item.summary.id}?ref=action-items`} className="text-primary hover:underline">
                      {item.summary.title}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TD>
                <TD className="text-muted-foreground whitespace-nowrap">{formatDate(item.summary?.email_received_at ?? null) ?? '—'}</TD>
                <TD className="text-muted-foreground whitespace-nowrap">{formatDate(item.created_at)}</TD>
                <TD>
                  <Select
                    value={item.status}
                    onChange={(e) => updateStatus.mutate({ id: item.id, status: e.target.value as ActionItemStatus })}
                    className={cn('h-9 w-36 py-1')}
                  >
                    <option value="open">{t('actionItems.statusOpen')}</option>
                    <option value="in_process">{t('actionItems.statusInProcess')}</option>
                    <option value="closed">{t('actionItems.statusClosed')}</option>
                  </Select>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

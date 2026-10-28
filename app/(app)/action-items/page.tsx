'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/components/summaries/summary-card';
import { useActionItems, useUpdateActionItemStatus } from '@/hooks/use-api';
import { useT } from '@/lib/i18n/context';
import type { ActionItemStatus } from '@/types/database';

export default function ActionItemsPage() {
  const t = useT();
  const [showClosed, setShowClosed] = useState(false);
  const [summaryId, setSummaryId] = useState('');
  const { data: allItems, isLoading } = useActionItems(showClosed ? ['open', 'in_process', 'closed'] : undefined);
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

  const items = summaryId ? (allItems ?? []).filter((item) => item.summary?.id === summaryId) : allItems;

  return (
    <div>
      <PageHeader title={t('actionItems.title')} subtitle={t('actionItems.subtitle')} />

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div className="space-y-1">
          <Label>{t('actionItems.origin')}</Label>
          <Select value={summaryId} onChange={(e) => setSummaryId(e.target.value)} className="w-64">
            <option value="">{t('common.all')}</option>
            {summaryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm h-10">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          {t('actionItems.showClosed')}
        </label>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : !items || items.length === 0 ? (
        <EmptyState>{t('actionItems.empty')}</EmptyState>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t('actionItems.text')}</TH>
              <TH>{t('actionItems.origin')}</TH>
              <TH>{t('actionItems.date')}</TH>
              <TH>{t('actionItems.status')}</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((item) => (
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
                <TD className="text-muted-foreground whitespace-nowrap">
                  {formatDate(item.summary?.email_received_at ?? item.created_at)}
                </TD>
                <TD>
                  <Select
                    value={item.status}
                    onChange={(e) => updateStatus.mutate({ id: item.id, status: e.target.value as ActionItemStatus })}
                    className="h-9 w-36 py-1"
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

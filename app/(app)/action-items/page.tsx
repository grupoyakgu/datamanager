'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader, EmptyState } from '@/components/layout/page-header';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { formatDate } from '@/components/summaries/summary-card';
import { useActionItems, useUpdateActionItemStatus } from '@/hooks/use-api';
import { useT } from '@/lib/i18n/context';
import type { ActionItemStatus } from '@/types/database';

export default function ActionItemsPage() {
  const t = useT();
  const [showClosed, setShowClosed] = useState(false);
  const { data: items, isLoading } = useActionItems(showClosed ? ['open', 'in_process', 'closed'] : undefined);
  const updateStatus = useUpdateActionItemStatus();

  return (
    <div>
      <PageHeader title={t('actionItems.title')} subtitle={t('actionItems.subtitle')} />

      <label className="flex items-center gap-2 text-sm mb-4">
        <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
        {t('actionItems.showClosed')}
      </label>

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
                <TD className="text-muted-foreground whitespace-nowrap">{formatDate(item.created_at)}</TD>
                <TD>
                  <Select
                    value={item.status}
                    onChange={(e) => updateStatus.mutate({ id: item.id, status: e.target.value as ActionItemStatus })}
                    className="h-8 w-36"
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

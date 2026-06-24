import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Field, SelectInput, TextInput } from '../components/Field';
import { PageHeader, StatCard } from '../components/Page';
import { formatEventPeriod, formatShowEventOptionLabel, getShowEventTiming, sortShowEventOptions } from '../lib/events/dateRange';
import { formatMoney } from '../lib/format/money';
import { lineFinalProfit, lineFinalTotal } from '../lib/reports/profit';
import {
  formatMonthLabel,
  getLocalDateKey,
  getLocalMonthKey,
  getRevenueMonth,
  matchesSaleScope
} from '../lib/reports/revenuePeriods';
import {
  getSettings,
  listBuybacks,
  listEvents,
  listTransactions,
  unvoidBuyback,
  unvoidSale,
  updateBuybackSource,
  updateTransactionSaleSource,
  voidBuyback,
  voidSale
} from '../lib/supabase/api';
import { useOrg, useOrgMembershipsQuery } from '../lib/org/OrgProvider';
import type { Buyback, Transaction } from '../types/domain';

export function HistoryScreen() {
  const { organization } = useOrg();
  const [month, setMonth] = useState(getLocalMonthKey());
  const [date, setDate] = useState('');
  const [saleScope, setSaleScope] = useState('');
  const [adminId, setAdminId] = useState('');
  const [editingSourceId, setEditingSourceId] = useState('');
  const [sourceDraftByTx, setSourceDraftByTx] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 5000) });
  const buybacksQuery = useQuery({ queryKey: ['buybacks', organization.id], queryFn: () => listBuybacks(organization.id, 5000) });
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const membershipsQuery = useOrgMembershipsQuery(organization.id);
  const mutation = useMutation({
    mutationFn: (id: string) => voidSale(organization.id, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['history', organization.id] });
      await queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });
    }
  });
  const unvoidMutation = useMutation({
    mutationFn: (id: string) => unvoidSale(organization.id, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['history', organization.id] });
      await queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });
    }
  });
  const sourceMutation = useMutation({
    mutationFn: ({ id, sourceValue }: { id: string; sourceValue: string }) => (
      updateTransactionSaleSource(organization.id, id, sourceValue === 'daily' ? null : sourceValue)
    ),
    onSuccess: async () => {
      setEditingSourceId('');
      await queryClient.invalidateQueries({ queryKey: ['history', organization.id] });
    }
  });
  const buybackSourceMutation = useMutation({
    mutationFn: ({ id, sourceValue }: { id: string; sourceValue: string }) => (
      updateBuybackSource(organization.id, id, sourceValue === 'daily' ? null : sourceValue)
    ),
    onSuccess: async () => {
      setEditingSourceId('');
      await queryClient.invalidateQueries({ queryKey: ['buybacks', organization.id] });
    }
  });
  const buybackVoidMutation = useMutation({
    mutationFn: (id: string) => voidBuyback(organization.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['buybacks', organization.id] })
  });
  const buybackUnvoidMutation = useMutation({
    mutationFn: (id: string) => unvoidBuyback(organization.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['buybacks', organization.id] })
  });
  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const rows = (query.data || []).filter((tx) =>
    (!month || getRevenueMonth(tx, eventsById) === month) &&
    (!date || getLocalDateKey(tx.createdAt) === date) &&
    matchesSaleScope(tx, saleScope) &&
    (!adminId || tx.createdBy === adminId)
  );
  const buybackRows = (buybacksQuery.data || []).filter((buyback) =>
    (!month || getRevenueMonth(buyback, eventsById) === month) &&
    (!date || getLocalDateKey(buyback.createdAt) === date) &&
    matchesSaleScope(buyback, saleScope) &&
    (!adminId || buyback.createdBy === adminId)
  );
  const completedRows = rows.filter((tx) => tx.status === 'completed');
  const completedRevenue = completedRows.reduce((sum, tx) => sum + tx.total, 0);
  const completedBuybacks = buybackRows.filter((buyback) => buyback.status === 'completed');
  const buybackSpend = completedBuybacks.reduce((sum, buyback) => sum + buyback.totalPaid, 0);
  const symbol = settingsQuery.data?.currencySymbol || 'S$';
  const eventLabels = useMemo(
    () => new Map(events.map((event) => [event.id, `${event.name} / ${formatEventPeriod(event)}`])),
    [events]
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Ledger"
        title="History"
        description={`${rows.length} transactions / ${buybackRows.length} buybacks`}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Completed revenue" value={formatMoney(completedRevenue, symbol)} detail={`${completedRows.length} sales`} />
          <StatCard label="Buyback spend" value={formatMoney(buybackSpend, symbol)} detail={`${completedBuybacks.length} records`} />
          <StatCard label="Net cash" value={formatMoney(completedRevenue - buybackSpend, symbol)} tone={completedRevenue - buybackSpend >= 0 ? 'good' : 'warn'} />
          <StatCard label="Filter month" value={month || 'All'} />
        </div>
        <div className="grid gap-2 min-[400px]:grid-cols-2 xl:grid-cols-4">
          <Field label="Revenue month">
            <TextInput type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Source">
            <SelectInput
              value={saleScope}
              onValueChange={setSaleScope}
              options={[
                { value: '', label: 'All records' },
                { value: 'daily', label: 'Daily / online' },
                { value: 'shows', label: 'All card shows' },
                ...sortShowEventOptions(events).map((event) => ({ value: event.id, label: formatShowEventOptionLabel(event), muted: getShowEventTiming(event) === 'past' }))
              ]}
            />
          </Field>
          <Field label="Admin">
            <SelectInput
              value={adminId}
              onValueChange={setAdminId}
              options={[
                { value: '', label: 'All admins' },
                ...(membershipsQuery.data || []).map((membership) => ({
                  value: membership.userId,
                  label: membership.displayName || membership.userId.slice(0, 8)
                }))
              ]}
            />
          </Field>
        </div>
      </PageHeader>
      <div className="grid gap-3">
        {rows.map((tx) => {
          const sourceDraft = sourceDraftByTx[tx.id] ?? sourceValueForTransaction(tx);
          return (
          <article key={tx.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="flex min-w-0 justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black">{formatMoney(tx.total, symbol)} <span className="text-sm font-semibold text-slate-500">{tx.paymentMethod}</span></p>
                <p className="text-xs font-semibold text-slate-600">
                  Gross profit: {tx.costUnknown ? 'cost unknown' : `${formatMoney(tx.grossProfit, symbol)} / cost ${formatMoney(tx.costTotal, symbol)}`}
                </p>
                <p className="text-xs text-slate-600">{new Date(tx.createdAt).toLocaleString()}</p>
                <p className="mt-1 inline-flex max-w-full break-words rounded bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800">
                  {tx.eventId ? eventLabels.get(tx.eventId) || 'Unknown show' : 'Daily sale'}
                </p>
                {tx.eventId && (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Revenue month: {formatMonthLabel(getRevenueMonth(tx, eventsById))} (show start)
                  </p>
                )}
                <p className={`mt-1 text-xs font-bold ${tx.status === 'completed' ? 'text-action' : 'text-danger'}`}>{tx.status}</p>
              </div>
              <div className="grid shrink-0 content-start gap-2">
                {tx.status === 'completed' ? (
                  <Button
                    variant="secondary"
                    disabled={mutation.isPending}
                    onClick={() => {
                      if (confirm('Void this sale and return its inventory quantities to stock?')) mutation.mutate(tx.id);
                    }}
                  >
                    Void & restock
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={unvoidMutation.isPending}
                    onClick={() => {
                      if (confirm('Undo this void, mark the sale completed again, and remove the inventory quantities from stock?')) unvoidMutation.mutate(tx.id);
                    }}
                  >
                    Undo void
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingSourceId(editingSourceId === tx.id ? '' : tx.id);
                    setSourceDraftByTx((current) => ({ ...current, [tx.id]: sourceValueForTransaction(tx) }));
                  }}
                >
                  {editingSourceId === tx.id ? 'Close' : 'Edit source'}
                </Button>
              </div>
            </div>
            {editingSourceId === tx.id && (
              <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3">
                <Field label="Sales source">
                  <SelectInput
                    value={sourceDraft}
                    onValueChange={(value) => setSourceDraftByTx((current) => ({ ...current, [tx.id]: value }))}
                    options={[
                      { value: 'daily', label: 'Daily sale' },
                      ...sortShowEventOptions(events).map((event) => ({ value: event.id, label: formatShowEventOptionLabel(event), muted: getShowEventTiming(event) === 'past' }))
                    ]}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    disabled={sourceMutation.isPending || sourceDraft === sourceValueForTransaction(tx)}
                    onClick={() => sourceMutation.mutate({ id: tx.id, sourceValue: sourceDraft })}
                  >
                    Save source
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingSourceId('')}>
                    Cancel
                  </Button>
                </div>
                {sourceMutation.error && <p className="text-sm text-danger">{sourceMutation.error.message}</p>}
              </div>
            )}
            <div className="mt-3 grid gap-1">
              {tx.lineItems.map((line, index) => (
                <div key={`${tx.id}-${line.inventoryItemId || line.itemNumberSnapshot}-${index}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md bg-slate-50 p-2 text-sm">
                  <span className="min-w-0 break-words">
                    {line.itemNameSnapshot} / <span className="break-all">{line.itemNumberSnapshot}</span>
                    {line.raritySnapshot ? ` / ${line.raritySnapshot} ${line.artSnapshot || ''}` : ''} x {line.quantity}
                  </span>
                  <span className="text-right">
                    <strong className="block whitespace-nowrap">{formatMoney(lineFinalTotal(tx, line), symbol)}</strong>
                    <span className="block text-xs font-semibold text-slate-500">
                      {line.costUnknown ? 'cost unknown' : `Profit ${formatMoney(lineFinalProfit(tx, line), symbol)}`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </article>
          );
        })}
      </div>

      <section className="grid gap-3">
        <h3 className="text-lg font-black">Buybacks</h3>
        {buybackRows.length === 0 && <p className="rounded-2xl border border-line bg-white p-4 text-sm font-semibold text-slate-600 shadow-sm">No buybacks match this filter.</p>}
        {buybackRows.map((buyback) => {
          const sourceDraft = sourceDraftByTx[buyback.id] ?? sourceValueForBuyback(buyback);
          return (
            <article key={buyback.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <div className="flex min-w-0 justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black">{formatMoney(buyback.totalPaid, symbol)} <span className="text-sm font-semibold text-slate-500">{buyback.paymentMethod}</span></p>
                  <p className="break-words text-sm font-bold">{buyback.itemSummary} / {buyback.itemCount} items</p>
                  <p className="text-xs text-slate-600">{new Date(buyback.createdAt).toLocaleString()}</p>
                  <p className="mt-1 inline-flex max-w-full break-words rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
                    {buyback.eventId ? eventLabels.get(buyback.eventId) || 'Unknown show' : 'Daily buyback'}
                  </p>
                  {buyback.sellerName && <p className="mt-1 text-xs text-slate-600">Seller: {buyback.sellerName}</p>}
                  {buyback.notes && <p className="mt-1 break-words text-xs text-slate-600">{buyback.notes}</p>}
                  <p className={`mt-1 text-xs font-bold ${buyback.status === 'completed' ? 'text-action' : 'text-danger'}`}>{buyback.status}</p>
                  <p className="mt-1 inline-flex rounded bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">
                    {buyback.processingStatus === 'partially_processed' ? 'Partial' : buyback.processingStatus === 'processed' ? 'Processed' : 'Unprocessed'}
                  </p>
                </div>
                <div className="grid shrink-0 content-start gap-2">
                  {buyback.status === 'completed' ? (
                    <Button
                      variant="secondary"
                      disabled={buybackVoidMutation.isPending}
                      onClick={() => {
                        if (confirm('Void this buyback record? This only removes it from completed spend reports.')) buybackVoidMutation.mutate(buyback.id);
                      }}
                    >
                      Void
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={buybackUnvoidMutation.isPending}
                      onClick={() => {
                        if (confirm('Restore this buyback to completed spend reports?')) buybackUnvoidMutation.mutate(buyback.id);
                      }}
                    >
                      Undo void
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingSourceId(editingSourceId === buyback.id ? '' : buyback.id);
                      setSourceDraftByTx((current) => ({ ...current, [buyback.id]: sourceValueForBuyback(buyback) }));
                    }}
                  >
                    {editingSourceId === buyback.id ? 'Close' : 'Edit source'}
                  </Button>
                </div>
              </div>
              {editingSourceId === buyback.id && (
                <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3">
                  <Field label="Buyback source">
                    <SelectInput
                      value={sourceDraft}
                      onValueChange={(value) => setSourceDraftByTx((current) => ({ ...current, [buyback.id]: value }))}
                      options={[
                        { value: 'daily', label: 'Daily buyback' },
                        ...sortShowEventOptions(events).map((event) => ({ value: event.id, label: formatShowEventOptionLabel(event), muted: getShowEventTiming(event) === 'past' }))
                      ]}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      disabled={buybackSourceMutation.isPending || sourceDraft === sourceValueForBuyback(buyback)}
                      onClick={() => buybackSourceMutation.mutate({ id: buyback.id, sourceValue: sourceDraft })}
                    >
                      Save source
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setEditingSourceId('')}>
                      Cancel
                    </Button>
                  </div>
                  {buybackSourceMutation.error && <p className="text-sm text-danger">{buybackSourceMutation.error.message}</p>}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function sourceValueForTransaction(tx: Transaction) {
  return tx.eventId || 'daily';
}

function sourceValueForBuyback(buyback: Buyback) {
  return buyback.eventId || 'daily';
}

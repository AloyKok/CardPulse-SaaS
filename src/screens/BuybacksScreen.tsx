import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, CalendarDays, CalendarRange, Edit3, HandCoins, PackagePlus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, SelectInput, TextArea, TextInput } from '../components/Field';
import { PageHeader, StatCard, Surface } from '../components/Page';
import { formatShowEventOptionLabel, getShowEventTiming, sortShowEventOptions } from '../lib/events/dateRange';
import { formatMoney } from '../lib/format/money';
import { getRevenueMonth, matchesSaleScope } from '../lib/reports/revenuePeriods';
import { useOrg } from '../lib/org/OrgProvider';
import { useAuth } from '../lib/supabase/AuthProvider';
import { createBuyback, deleteBuyback, getSettings, listBuybacks, listEvents, updateBuyback, updateBuybackProcessingStatus } from '../lib/supabase/api';
import { useCartStore } from '../store/cartStore';
import type { Buyback, BuybackProcessingStatus, PaymentMethod } from '../types/domain';

export function BuybacksScreen() {
  const { organization } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const cartContext = useCartStore();
  const [sellerName, setSellerName] = useState('');
  const [itemSummary, setItemSummary] = useState('');
  const [itemCount, setItemCount] = useState('1');
  const [totalPaid, setTotalPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [editingBuybackId, setEditingBuybackId] = useState('');
  const [editDrafts, setEditDrafts] = useState<Record<string, BuybackEditDraft>>({});

  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const buybacksQuery = useQuery({ queryKey: ['buybacks', organization.id], queryFn: () => listBuybacks(organization.id, 1000) });
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const selectedEvent = events.find((event) => event.id === cartContext.eventId);
  const hasContext = cartContext.saleMode === 'daily' || (cartContext.saleMode === 'show' && Boolean(selectedEvent));
  const symbol = settingsQuery.data?.currencySymbol || 'S$';
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const buybacks = (buybacksQuery.data || []).filter((buyback) => matchesSaleScope(buyback, sourceFilter));
  const completedBuybacks = buybacks.filter((buyback) => buyback.status === 'completed');
  const processingChecklist = completedBuybacks.filter((buyback) => buyback.processingStatus !== 'processed');
  const totalSpend = completedBuybacks.reduce((sum, buyback) => sum + buyback.totalPaid, 0);

  const mutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Not signed in');
      if (!hasContext) throw new Error('Choose Daily buyback or select a card show');
      return createBuyback(organization.id, user.id, {
        eventId: cartContext.saleMode === 'show' ? selectedEvent?.id || null : null,
        sellerName,
        itemSummary,
        itemCount: Number(itemCount),
        totalPaid: Number(totalPaid),
        paymentMethod,
        notes
      });
    },
    onSuccess: async () => {
      setSellerName('');
      setItemSummary('');
      setItemCount('1');
      setTotalPaid('');
      setNotes('');
      await queryClient.invalidateQueries({ queryKey: ['buybacks', organization.id] });
    }
  });
  const processingMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BuybackProcessingStatus }) => updateBuybackProcessingStatus(organization.id, id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['buybacks', organization.id] })
  });
  const editMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: BuybackEditDraft }) => updateBuyback(organization.id, id, {
      eventId: draft.sourceValue === 'daily' ? null : draft.sourceValue,
      sellerName: draft.sellerName,
      itemSummary: draft.itemSummary,
      itemCount: Number(draft.itemCount),
      totalPaid: Number(draft.totalPaid),
      paymentMethod: draft.paymentMethod,
      notes: draft.notes
    }),
    onSuccess: async () => {
      setEditingBuybackId('');
      await queryClient.invalidateQueries({ queryKey: ['buybacks', organization.id] });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBuyback(organization.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['buybacks', organization.id] })
  });

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Buying desk"
        title="Buybacks"
        description="Record collections, lots, sealed products, and post-show processing."
        action={(
          <Link to="/" className="flex min-h-11 shrink-0 items-center rounded-lg border border-line bg-white px-4 text-sm font-black shadow-sm">
            Sell
          </Link>
        )}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Spend" value={formatMoney(totalSpend, symbol)} detail={`${completedBuybacks.length} completed`} />
          <StatCard label="Needs processing" value={processingChecklist.length} tone={processingChecklist.length ? 'warn' : 'good'} />
          <StatCard label="Visible records" value={buybacks.length} />
          <StatCard label="Context" value={cartContext.saleMode === 'show' ? 'Card show' : 'Daily'} />
        </div>
      </PageHeader>

      <Surface className="grid gap-3">
        <div>
          <p className="text-sm font-bold text-slate-700">Buyback tracking</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={cartContext.saleMode === 'daily'}
              className={`flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-bold ${cartContext.saleMode === 'daily' ? 'border-action bg-emerald-50 text-action' : 'border-line bg-white text-slate-700'}`}
              onClick={() => {
                cartContext.setSaleMode('daily');
                cartContext.setEventId('');
              }}
            >
              <ShoppingBag className="shrink-0" size={19} /> Daily
            </button>
            <button
              type="button"
              aria-pressed={cartContext.saleMode === 'show'}
              className={`flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-bold ${cartContext.saleMode === 'show' ? 'border-action bg-emerald-50 text-action' : 'border-line bg-white text-slate-700'}`}
              onClick={() => cartContext.setSaleMode('show')}
            >
              <CalendarRange className="shrink-0" size={19} /> Card show
            </button>
          </div>
        </div>
        {cartContext.saleMode === 'show' && (
          <>
            <Field label="Card show">
              <SelectInput
                value={cartContext.eventId}
                onValueChange={cartContext.setEventId}
                options={[
                  { value: '', label: 'Select a show' },
                  ...sortShowEventOptions(events).map((event) => ({
                    value: event.id,
                    label: formatShowEventOptionLabel(event, { includeLocation: true }),
                    muted: getShowEventTiming(event) === 'past'
                  }))
                ]}
              />
            </Field>
            {!eventsQuery.isLoading && events.length === 0 && (
              <Link to="/show" className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-action px-4 py-2 text-sm font-semibold text-white">
                <CalendarDays size={18} /> Create first show
              </Link>
            )}
          </>
        )}
        {hasContext && (
          <p className="text-sm font-semibold text-action">
            {cartContext.saleMode === 'daily'
              ? 'Buybacks will be recorded as daily buybacks.'
              : `Buybacks will be recorded under ${selectedEvent?.name}.`}
          </p>
        )}
      </Surface>

      <form
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="flex items-center gap-2">
          <HandCoins className="text-action" size={20} />
          <h3 className="text-lg font-black">Record buyback</h3>
        </div>
        <Field label="What did you buy?">
          <TextInput
            value={itemSummary}
            onChange={(event) => setItemSummary(event.target.value)}
            placeholder="e.g. OP singles lot, Japanese bulk, sealed box"
            required
          />
        </Field>
        <div className="grid gap-2 min-[420px]:grid-cols-2">
          <Field label="Total paid">
            <TextInput
              type="text"
              inputMode="decimal"
              value={totalPaid}
              onChange={(event) => setTotalPaid(sanitizeDecimalInput(event.target.value))}
              placeholder="0.00"
              required
            />
          </Field>
          <Field label="Item count">
            <TextInput
              type="text"
              inputMode="numeric"
              value={itemCount}
              onChange={(event) => setItemCount(event.target.value.replace(/\D/g, ''))}
              required
            />
          </Field>
        </div>
        <div className="grid gap-2 min-[420px]:grid-cols-2">
          <Field label="Paid by">
            <SelectInput
              value={paymentMethod}
              onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'card', label: 'Card' },
                { value: 'other', label: 'Other' }
              ]}
            />
          </Field>
          <Field label="Seller name">
            <TextInput value={sellerName} onChange={(event) => setSellerName(event.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <Field label="Notes">
          <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional condition, agreed terms, or follow-up" />
        </Field>
        {mutation.error && <p className="text-sm text-danger">{mutation.error.message}</p>}
        <Button type="submit" className="min-h-14 text-base" disabled={!hasContext || mutation.isPending}>
          {mutation.isPending ? 'Recording...' : `Record buyback${Number(totalPaid) > 0 ? ` / ${formatMoney(Number(totalPaid), symbol)}` : ''}`}
        </Button>
      </form>

      <section className="grid gap-3">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black">Processing checklist</h3>
              <p className="text-sm text-slate-600">
                {processingChecklist.length} buybacks still need inventory processing.
              </p>
            </div>
            <Link to="/inventory" className="flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-bold">
              <PackagePlus size={17} /> Inventory
            </Link>
          </div>
          <div className="mt-3 grid gap-2">
            {processingChecklist.length === 0 && (
              <p className="rounded-md bg-emerald-50 p-3 text-sm font-bold text-emerald-800">All completed buybacks are processed.</p>
            )}
            {processingChecklist.map((buyback) => (
              <article key={`checklist-${buyback.id}`} className="grid gap-2 rounded-md border border-line bg-slate-50 p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-black">{buyback.itemSummary}</p>
                    <p className="text-sm font-bold">{formatMoney(buyback.totalPaid, symbol)} / {buyback.itemCount} items</p>
                    <p className="text-xs font-semibold text-slate-600">
                      {buyback.eventId ? eventsById.get(buyback.eventId)?.name || 'Unknown show' : 'Daily buyback'} / {new Date(buyback.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-1 text-xs font-black ${processingTone(buyback.processingStatus)}`}>
                    {processingLabel(buyback.processingStatus)}
                  </span>
                </div>
                <div className="grid gap-2 min-[420px]:grid-cols-3">
                  <Link
                    to={`/inventory?buybackId=${buyback.id}`}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-action px-3 text-sm font-bold text-white"
                  >
                    <PackagePlus size={17} /> Create inventory
                  </Link>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={processingMutation.isPending || buyback.processingStatus === 'partially_processed'}
                    onClick={() => processingMutation.mutate({ id: buyback.id, status: 'partially_processed' })}
                  >
                    Mark partial
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex items-center justify-center gap-2"
                    disabled={processingMutation.isPending}
                    onClick={() => processingMutation.mutate({ id: buyback.id, status: 'processed' })}
                  >
                    <CheckCircle2 size={17} /> Processed
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {processingMutation.error && <p className="mt-2 text-sm text-danger">{processingMutation.error.message}</p>}
        </div>

        <div className="grid gap-2 min-[420px]:grid-cols-[1fr_auto] min-[420px]:items-end">
          <div>
            <h3 className="text-lg font-black">Buyback history</h3>
            <p className="text-sm text-slate-600">{completedBuybacks.length} completed / {formatMoney(totalSpend, symbol)} spent</p>
          </div>
          <Field label="Source">
            <SelectInput
              value={sourceFilter}
              onValueChange={setSourceFilter}
              options={[
                { value: '', label: 'All buybacks' },
                { value: 'daily', label: 'Daily buybacks' },
                { value: 'shows', label: 'All card shows' },
                ...sortShowEventOptions(events).map((event) => ({ value: event.id, label: formatShowEventOptionLabel(event), muted: getShowEventTiming(event) === 'past' }))
              ]}
            />
          </Field>
        </div>
        {buybacks.length === 0 && <p className="rounded-2xl border border-line bg-white p-4 text-sm font-semibold text-slate-600 shadow-sm">No buybacks recorded yet.</p>}
        {buybacks.map((buyback) => (
          <article key={buyback.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="flex min-w-0 justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-black">{buyback.itemSummary}</p>
                <p className="text-sm font-bold">{formatMoney(buyback.totalPaid, symbol)} / {buyback.itemCount} items / {buyback.paymentMethod}</p>
                <p className="text-xs text-slate-600">{new Date(buyback.createdAt).toLocaleString()}</p>
                <p className="mt-1 inline-flex max-w-full break-words rounded bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800">
                  {buyback.eventId ? eventsById.get(buyback.eventId)?.name || 'Unknown show' : 'Daily buyback'}
                </p>
                {buyback.eventId && (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Report month: {getRevenueMonth(buyback, eventsById)}
                  </p>
                )}
                {buyback.sellerName && <p className="mt-1 text-xs text-slate-600">Seller: {buyback.sellerName}</p>}
                <p className={`mt-1 text-xs font-bold ${buyback.status === 'completed' ? 'text-action' : 'text-danger'}`}>{buyback.status}</p>
                <p className={`mt-1 inline-flex rounded px-2 py-1 text-xs font-black ${processingTone(buyback.processingStatus)}`}>
                  {processingLabel(buyback.processingStatus)}
                </p>
              </div>
              <div className="grid shrink-0 content-start gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex items-center justify-center gap-2 px-3"
                  onClick={() => {
                    setEditingBuybackId(editingBuybackId === buyback.id ? '' : buyback.id);
                    setEditDrafts((current) => ({ ...current, [buyback.id]: draftFromBuyback(buyback) }));
                  }}
                >
                  <Edit3 size={16} /> {editingBuybackId === buyback.id ? 'Close' : 'Edit'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex items-center justify-center gap-2 px-3 text-danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`Permanently delete this buyback entry?\n\n${buyback.itemSummary}\n${formatMoney(buyback.totalPaid, symbol)}\n\nUse this only for wrong entries.`)) {
                      deleteMutation.mutate(buyback.id);
                    }
                  }}
                >
                  <Trash2 size={16} /> Delete
                </Button>
              </div>
            </div>
            {editingBuybackId === buyback.id && (
              <BuybackEditForm
                draft={editDrafts[buyback.id] || draftFromBuyback(buyback)}
                events={events}
                symbol={symbol}
                isSaving={editMutation.isPending}
                error={editMutation.error}
                onChange={(draft) => setEditDrafts((current) => ({ ...current, [buyback.id]: draft }))}
                onCancel={() => setEditingBuybackId('')}
                onSave={(draft) => editMutation.mutate({ id: buyback.id, draft })}
              />
            )}
          </article>
        ))}
        {deleteMutation.error && <p className="text-sm text-danger">{deleteMutation.error.message}</p>}
      </section>
    </div>
  );
}

interface BuybackEditDraft {
  sourceValue: string;
  itemSummary: string;
  totalPaid: string;
  itemCount: string;
  paymentMethod: PaymentMethod;
  sellerName: string;
  notes: string;
}

function draftFromBuyback(buyback: Buyback): BuybackEditDraft {
  return {
    sourceValue: buyback.eventId || 'daily',
    itemSummary: buyback.itemSummary,
    totalPaid: String(buyback.totalPaid),
    itemCount: String(buyback.itemCount),
    paymentMethod: buyback.paymentMethod,
    sellerName: buyback.sellerName || '',
    notes: buyback.notes || ''
  };
}

function BuybackEditForm({
  draft,
  events,
  symbol,
  isSaving,
  error,
  onChange,
  onCancel,
  onSave
}: {
  draft: BuybackEditDraft;
  events: BuybackEventOption[];
  symbol: string;
  isSaving: boolean;
  error: Error | null;
  onChange: (draft: BuybackEditDraft) => void;
  onCancel: () => void;
  onSave: (draft: BuybackEditDraft) => void;
}) {
  return (
    <form
      className="mt-3 grid gap-3 rounded-md bg-slate-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">Edit buyback</p>
        <p className="text-xs text-slate-500">Fix wrong entry details without changing the original record date.</p>
      </div>
      <Field label="Source">
        <SelectInput
          value={draft.sourceValue}
          onValueChange={(value) => onChange({ ...draft, sourceValue: value })}
          options={[
            { value: 'daily', label: 'Daily buyback' },
            ...sortShowEventOptions(events).map((event) => ({ value: event.id, label: formatShowEventOptionLabel(event), muted: getShowEventTiming(event) === 'past' }))
          ]}
        />
      </Field>
      <Field label="What did you buy?">
        <TextInput value={draft.itemSummary} onChange={(event) => onChange({ ...draft, itemSummary: event.target.value })} required />
      </Field>
      <div className="grid gap-2 min-[420px]:grid-cols-2">
        <Field label="Total paid">
          <TextInput
            type="text"
            inputMode="decimal"
            value={draft.totalPaid}
            onChange={(event) => onChange({ ...draft, totalPaid: sanitizeDecimalInput(event.target.value) })}
            required
          />
        </Field>
        <Field label="Item count">
          <TextInput
            type="text"
            inputMode="numeric"
            value={draft.itemCount}
            onChange={(event) => onChange({ ...draft, itemCount: event.target.value.replace(/\D/g, '') })}
            required
          />
        </Field>
      </div>
      <div className="grid gap-2 min-[420px]:grid-cols-2">
        <Field label="Paid by">
          <SelectInput
            value={draft.paymentMethod}
            onValueChange={(value) => onChange({ ...draft, paymentMethod: value as PaymentMethod })}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' },
              { value: 'other', label: 'Other' }
            ]}
          />
        </Field>
        <Field label="Seller name">
          <TextInput value={draft.sellerName} onChange={(event) => onChange({ ...draft, sellerName: event.target.value })} />
        </Field>
      </div>
      <Field label="Notes">
        <TextArea value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} />
      </Field>
      {error && <p className="text-sm text-danger">{error.message}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" disabled={isSaving || !draft.itemSummary.trim() || Number(draft.totalPaid) <= 0 || Number(draft.itemCount) <= 0}>
          {isSaving ? 'Saving...' : `Save ${Number(draft.totalPaid) > 0 ? formatMoney(Number(draft.totalPaid), symbol) : ''}`}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type BuybackEventOption = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  location?: string | null;
};

function processingLabel(status: BuybackProcessingStatus) {
  if (status === 'partially_processed') return 'Partial';
  if (status === 'processed') return 'Processed';
  return 'Unprocessed';
}

function processingTone(status: BuybackProcessingStatus) {
  if (status === 'processed') return 'bg-emerald-50 text-emerald-800';
  if (status === 'partially_processed') return 'bg-amber-50 text-amber-900';
  return 'bg-slate-200 text-slate-800';
}

function sanitizeDecimalInput(value: string) {
  const clean = value.replace(/[^\d.]/g, '');
  const firstDot = clean.indexOf('.');
  if (firstDot === -1) return clean;
  return clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '');
}

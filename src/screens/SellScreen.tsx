import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, CalendarRange, HandCoins, Minus, Plus, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, SelectInput, TextArea, TextInput } from '../components/Field';
import { PageHeader, Surface } from '../components/Page';
import { QrScanner } from '../components/QrScanner';
import { formatShowEventOptionLabel, getShowEventTiming, sortShowEventOptions } from '../lib/events/dateRange';
import { formatMoney } from '../lib/format/money';
import { getCartSubtotal, lineIdFor, lineUnitPrice, useCartStore } from '../store/cartStore';
import { completeSale, getSettings, listEvents, listInventory } from '../lib/supabase/api';
import { cacheInventory, getCachedInventory, queueSale, syncQueuedSales } from '../lib/queue/offlineQueue';
import { useOrg } from '../lib/org/OrgProvider';
import type { InventoryItem } from '../types/domain';

export function SellScreen() {
  const { organization } = useOrg();
  const queryClient = useQueryClient();
  const [scannerError, setScannerError] = useState('');
  const [manual, setManual] = useState('');
  const [miscName, setMiscName] = useState('Others');
  const [miscAmount, setMiscAmount] = useState('');
  const [showMiscSale, setShowMiscSale] = useState(false);
  const [finalTotalDraft, setFinalTotalDraft] = useState('');
  const [editingFinalTotal, setEditingFinalTotal] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const cart = useCartStore();
  const cartEventId = cart.eventId;
  const setCartEventId = useCartStore((state) => state.setEventId);
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const inventoryQuery = useQuery({
    queryKey: ['inventory', organization.id, 'sell-cache'],
    queryFn: async () => {
      const items = await listInventory(organization.id);
      await cacheInventory(organization.id, items);
      return items;
    }
  });
  const inventory = useMemo(() => inventoryQuery.data || [], [inventoryQuery.data]);
  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const selectedEvent = events.find((event) => event.id === cartEventId);
  const hasSaleContext = cart.saleMode === 'daily' || (cart.saleMode === 'show' && Boolean(selectedEvent));
  const saleContextLabel = cart.saleMode === 'daily' ? 'Daily sales' : selectedEvent?.name || 'Not selected';
  const subtotal = getCartSubtotal(cart.lines);
  const total = Math.min(subtotal, Math.max(0, cart.finalTotal ?? subtotal));
  const discount = Math.max(0, subtotal - total);
  const currencySymbol = settingsQuery.data?.currencySymbol || 'S$';
  const floorWarnings = cart.lines
    .map((line) => {
      if (line.kind !== 'inventory') return null;
      if (!line.item.floorPrice || subtotal <= 0) return null;
      const effectiveUnitPrice = (line.item.askingPrice * (total / subtotal));
      if (effectiveUnitPrice >= line.item.floorPrice) return null;
      return `${line.item.itemName} effective price ${formatMoney(effectiveUnitPrice, currencySymbol)} is below floor ${formatMoney(line.item.floorPrice, currencySymbol)}`;
    })
    .filter((warning): warning is string => Boolean(warning));

  useEffect(() => {
    syncQueuedSales().then(() => queryClient.invalidateQueries({ queryKey: ['history', organization.id] })).catch(() => undefined);
  }, [organization.id, queryClient]);

  useEffect(() => {
    if (editingFinalTotal) return;
    setFinalTotalDraft(formatEditableAmount(total));
  }, [editingFinalTotal, total]);

  useEffect(() => {
    const loadedEvents = eventsQuery.data;
    if (!loadedEvents || !cartEventId) return;
    if (!loadedEvents.some((event) => event.id === cartEventId)) {
      setCartEventId('');
    }
  }, [cartEventId, eventsQuery.data, setCartEventId]);

  const resolveItem = useCallback(async (code: string) => {
    const value = code.trim();
    const cached = inventory.length ? inventory : await getCachedInventory(organization.id);
    return cached.find((item) => item.id === value || item.itemNumber.toLowerCase() === value.toLowerCase()) || null;
  }, [inventory, organization.id]);

  const addScannedItem = useCallback(async (value: string) => {
    if (!hasSaleContext) {
      showFeedback(setFlash, 'error', 'Choose Daily sales or select a card show');
      return;
    }
    const item = await resolveItem(value);
    if (!item) {
      showFeedback(setFlash, 'error', 'Item not found');
      return;
    }
    if (item.quantity <= 0 || item.status !== 'in_stock') {
      showFeedback(setFlash, 'error', `${item.itemName} is not available`);
      return;
    }
    cart.addItem(item, 1);
    showFeedback(setFlash, 'ok', `${item.itemName} ${formatMoney(item.askingPrice, currencySymbol)}`);
  }, [cart, currencySymbol, hasSaleContext, resolveItem]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!hasSaleContext) throw new Error('Choose Daily sales or select a card show');
      if (!cart.lines.length) throw new Error('Cart is empty');
      const payload = {
        orgId: organization.id,
        cart: cart.lines.map((line) => line.kind === 'inventory'
          ? { kind: 'inventory' as const, inventoryItemId: line.item.id, quantity: line.quantity }
          : { kind: 'misc' as const, name: line.name, quantity: line.quantity, unitPrice: line.unitPrice }
        ),
        discount,
        paymentMethod: cart.paymentMethod,
        eventId: cart.saleMode === 'show' ? selectedEvent?.id || null : null,
        clientRef: crypto.randomUUID(),
        notes: cart.notes || null
      };

      if (!navigator.onLine) {
        await queueSale(payload);
        return { queued: true as const };
      }

      try {
        const transaction = await completeSale(payload);
        return { queued: false as const, transaction };
      } catch (error) {
        if (!navigator.onLine) {
          await queueSale(payload);
          return { queued: true as const };
        }
        throw error;
      }
    },
    onSuccess: async (result) => {
      cart.clear();
      await queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });
      await queryClient.invalidateQueries({ queryKey: ['history', organization.id] });
      showFeedback(setFlash, 'ok', result.queued ? 'Sale queued for sync' : 'Sale completed');
    }
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="lg:col-span-2">
        <PageHeader
          eyebrow="Checkout console"
          title="Sell"
          description={`${saleContextLabel} / ${cart.lines.length} cart lines / ${formatMoney(total, currencySymbol)} total`}
          action={(
            <Link to="/buybacks" className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-black text-ink shadow-sm">
              <HandCoins size={18} /> Buy
            </Link>
          )}
        />
      </div>
      <section className="grid gap-4">
        <Surface className="grid gap-3">
          <div>
            <p className="text-sm font-black text-slate-700">Sale tracking</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={cart.saleMode === 'daily'}
                className={`flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black transition ${cart.saleMode === 'daily' ? 'border-ink bg-ink text-white shadow-soft' : 'border-line bg-white text-slate-700 hover:bg-slate-50'}`}
                onClick={() => changeSaleMode('daily')}
              >
                <ShoppingBag className="shrink-0" size={19} /> Daily sales
              </button>
              <button
                type="button"
                aria-pressed={cart.saleMode === 'show'}
                className={`flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black transition ${cart.saleMode === 'show' ? 'border-ink bg-ink text-white shadow-soft' : 'border-line bg-white text-slate-700 hover:bg-slate-50'}`}
                onClick={() => changeSaleMode('show')}
              >
                <CalendarRange className="shrink-0" size={19} /> Card show
              </button>
            </div>
          </div>
          {cart.saleMode === 'show' && (
            <>
              <Field label="Card show">
                <SelectInput
                  value={cart.eventId}
                  onValueChange={(nextEventId) => {
                    if (cart.lines.length && nextEventId !== cart.eventId) {
                      if (!confirm('Changing the show will clear the current cart. Continue?')) return;
                      cart.clear();
                    }
                    cart.setEventId(nextEventId);
                    setFlash(null);
                  }}
                  options={[
                    { value: '', label: 'Select a show before selling' },
                    ...sortShowEventOptions(events).map((event) => ({
                      value: event.id,
                      label: formatShowEventOptionLabel(event, { includeLocation: true }),
                      muted: getShowEventTiming(event) === 'past'
                    }))
                  ]}
                />
              </Field>
              {!eventsQuery.isLoading && events.length === 0 && (
                <Link to="/show" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-black text-white">
                  <CalendarDays size={18} /> Create first show
                </Link>
              )}
            </>
          )}
          {hasSaleContext && (
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-action">
                {cart.saleMode === 'daily'
                  ? 'Sales will be recorded as daily transactions.'
                  : `Sales will be recorded under ${selectedEvent?.name}.`}
              </p>
              <Link to="/buybacks" className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-slate-700">
                <HandCoins size={18} /> Buy in this context
              </Link>
            </div>
          )}
        </Surface>
        {hasSaleContext ? (
          <>
            <QrScanner active onScan={addScannedItem} onError={setScannerError} />
            {scannerError && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{scannerError}</p>}
          </>
        ) : (
          <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-line bg-white p-6 text-center shadow-sm">
            <div>
              <CalendarDays className="mx-auto text-slate-400" size={32} />
              <p className="mt-2 font-bold">Choose how to track this sale</p>
              <p className="mt-1 text-sm text-slate-600">Use Daily sales or select a card show.</p>
            </div>
          </div>
        )}
        {flash && (
          <div className={`rounded-lg p-3 text-sm font-bold ${flash.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-danger'}`}>
            {flash.text}
          </div>
        )}
        <form
          className="rounded-2xl border border-line bg-white p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (!hasSaleContext) return;
            addScannedItem(manual);
            setManual('');
          }}
        >
          <Field label="Manual add">
            <div className="flex min-w-0 gap-2">
              <TextInput
                className="min-w-0 flex-1"
                placeholder="Item number or QR UUID"
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                disabled={!hasSaleContext}
              />
              <Button type="submit" className="grid min-w-11 place-items-center px-3" aria-label="Add manual item" disabled={!hasSaleContext || !manual.trim()}>
                <Search size={18} />
              </Button>
            </div>
          </Field>
          {hasSaleContext && <ManualResults items={inventory} query={manual} onAdd={addScannedItem} currencySymbol={currencySymbol} />}
        </form>
        <div className="grid gap-2">
          {!showMiscSale ? (
            <Button
              type="button"
              variant="secondary"
              className="flex min-h-12 items-center justify-center gap-2"
              disabled={!hasSaleContext}
              onClick={() => setShowMiscSale(true)}
            >
              <Plus size={18} /> Misc sale
            </Button>
          ) : (
            <form
              className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm"
              onSubmit={(event) => {
                event.preventDefault();
                if (!hasSaleContext) return;
                const amount = Number(miscAmount);
                if (!Number.isFinite(amount) || amount <= 0) {
                  showFeedback(setFlash, 'error', 'Enter a misc amount');
                  return;
                }
                cart.addMiscLine(miscName || 'Others', amount, 1);
                setMiscName('Others');
                setMiscAmount('');
                setShowMiscSale(false);
                showFeedback(setFlash, 'ok', `Added misc ${formatMoney(amount, currencySymbol)}`);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-700">Misc sale</p>
                  <p className="mt-1 text-xs text-slate-500">For bulk commons or small items not logged in inventory.</p>
                </div>
                <button type="button" className="min-h-11 px-2 text-sm font-bold text-slate-500" onClick={() => setShowMiscSale(false)}>
                  Close
                </button>
              </div>
              <div className="grid gap-2 min-[420px]:grid-cols-[minmax(0,1fr)_9rem_auto]">
                <TextInput
                  value={miscName}
                  onChange={(event) => setMiscName(event.target.value)}
                  placeholder="Others"
                  disabled={!hasSaleContext}
                />
                <TextInput
                  type="text"
                  inputMode="decimal"
                  value={miscAmount}
                  onChange={(event) => setMiscAmount(sanitizeDecimalInput(event.target.value))}
                  placeholder="Amount"
                  disabled={!hasSaleContext}
                />
                <Button type="submit" className="min-w-24" disabled={!hasSaleContext || !miscAmount}>Add</Button>
              </div>
            </form>
          )}
        </div>
      </section>

      <aside className="grid content-start gap-3 lg:sticky lg:top-6">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black">Cart</h3>
            <p className="text-sm font-semibold text-slate-600">{cart.lines.length} lines</p>
          </div>
          <div className="mt-3 grid gap-2">
            {cart.lines.length === 0 && <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">Cart is empty.</p>}
            {cart.lines.map((line) => {
              const lineId = lineIdFor(line);
              const unitPrice = lineUnitPrice(line);
              return (
              <div key={lineId} className="min-w-0 rounded-md border border-line p-3">
                <div className="flex min-w-0 justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-bold">{line.kind === 'inventory' ? line.item.itemName : line.name}</p>
                    {line.kind === 'inventory' ? (
                      <>
                        <p className="break-all text-xs text-slate-600">{line.item.itemNumber}</p>
                        <p className="break-words text-xs text-slate-600">{line.item.rarity} / {line.item.art} / {line.item.category} / {line.item.condition}</p>
                        {line.item.floorPrice ? <p className="text-xs font-semibold text-slate-500">Floor {formatMoney(line.item.floorPrice, currencySymbol)}</p> : null}
                      </>
                    ) : (
                      <p className="break-words text-xs font-semibold text-slate-600">Misc / not tracked in inventory</p>
                    )}
                    <p className="text-sm font-semibold">{formatMoney(unitPrice, currencySymbol)}</p>
                  </div>
                  <button type="button" className="grid min-h-11 min-w-11 place-items-center text-danger" onClick={() => cart.removeItem(lineId)} aria-label="Remove">
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line" onClick={() => cart.setQuantity(lineId, line.quantity - 1)} aria-label="Decrease">
                    <Minus size={16} />
                  </button>
                  <span className="text-lg font-black">{line.quantity}</span>
                  <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line" onClick={() => cart.setQuantity(lineId, line.quantity + 1)} aria-label="Increase">
                    <Plus size={16} />
                  </button>
                  <span className="ml-auto font-black">{formatMoney(unitPrice * line.quantity, currencySymbol)}</span>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-3 shadow-soft lg:sticky lg:top-24 lg:self-start">
          <div className="grid gap-3">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Sale tracking</p>
              <p className="mt-1 font-bold">{saleContextLabel}</p>
            </div>
            <div className="flex justify-between text-sm"><span>Subtotal</span><strong>{formatMoney(subtotal, currencySymbol)}</strong></div>
            <Field label="Final total">
              <TextInput
                type="text"
                inputMode="decimal"
                value={editingFinalTotal ? finalTotalDraft : formatEditableAmount(total)}
                onFocus={() => {
                  setEditingFinalTotal(true);
                  setFinalTotalDraft(formatEditableAmount(total));
                }}
                onBlur={() => {
                  setEditingFinalTotal(false);
                  setFinalTotalDraft(formatEditableAmount(total));
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Backspace' || event.key === 'Delete') {
                    event.stopPropagation();
                  }
                }}
                onChange={(event) => {
                  const nextDraft = sanitizeDecimalInput(event.target.value);
                  const nextTotal = parseDecimalInput(nextDraft);
                  setFinalTotalDraft(nextDraft);
                  cart.setFinalTotal(nextTotal === null ? 0 : Math.min(subtotal, nextTotal));
                }}
                disabled={!cart.lines.length}
              />
            </Field>
            {discount > 0 && <div className="flex justify-between text-sm text-action"><span>Price adjustment</span><strong>-{formatMoney(discount, currencySymbol)}</strong></div>}
            {floorWarnings.length > 0 && (
              <div className="grid gap-1 rounded-md bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                {floorWarnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            )}
            <Field label="Payment">
              <SelectInput
                value={cart.paymentMethod}
                onValueChange={(value) => cart.setPaymentMethod(value as typeof cart.paymentMethod)}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'card', label: 'Card' },
                  { value: 'other', label: 'Other' }
                ]}
              />
            </Field>
            <Field label="Notes">
              <TextArea value={cart.notes} onChange={(event) => cart.setNotes(event.target.value)} />
            </Field>
            {checkoutMutation.error && <p className="text-sm text-danger">{checkoutMutation.error.message}</p>}
            <Button className="min-h-14 text-base" disabled={!hasSaleContext || !cart.lines.length || checkoutMutation.isPending} onClick={() => checkoutMutation.mutate()}>
              {checkoutMutation.isPending ? 'Completing...' : `Complete ${formatMoney(total, currencySymbol)}`}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );

  function changeSaleMode(nextMode: 'daily' | 'show') {
    if (nextMode === cart.saleMode) return;
    if (cart.lines.length && !confirm('Changing sale tracking will clear the current cart. Continue?')) return;
    if (cart.lines.length) cart.clear();
    cart.setSaleMode(nextMode);
    if (nextMode === 'daily') cart.setEventId('');
    setFlash(null);
  }
}

function ManualResults({ items, query, onAdd, currencySymbol }: { items: InventoryItem[]; query: string; onAdd: (value: string) => void; currencySymbol: string }) {
  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (value.length < 2) return [];
    return items
      .filter((item) => [item.itemName, item.itemNumber, item.cardNumber, item.productCategory].filter(Boolean).join(' ').toLowerCase().includes(value))
      .slice(0, 5);
  }, [items, query]);

  if (!results.length) return null;

  return (
    <div className="mt-3 grid gap-1">
      {results.map((item) => (
        <button key={item.id} type="button" className="min-h-11 min-w-0 rounded-md bg-slate-50 px-3 py-2 text-left text-sm" onClick={() => onAdd(item.id)}>
          <strong className="break-words">{item.itemName}</strong>
          <span className="block break-all text-xs text-slate-600">{item.itemNumber} / {formatMoney(item.askingPrice, currencySymbol)}</span>
        </button>
      ))}
    </div>
  );
}

function showFeedback(setFlash: (value: { tone: 'ok' | 'error'; text: string }) => void, tone: 'ok' | 'error', text: string) {
  setFlash({ tone, text });
  if (tone === 'ok') {
    try {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      oscillator.frequency.value = 880;
      oscillator.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.05);
    } catch {
      // Audio feedback is best-effort; vibration/visual feedback still run.
    }
  }
  navigator.vibrate?.(tone === 'ok' ? 40 : [30, 40, 30]);
}

function sanitizeDecimalInput(value: string) {
  const clean = value.replace(/[^\d.]/g, '');
  const firstDot = clean.indexOf('.');
  if (firstDot === -1) return clean;
  return clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '');
}

function parseDecimalInput(value: string) {
  if (!value.trim() || value === '.') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEditableAmount(value: number) {
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value * 100) / 100);
}

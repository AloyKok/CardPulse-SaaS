import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, HandCoins, Printer, RefreshCcw, TrendingDown, TrendingUp } from 'lucide-react';
import { Field, SelectInput, TextInput } from '../components/Field';
import { PageHeader, Surface } from '../components/Page';
import { formatMoney, formatPercent } from '../lib/format/money';
import { lineFinalProfit, lineFinalTotal } from '../lib/reports/profit';
import { getLocalDateKey, getLocalMonthKey, getRevenueMonth } from '../lib/reports/revenuePeriods';
import { getQueuedSales } from '../lib/queue/offlineQueue';
import { getSettings, listBuybacks, listEvents, listInventory, listMarketPriceSnapshots, listTransactions } from '../lib/supabase/api';
import { useMembershipsQuery, useOrg } from '../lib/org/OrgProvider';
import type { Buyback, InventoryItem, MarketPriceSnapshot, Settings, ShowEvent, Transaction } from '../types/domain';

type TimePeriod = 'today' | 'show' | 'month' | 'custom';
type ChannelFilter = 'all' | 'walk-in' | 'show';

export function DashboardScreen() {
  const { organization } = useOrg();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [adminId, setAdminId] = useState('');
  const [customStart, setCustomStart] = useState(getLocalDateKey());
  const [customEnd, setCustomEnd] = useState(getLocalDateKey());
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'dashboard'], queryFn: () => listInventory(organization.id) });
  const marketSnapshotsQuery = useQuery({ queryKey: ['market-snapshots', organization.id, 'dashboard'], queryFn: () => listMarketPriceSnapshots(organization.id) });
  const salesQuery = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 5000) });
  const buybacksQuery = useQuery({ queryKey: ['buybacks', organization.id], queryFn: () => listBuybacks(organization.id, 5000) });
  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const queueQuery = useQuery({ queryKey: ['pending-sales'], queryFn: getQueuedSales, refetchInterval: 15000 });
  const membershipsQuery = useMembershipsQuery();

  const inventory = useMemo(() => inventoryQuery.data || [], [inventoryQuery.data]);
  const transactions = useMemo(() => salesQuery.data || [], [salesQuery.data]);
  const buybacks = useMemo(() => buybacksQuery.data || [], [buybacksQuery.data]);
  const events = useMemo(() => eventsQuery.data || [], [eventsQuery.data]);
  const settings = settingsQuery.data;
  const symbol = settings?.currencySymbol || 'S$';
  const agingDays = settings?.agingThresholdDays || 60;
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const activeShow = useMemo(() => pickActiveShow(events, settings?.activeEventId), [events, settings?.activeEventId]);
  const period = useMemo(
    () => buildPeriod(timePeriod, activeShow, customStart, customEnd),
    [activeShow, customEnd, customStart, timePeriod]
  );
  const priorPeriod = useMemo(
    () => buildPriorPeriod(timePeriod, period, activeShow, events),
    [activeShow, events, period, timePeriod]
  );

  const currentSales = useMemo(
    () => filterSales(transactions, eventsById, period, channel, adminId),
    [adminId, channel, eventsById, period, transactions]
  );
  const priorSales = useMemo(
    () => filterSales(transactions, eventsById, priorPeriod, channel, adminId),
    [adminId, channel, eventsById, priorPeriod, transactions]
  );
  const metrics = useMemo(() => summarizeSales(currentSales), [currentSales]);
  const priorMetrics = useMemo(() => summarizeSales(priorSales), [priorSales]);
  const currentBuybacks = useMemo(
    () => filterBuybacks(buybacks, eventsById, period, channel, adminId),
    [adminId, buybacks, channel, eventsById, period]
  );
  const buybackMetrics = useMemo(() => summarizeBuybacks(currentBuybacks), [currentBuybacks]);
  const inventoryHealth = useMemo(() => summarizeInventory(inventory, agingDays), [agingDays, inventory]);
  const pricingHealth = useMemo(
    () => summarizePricingHealth(inventory, marketSnapshotsQuery.data || [], settings),
    [inventory, marketSnapshotsQuery.data, settings]
  );
  const monthlyTrend = useMemo(
    () => buildMonthlyTrend(transactions, eventsById, channel, adminId),
    [adminId, channel, eventsById, transactions]
  );
  const performanceRows = useMemo(
    () => buildPerformanceRows(currentSales, currentBuybacks, eventsById),
    [currentBuybacks, currentSales, eventsById]
  );
  const topSellers = useMemo(() => buildTopSellers(currentSales), [currentSales]);
  const needsAttention = useMemo(
    () => buildAttentionItems(inventory, events, agingDays, queueQuery.data || [], pricingHealth, buybacks),
    [agingDays, buybacks, events, inventory, pricingHealth, queueQuery.data]
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Decision surface"
        title="Dashboard"
        description={`${period.label} / ${channelLabel(channel)} / ${metrics.salesCount} sales`}
      >
        <div className="grid gap-2 md:grid-cols-3">
          <Field label="Time period">
            <SelectInput
              value={timePeriod}
              onValueChange={(value) => setTimePeriod(value as TimePeriod)}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'show', label: activeShow ? `This show: ${activeShow.name}` : 'This show' },
                { value: 'month', label: 'This month' },
                { value: 'custom', label: 'Custom range' }
              ]}
            />
          </Field>
          <Field label="Channel">
            <SelectInput
              value={channel}
              onValueChange={(value) => setChannel(value as ChannelFilter)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'walk-in', label: 'Online sales' },
                { value: 'show', label: 'Card show' }
              ]}
            />
          </Field>
          <Field label="Admin">
            <SelectInput
              value={adminId}
              onValueChange={setAdminId}
              options={[
                { value: '', label: 'All' },
                ...(membershipsQuery.data || []).map((membership) => ({
                  value: membership.userId,
                  label: membership.displayName || membership.userId.slice(0, 8)
                }))
              ]}
            />
          </Field>
        </div>
        {timePeriod === 'custom' && (
          <div className="grid gap-2 min-[420px]:grid-cols-2">
            <Field label="Start date"><TextInput type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></Field>
            <Field label="End date"><TextInput type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></Field>
          </div>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeroMetric label="Revenue" value={formatMoney(metrics.revenue, symbol)} delta={compare(metrics.revenue, priorMetrics.revenue)} />
        <HeroMetric
          label="Gross profit"
          value={formatMoney(metrics.grossProfit, symbol)}
          detail={`${formatPercent(metrics.margin)} margin`}
          delta={compare(metrics.grossProfit, priorMetrics.grossProfit)}
        />
        <HeroMetric
          label="Avg sale value"
          value={formatMoney(metrics.averageSaleValue, symbol)}
          detail={`${metrics.salesCount} sales / ${metrics.unitsSold} units`}
          delta={compare(metrics.averageSaleValue, priorMetrics.averageSaleValue)}
        />
        <HeroMetric
          label="Payment split"
          value={`${formatPercent(metrics.cashPercent, 0)} / ${formatPercent(metrics.cardPercent, 0)}`}
          detail={`${formatMoney(metrics.cashTotal, symbol)} cash / ${formatMoney(metrics.cardTotal, symbol)} card`}
        />
      </div>

      <Surface>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">Buyback spend</h3>
            <p className="text-sm text-slate-600">Cash out for collections, singles, bulk, and sealed items.</p>
          </div>
          <Link to="/buybacks" className="flex min-h-11 items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
            <HandCoins size={16} /> Record
          </Link>
        </div>
        <div className="mt-4 grid gap-3 text-sm">
          <HealthRow label="Buyback spend" value={formatMoney(buybackMetrics.spend, symbol)} />
          <HealthRow label="Buyback records / items" value={`${buybackMetrics.count} / ${buybackMetrics.items}`} />
          <HealthRow label="Net cash after buybacks" value={formatMoney(metrics.revenue - buybackMetrics.spend, symbol)} accent />
        </div>
      </Surface>

      <Surface>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black">Inventory health</h3>
          <Link to="/inventory?aging=1" className="flex min-h-11 items-center rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
            {inventoryHealth.agingCount} aging
          </Link>
        </div>
        <div className="mt-4 grid gap-3 text-sm">
          <HealthRow label="Capital tied up (cost)" value={formatMoney(inventoryHealth.costValue, symbol)} />
          <HealthRow label="Potential value (ask)" value={formatMoney(inventoryHealth.askValue, symbol)} />
          <HealthRow
            label="Unrealized margin"
            value={`${formatMoney(inventoryHealth.unrealizedMargin, symbol)} / ${formatPercent(inventoryHealth.unrealizedMarginPercent)}`}
            accent
          />
          <HealthRow label="Units / distinct cards" value={`${inventoryHealth.units} / ${inventoryHealth.distinctItems}`} />
        </div>
      </Surface>

      <Surface>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black">Market pricing</h3>
          <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">±10% target</span>
        </div>
        <div className="mt-4 grid gap-3 text-sm">
          <HealthRow label="Within range" value={`${pricingHealth.withinRangeCount} items`} />
          <HealthRow
            label="Priced too high"
            value={`${pricingHealth.overpricedCount} / ${formatMoney(pricingHealth.overpricedAskPremium, symbol)} premium`}
          />
          <HealthRow
            label="Priced too low"
            value={`${pricingHealth.underpricedCount} / ${formatMoney(pricingHealth.underpricedRevenueGap, symbol)} gap`}
            accent={pricingHealth.underpricedCount > 0}
          />
          <HealthRow label="Tracked / untracked" value={`${pricingHealth.trackedCount} / ${pricingHealth.untrackedCount}`} />
        </div>
        <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2">
          <Link to="/inventory?price=over" className="flex min-h-11 items-center rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
            Review high prices
          </Link>
          <Link to="/inventory?price=under" className="flex min-h-11 items-center rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
            Review low prices
          </Link>
        </div>
      </Surface>

      <Surface>
        <h3 className="text-lg font-black">Revenue trend</h3>
        <div className="mt-4 grid h-56 grid-cols-6 items-end gap-2">
          {monthlyTrend.map((month) => (
            <div key={month.month} className="grid h-full min-w-0 content-end gap-2">
              <span className="truncate text-center text-xs font-bold text-slate-500">{formatMoney(month.revenue, symbol)}</span>
              <div className="flex min-h-0 items-end gap-1">
                <div
                  className={`min-h-2 flex-1 rounded-t ${month.current ? 'bg-sky-700' : 'bg-slate-200'}`}
                  style={{ height: `${month.revenueHeight}%` }}
                  title={`${month.label} revenue ${formatMoney(month.revenue, symbol)}`}
                />
                <div
                  className="min-h-2 flex-1 rounded-t bg-emerald-500"
                  style={{ height: `${month.profitHeight}%` }}
                  title={`${month.label} profit ${formatMoney(month.profit, symbol)}`}
                />
              </div>
              <span className={`truncate text-center text-sm font-black ${month.current ? 'text-sky-700' : 'text-slate-600'}`}>{month.shortLabel}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">Blue is revenue. Green is gross profit with blank costs estimated at 20%.</p>
      </Surface>

      <Surface>
        <h3 className="text-lg font-black">Performance by show / channel</h3>
        <div className="mt-3 grid gap-2">
          {performanceRows.length === 0 && <p className="text-sm text-slate-600">No completed sales for this filter.</p>}
          {performanceRows.map((row) => (
            <div key={row.id} className="grid gap-1 rounded-md bg-slate-50 p-3 text-sm">
              <div className="flex min-w-0 justify-between gap-3">
                <strong className="min-w-0 break-words">{row.name}</strong>
                <strong className="shrink-0">{formatMoney(row.revenue, symbol)}</strong>
              </div>
              <p className="text-xs font-semibold text-slate-600">
                Profit {formatMoney(row.profit, symbol)} / {formatPercent(row.margin)} / {row.count} sales / Buybacks {formatMoney(row.buybackSpend, symbol)} / Net {formatMoney(row.revenue - row.buybackSpend, symbol)}
              </p>
            </div>
          ))}
        </div>
      </Surface>

      <Surface>
        <h3 className="text-lg font-black">Top sellers by profit</h3>
        <div className="mt-3 grid gap-2">
          {topSellers.length === 0 && <p className="text-sm text-slate-600">No line items for this filter.</p>}
          {topSellers.map((row) => (
            <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md bg-slate-50 p-3 text-sm">
              <span className="min-w-0">
                <strong className="block break-words">{row.name}</strong>
                <span className="block text-xs text-slate-600">{row.units} units / {formatMoney(row.revenue, symbol)} revenue</span>
              </span>
              <strong>{formatMoney(row.profit, symbol)}</strong>
            </div>
          ))}
        </div>
      </Surface>

      <Surface>
        <h3 className="text-lg font-black">Needs attention</h3>
        <div className="mt-3 grid gap-2">
          {needsAttention.map((item) => (
            <Link key={item.label} to={item.to} className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md bg-slate-50 p-3 text-sm font-semibold">
              {item.icon}
              <span className="break-words">{item.label}</span>
            </Link>
          ))}
        </div>
      </Surface>
    </div>
  );
}

function HeroMetric({ label, value, detail, delta }: { label: string; value: string; detail?: string; delta?: number | null }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white p-3 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-black">{value}</p>
      {detail && <p className="mt-1 text-sm font-bold text-slate-500">{detail}</p>}
      {delta !== undefined && delta !== null && (
        <p className={`mt-2 flex items-center gap-1 text-sm font-black ${delta >= 0 ? 'text-action' : 'text-danger'}`}>
          {delta >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          {Math.abs(delta).toFixed(0)}% vs prior period
        </p>
      )}
    </div>
  );
}

function HealthRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 border-b border-line/70 pb-2 last:border-b-0 last:pb-0">
      <span className="min-w-0 break-words font-semibold text-slate-600">{label}</span>
      <strong className={`text-right ${accent ? 'text-action' : ''}`}>{value}</strong>
    </div>
  );
}

function buildPeriod(timePeriod: TimePeriod, activeShow: ShowEvent | null, customStart: string, customEnd: string) {
  const today = getLocalDateKey();
  if (timePeriod === 'today') return { start: today, end: today, kind: 'date' as const, label: 'Today' };
  if (timePeriod === 'show' && activeShow) return { start: activeShow.startDate, end: activeShow.endDate, kind: 'date' as const, eventId: activeShow.id, label: activeShow.name };
  if (timePeriod === 'custom') return { start: customStart, end: customEnd < customStart ? customStart : customEnd, kind: 'date' as const, label: `${customStart} to ${customEnd}` };
  const month = getLocalMonthKey();
  return { start: `${month}-01`, end: lastDayOfMonth(month), kind: 'month' as const, label: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`)) };
}

function buildPriorPeriod(timePeriod: TimePeriod, period: ReturnType<typeof buildPeriod>, activeShow: ShowEvent | null, events: ShowEvent[]) {
  if (timePeriod === 'show' && activeShow) {
    const previous = events
      .filter((event) => event.startDate < activeShow.startDate)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    if (previous) return { start: previous.startDate, end: previous.endDate, kind: 'date' as const, eventId: previous.id, label: previous.name };
  }
  const start = new Date(`${period.start}T00:00:00`);
  const end = new Date(`${period.end}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const priorEnd = new Date(start);
  priorEnd.setDate(priorEnd.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorStart.getDate() - days + 1);
  return { start: getLocalDateKey(priorStart), end: getLocalDateKey(priorEnd), kind: period.kind, label: 'Prior period' };
}

function filterSales(
  transactions: Transaction[],
  eventsById: ReadonlyMap<string, ShowEvent>,
  period: { start: string; end: string; kind: 'date' | 'month'; eventId?: string },
  channel: ChannelFilter,
  adminId: string
) {
  return transactions.filter((tx) => {
    if (tx.status !== 'completed') return false;
    if (adminId && tx.createdBy !== adminId) return false;
    if (channel === 'walk-in' && tx.eventId) return false;
    if (channel === 'show' && !tx.eventId) return false;
    if (period.eventId && tx.eventId !== period.eventId) return false;
    if (period.kind === 'month' && tx.eventId && !period.eventId) {
      const revenueMonth = getRevenueMonth(tx, eventsById);
      return revenueMonth >= period.start.slice(0, 7) && revenueMonth <= period.end.slice(0, 7);
    }
    const transactionDate = getLocalDateKey(tx.createdAt);
    return transactionDate >= period.start && transactionDate <= period.end;
  });
}

function filterBuybacks(
  buybacks: Buyback[],
  eventsById: ReadonlyMap<string, ShowEvent>,
  period: { start: string; end: string; kind: 'date' | 'month'; eventId?: string },
  channel: ChannelFilter,
  adminId: string
) {
  return buybacks.filter((buyback) => {
    if (buyback.status !== 'completed') return false;
    if (adminId && buyback.createdBy !== adminId) return false;
    if (channel === 'walk-in' && buyback.eventId) return false;
    if (channel === 'show' && !buyback.eventId) return false;
    if (period.eventId && buyback.eventId !== period.eventId) return false;
    if (period.kind === 'month' && buyback.eventId && !period.eventId) {
      const revenueMonth = getRevenueMonth(buyback, eventsById);
      return revenueMonth >= period.start.slice(0, 7) && revenueMonth <= period.end.slice(0, 7);
    }
    const buybackDate = getLocalDateKey(buyback.createdAt);
    return buybackDate >= period.start && buybackDate <= period.end;
  });
}

function summarizeSales(rows: Transaction[]) {
  const revenue = rows.reduce((sum, tx) => sum + tx.total, 0);
  const costUnknown = rows.some((tx) => tx.costUnknown);
  const grossProfit = rows.reduce((sum, tx) => sum + tx.grossProfit, 0);
  const unitsSold = rows.reduce((sum, tx) => sum + tx.lineItems.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
  const cashTotal = rows.filter((tx) => tx.paymentMethod === 'cash').reduce((sum, tx) => sum + tx.total, 0);
  const cardTotal = rows.filter((tx) => tx.paymentMethod === 'card').reduce((sum, tx) => sum + tx.total, 0);
  return {
    revenue,
    grossProfit,
    costUnknown,
    margin: revenue > 0 ? grossProfit / revenue * 100 : 0,
    salesCount: rows.length,
    unitsSold,
    averageSaleValue: rows.length ? revenue / rows.length : 0,
    cashTotal,
    cardTotal,
    cashPercent: revenue > 0 ? cashTotal / revenue * 100 : 0,
    cardPercent: revenue > 0 ? cardTotal / revenue * 100 : 0
  };
}

function summarizeBuybacks(rows: Buyback[]) {
  return {
    spend: rows.reduce((sum, buyback) => sum + buyback.totalPaid, 0),
    count: rows.length,
    items: rows.reduce((sum, buyback) => sum + buyback.itemCount, 0)
  };
}

function summarizeInventory(items: InventoryItem[], agingDays: number) {
  const inStock = items.filter((item) => item.itemType === 'single_card' && item.quantity > 0 && item.status === 'in_stock');
  const costValue = inStock.reduce((sum, item) => sum + item.quantity * (item.costBasis || 0), 0);
  const askValue = inStock.reduce((sum, item) => sum + item.quantity * item.askingPrice, 0);
  const cutoff = Date.now() - agingDays * 86400000;
  return {
    costValue,
    askValue,
    unrealizedMargin: askValue - costValue,
    unrealizedMarginPercent: askValue > 0 ? (askValue - costValue) / askValue * 100 : 0,
    units: inStock.reduce((sum, item) => sum + item.quantity, 0),
    distinctItems: inStock.length,
    agingCount: inStock.filter((item) => new Date(item.createdAt).getTime() <= cutoff).length
  };
}

function summarizePricingHealth(items: InventoryItem[], snapshots: MarketPriceSnapshot[], settings?: Settings) {
  const latestByItem = latestComparableMarketByItem(snapshots, settings);
  const inStock = items.filter((item) => item.quantity > 0 && item.status === 'in_stock');
  let trackedCount = 0;
  let withinRangeCount = 0;
  let overpricedCount = 0;
  let underpricedCount = 0;
  let overpricedAskPremium = 0;
  let underpricedRevenueGap = 0;

  inStock.forEach((item) => {
    const market = latestByItem.get(item.id);
    if (!market || market.price <= 0) return;
    trackedCount += 1;
    const low = market.price * 0.9;
    const high = market.price * 1.1;
    if (item.askingPrice > high) {
      overpricedCount += 1;
      overpricedAskPremium += (item.askingPrice - market.price) * item.quantity;
      return;
    }
    if (item.askingPrice < low) {
      underpricedCount += 1;
      underpricedRevenueGap += (market.price - item.askingPrice) * item.quantity;
      return;
    }
    withinRangeCount += 1;
  });

  return {
    trackedCount,
    untrackedCount: Math.max(0, inStock.length - trackedCount),
    withinRangeCount,
    overpricedCount,
    underpricedCount,
    overpricedAskPremium,
    underpricedRevenueGap
  };
}

function latestComparableMarketByItem(snapshots: MarketPriceSnapshot[], settings?: Settings) {
  const currency = comparableMarketCurrency(settings);
  const map = new Map<string, MarketPriceSnapshot>();
  snapshots
    .filter((snapshot) => snapshot.currency === currency)
    .forEach((snapshot) => {
      const existing = map.get(snapshot.inventoryItemId);
      if (!existing || new Date(snapshot.fetchedAt).getTime() > new Date(existing.fetchedAt).getTime()) {
        map.set(snapshot.inventoryItemId, snapshot);
      }
    });
  return map;
}

function comparableMarketCurrency(settings?: Settings) {
  if (settings?.currency?.toUpperCase() === 'SGD' || settings?.currencySymbol === 'S$') return 'SGD';
  return settings?.currency?.toUpperCase() || 'SGD';
}

function buildMonthlyTrend(transactions: Transaction[], eventsById: ReadonlyMap<string, ShowEvent>, channel: ChannelFilter, adminId: string) {
  const current = getLocalMonthKey();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${current}-01T00:00:00`);
    date.setMonth(date.getMonth() - (5 - index));
    return getLocalMonthKey(date);
  });
  const values = months.map((month) => {
    const sales = transactions.filter((tx) =>
      tx.status === 'completed' &&
      getRevenueMonth(tx, eventsById) === month &&
      (!adminId || tx.createdBy === adminId) &&
      (channel === 'all' || (channel === 'walk-in' ? !tx.eventId : Boolean(tx.eventId)))
    );
    const revenue = sales.reduce((sum, tx) => sum + tx.total, 0);
    const profit = sales.reduce((sum, tx) => sum + tx.grossProfit, 0);
    return { month, revenue, profit };
  });
  const max = Math.max(1, ...values.map((row) => Math.max(row.revenue, row.profit)));
  return values.map((row) => {
    const label = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(`${row.month}-01T00:00:00`));
    return {
      ...row,
      current: row.month === current,
      label,
      shortLabel: label.split(' ')[0],
      revenueHeight: Math.max(6, row.revenue / max * 100),
      profitHeight: Math.max(6, row.profit / max * 100)
    };
  });
}

function buildPerformanceRows(rows: Transaction[], buybacks: Buyback[], eventsById: ReadonlyMap<string, ShowEvent>) {
  const map = new Map<string, { id: string; name: string; count: number; revenue: number; profit: number; buybackSpend: number; costUnknown: boolean }>();
  rows.forEach((tx) => {
    const id = tx.eventId || 'walk-in';
    const name = tx.eventId ? eventsById.get(tx.eventId)?.name || 'Unknown show' : 'Online sales';
    const current = map.get(id) || { id, name, count: 0, revenue: 0, profit: 0, buybackSpend: 0, costUnknown: false };
    current.count += 1;
    current.revenue += tx.total;
    current.profit += tx.grossProfit;
    current.costUnknown = current.costUnknown || tx.costUnknown;
    map.set(id, current);
  });
  buybacks.forEach((buyback) => {
    const id = buyback.eventId || 'walk-in';
    const name = buyback.eventId ? eventsById.get(buyback.eventId)?.name || 'Unknown show' : 'Online sales';
    const current = map.get(id) || { id, name, count: 0, revenue: 0, profit: 0, buybackSpend: 0, costUnknown: false };
    current.buybackSpend += buyback.totalPaid;
    map.set(id, current);
  });
  return [...map.values()]
    .map((row) => ({ ...row, margin: row.revenue > 0 ? row.profit / row.revenue * 100 : 0 }))
    .sort((a, b) => (b.revenue - b.buybackSpend) - (a.revenue - a.buybackSpend));
}

function buildTopSellers(rows: Transaction[]) {
  const map = new Map<string, { id: string; name: string; units: number; revenue: number; profit: number; costUnknown: boolean }>();
  rows.forEach((tx) => tx.lineItems.forEach((line) => {
    const id = line.inventoryItemId || `misc:${line.itemNameSnapshot}`;
    const current = map.get(id) || { id, name: line.itemNameSnapshot, units: 0, revenue: 0, profit: 0, costUnknown: false };
    current.units += line.quantity;
    current.revenue += lineFinalTotal(tx, line);
    current.profit += lineFinalProfit(tx, line);
    current.costUnknown = current.costUnknown || Boolean(line.costUnknown || tx.costUnknown);
    map.set(id, current);
  }));
  return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, 8);
}

function buildAttentionItems(
  items: InventoryItem[],
  events: ShowEvent[],
  agingDays: number,
  queued: unknown[],
  pricingHealth: ReturnType<typeof summarizePricingHealth>,
  buybacks: Buyback[]
) {
  const cutoff = Date.now() - agingDays * 86400000;
  const slowMovers = items.filter((item) => item.quantity > 0 && new Date(item.createdAt).getTime() <= cutoff).length;
  const missingFloor = items.filter((item) => item.quantity > 0 && !item.floorPrice).length;
  const buybacksToProcess = buybacks.filter((buyback) => buyback.status === 'completed' && buyback.processingStatus !== 'processed').length;
  const upcoming = events
    .filter((event) => new Date(`${event.startDate}T00:00:00`).getTime() >= Date.now() - 86400000)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return [
    { label: `${slowMovers} slow movers unsold ${agingDays}+ days / review for discounting`, to: '/inventory?aging=1', icon: <TrendingDown className="text-warn" size={18} /> },
    { label: upcoming ? `${upcoming.name} starts ${upcoming.startDate} / print labels and set floor prices` : `${missingFloor} items need floor prices before the next show`, to: '/labels', icon: <Printer className="text-sky-700" size={18} /> },
    { label: `${pricingHealth.underpricedCount} cards priced 10%+ below market / reprice to capture margin`, to: '/inventory?price=under', icon: <RefreshCcw className="text-slate-500" size={18} /> },
    { label: `${pricingHealth.overpricedCount} cards priced 10%+ above market / review before they stall`, to: '/inventory?price=over', icon: <AlertTriangle className="text-warn" size={18} /> },
    { label: `${buybacksToProcess} buybacks still need inventory processing`, to: '/buybacks', icon: <HandCoins className={buybacksToProcess ? 'text-amber-700' : 'text-slate-400'} size={18} /> },
    { label: `${queued.length} pending offline sales to sync`, to: '/sell', icon: <AlertTriangle className={queued.length ? 'text-danger' : 'text-slate-400'} size={18} /> }
  ];
}

function compare(current: number, prior: number) {
  if (prior === 0) return current > 0 ? 100 : 0;
  return (current - prior) / Math.abs(prior) * 100;
}

function pickActiveShow(events: ShowEvent[], activeEventId?: string | null) {
  if (activeEventId) return events.find((event) => event.id === activeEventId) || null;
  const today = getLocalDateKey();
  return events.find((event) => event.startDate <= today && event.endDate >= today) ||
    events.filter((event) => event.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ||
    events[0] ||
    null;
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return getLocalDateKey(new Date(year, monthNumber, 0));
}

function channelLabel(channel: ChannelFilter) {
  if (channel === 'walk-in') return 'Online sales';
  if (channel === 'show') return 'Card show';
  return 'All channels';
}

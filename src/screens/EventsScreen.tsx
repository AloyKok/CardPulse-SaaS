import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, SelectInput, TextArea, TextInput } from '../components/Field';
import { PageHeader, StatCard } from '../components/Page';
import { formatEventPeriod, getLocalDateInputValue, getShowEventTiming, sortShowEventOptions } from '../lib/events/dateRange';
import { formatMoney } from '../lib/format/money';
import {
  createShowExpense,
  deleteShowExpense,
  getSettings,
  listBuybacks,
  listEvents,
  listShowExpenses,
  listTransactions,
  saveEvent
} from '../lib/supabase/api';
import { useAuth } from '../lib/supabase/AuthProvider';
import { useOrg } from '../lib/org/OrgProvider';
import type { Buyback, PaymentMethod, ShowEvent, ShowExpense, ShowExpenseCategory, Transaction } from '../types/domain';

const expenseOptions: Array<{ value: ShowExpenseCategory; label: string }> = [
  { value: 'booth_fee', label: 'Booth fee' },
  { value: 'parking', label: 'Carpark' },
  { value: 'food', label: 'Lunch / food' },
  { value: 'transport', label: 'Transport' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'other', label: 'Other' }
];

export function EventsScreen() {
  const { organization } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const today = getLocalDateInputValue();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [location, setLocation] = useState('');
  const [openExpenseEventId, setOpenExpenseEventId] = useState('');
  const [expenseDrafts, setExpenseDrafts] = useState<Record<string, ExpenseDraft>>({});

  const eventsQuery = useQuery({ queryKey: ['events', organization.id], queryFn: () => listEvents(organization.id) });
  const salesQuery = useQuery({ queryKey: ['history', organization.id], queryFn: () => listTransactions(organization.id, 5000) });
  const buybacksQuery = useQuery({ queryKey: ['buybacks', organization.id], queryFn: () => listBuybacks(organization.id, 5000) });
  const expensesQuery = useQuery({ queryKey: ['show-expenses', organization.id], queryFn: () => listShowExpenses(organization.id) });
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const symbol = settingsQuery.data?.currencySymbol || 'S$';
  const events = useMemo(() => sortShowEventOptions(eventsQuery.data || []), [eventsQuery.data]);

  const eventMetrics = useMemo(() => {
    return new Map(
      events.map((event) => [
        event.id,
        summarizeShow(event, salesQuery.data || [], buybacksQuery.data || [], expensesQuery.data || [])
      ])
    );
  }, [buybacksQuery.data, events, expensesQuery.data, salesQuery.data]);
  const overviewMetrics = useMemo(() => summarizeShowOverview([...eventMetrics.values()]), [eventMetrics]);

  const eventMutation = useMutation({
    mutationFn: () => saveEvent(organization.id, { name, startDate, endDate, location }),
    onSuccess: async () => {
      setName('');
      setLocation('');
      await queryClient.invalidateQueries({ queryKey: ['events', organization.id] });
    }
  });

  const expenseMutation = useMutation({
    mutationFn: ({ eventId, draft }: { eventId: string; draft: ExpenseDraft }) => {
      if (!user) throw new Error('Not signed in');
      return createShowExpense(organization.id, user.id, {
        eventId,
        category: draft.category,
        description: draft.description,
        amount: Number(draft.amount),
        paymentMethod: draft.paymentMethod,
        notes: draft.notes
      });
    },
    onSuccess: async (_row, variables) => {
      setExpenseDrafts((current) => ({ ...current, [variables.eventId]: createExpenseDraft() }));
      await queryClient.invalidateQueries({ queryKey: ['show-expenses', organization.id] });
    }
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (expenseId: string) => deleteShowExpense(organization.id, expenseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['show-expenses', organization.id] })
  });

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Show command center"
        title="Shows"
        description="Review revenue, spend, expenses, and net result for each card show."
        action={<div className="cp-chip">Shows tracked: {events.length}</div>}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Revenue" value={formatMoney(overviewMetrics.revenue, symbol)} detail={`${overviewMetrics.salesCount} sales`} />
          <StatCard label="Gross profit" value={formatMoney(overviewMetrics.grossProfit, symbol)} detail={`${formatPercent(overviewMetrics.margin)} margin`} tone="good" />
          <StatCard label="Spend" value={formatMoney(overviewMetrics.buybackSpend + overviewMetrics.expenseTotal, symbol)} detail="Buybacks + expenses" />
          <StatCard label="Net cash" value={formatMoney(overviewMetrics.netCash, symbol)} detail="After spend" tone={overviewMetrics.netCash >= 0 ? 'good' : 'warn'} />
        </div>
      </PageHeader>

      <form
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          eventMutation.mutate();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-black">Create show</h3>
          <p className="text-xs font-semibold text-slate-500">New event setup</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
          <Field label="Name"><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Start date">
            <TextInput
              type="date"
              value={startDate}
              onChange={(event) => {
                const nextStartDate = event.target.value;
                setStartDate(nextStartDate);
                if (endDate < nextStartDate) setEndDate(nextStartDate);
              }}
              required
            />
          </Field>
          <Field label="End date">
            <TextInput type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <Field label="Location"><TextInput value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
          <Button type="submit" disabled={eventMutation.isPending}>Add event</Button>
        </div>
        {eventMutation.error && <p className="text-sm text-danger">{eventMutation.error.message}</p>}
      </form>

      <section className="grid gap-3">
        {events.map((event) => {
          const metrics = eventMetrics.get(event.id) || emptyShowMetrics();
          const draft = expenseDrafts[event.id] || createExpenseDraft();
          const expenseFormOpen = openExpenseEventId === event.id;
          const timing = getShowEventTiming(event);
          return (
            <article key={event.id} className={`grid gap-3 rounded-2xl border p-4 shadow-sm ${timing === 'past' ? 'border-slate-200 bg-slate-50 opacity-75' : 'border-line bg-white'}`}>
              <div className="flex min-w-0 items-start justify-between gap-3 border-b border-line pb-3">
                <div className="min-w-0">
                  <p className="break-words text-lg font-black leading-tight">{event.name}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{formatEventPeriod(event)}{event.location ? ` / ${event.location}` : ''}</p>
                </div>
                <Button
                  variant="secondary"
                  className="shrink-0 px-3"
                  onClick={() => {
                    setOpenExpenseEventId(expenseFormOpen ? '' : event.id);
                    setExpenseDrafts((current) => ({ ...current, [event.id]: current[event.id] || createExpenseDraft() }));
                  }}
                >
                  <Plus size={17} className="inline" /> Expense
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                <MetricTile label="Revenue" value={formatMoney(metrics.revenue, symbol)} detail={`${metrics.salesCount} sales`} />
                <MetricTile label="Gross profit" value={formatMoney(metrics.grossProfit, symbol)} detail={`${formatPercent(metrics.margin)} margin`} accent={metrics.grossProfit >= 0} />
                <MetricTile label="Buyback spend" value={formatMoney(metrics.buybackSpend, symbol)} detail={`${metrics.buybackCount} buybacks`} />
                <MetricTile label="Show expenses" value={formatMoney(metrics.expenseTotal, symbol)} detail={`${metrics.expenseCount} entries`} />
                <MetricTile label="Net cash" value={formatMoney(metrics.netCash, symbol)} detail="Sales minus buybacks and expenses" accent={metrics.netCash >= 0} />
                <MetricTile label="Profit after expenses" value={formatMoney(metrics.profitAfterExpenses, symbol)} detail="Gross profit minus show expenses" accent={metrics.profitAfterExpenses >= 0} />
              </div>

              {expenseFormOpen && (
                <ExpenseForm
                  draft={draft}
                  symbol={symbol}
                  isSaving={expenseMutation.isPending}
                  error={expenseMutation.error}
                  onChange={(nextDraft) => setExpenseDrafts((current) => ({ ...current, [event.id]: nextDraft }))}
                  onSave={() => expenseMutation.mutate({ eventId: event.id, draft })}
                />
              )}

              <div className="grid gap-2 rounded-md border border-line bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-700">Expense breakdown</p>
                  <p className="text-sm font-black text-slate-700">{formatMoney(metrics.expenseTotal, symbol)}</p>
                </div>
                {metrics.expenses.length === 0 && (
                  <p className="rounded-md bg-slate-50 p-3 text-sm font-semibold text-slate-600">No misc expenses recorded for this show.</p>
                )}
                {metrics.expenses.map((expense) => (
                  <div key={expense.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-line bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-black">{expense.description}</p>
                      <p className="text-xs font-semibold text-slate-600">
                        {expenseLabel(expense.category)} / {expense.paymentMethod}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-sm font-black">{formatMoney(expense.amount, symbol)}</p>
                      <Button
                        variant="ghost"
                        className="min-h-10 px-2 text-danger"
                        aria-label={`Delete ${expense.description}`}
                        disabled={deleteExpenseMutation.isPending}
                        onClick={() => {
                          if (confirm(`Delete expense "${expense.description}"?`)) deleteExpenseMutation.mutate(expense.id);
                        }}
                      >
                        <Trash2 size={17} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
        {!eventsQuery.isLoading && (eventsQuery.data || []).length === 0 && (
          <p className="rounded-lg border border-line bg-white p-4 text-sm text-slate-600">No shows created yet.</p>
        )}
      </section>
    </div>
  );
}

interface ExpenseDraft {
  category: ShowExpenseCategory;
  description: string;
  amount: string;
  paymentMethod: PaymentMethod;
  notes: string;
}

function ExpenseForm({
  draft,
  symbol,
  isSaving,
  error,
  onChange,
  onSave
}: {
  draft: ExpenseDraft;
  symbol: string;
  isSaving: boolean;
  error: Error | null;
  onChange: (draft: ExpenseDraft) => void;
  onSave: () => void;
}) {
  return (
    <form
      className="grid gap-3 rounded-md bg-slate-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <p className="text-sm font-black">Add show expense</p>
      <div className="grid gap-2 min-[420px]:grid-cols-2">
        <Field label="Category">
          <SelectInput
            value={draft.category}
            onValueChange={(value) => onChange({ ...draft, category: value as ShowExpenseCategory, description: draft.description || defaultExpenseDescription(value as ShowExpenseCategory) })}
            options={expenseOptions}
          />
        </Field>
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
      </div>
      <div className="grid gap-2 min-[420px]:grid-cols-2">
        <Field label="Description">
          <TextInput value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="e.g. Booth fee, lunch, carpark" required />
        </Field>
        <Field label="Amount">
          <TextInput
            type="text"
            inputMode="decimal"
            value={draft.amount}
            onChange={(event) => onChange({ ...draft, amount: sanitizeDecimalInput(event.target.value) })}
            placeholder="0.00"
            required
          />
        </Field>
      </div>
      <Field label="Notes">
        <TextArea value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} placeholder="Optional" />
      </Field>
      {error && <p className="text-sm text-danger">{error.message}</p>}
      <Button type="submit" disabled={isSaving || !draft.description.trim() || Number(draft.amount) <= 0}>
        {isSaving ? 'Saving...' : `Add expense${Number(draft.amount) > 0 ? ` / ${formatMoney(Number(draft.amount), symbol)}` : ''}`}
      </Button>
    </form>
  );
}

function MetricTile({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-lg font-black ${accent === undefined ? 'text-ink' : accent ? 'text-action' : 'text-danger'}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
    </div>
  );
}

type ShowSummary = ReturnType<typeof summarizeShow>;

function summarizeShowOverview(rows: ShowSummary[]) {
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const grossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
  const buybackSpend = rows.reduce((sum, row) => sum + row.buybackSpend, 0);
  const expenseTotal = rows.reduce((sum, row) => sum + row.expenseTotal, 0);
  return {
    salesCount: rows.reduce((sum, row) => sum + row.salesCount, 0),
    revenue,
    grossProfit,
    margin: revenue > 0 ? grossProfit / revenue : 0,
    buybackSpend,
    expenseTotal,
    netCash: revenue - buybackSpend - expenseTotal
  };
}

function summarizeShow(event: ShowEvent, transactions: Transaction[], buybacks: Buyback[], expenses: ShowExpense[]) {
  const showTransactions = transactions.filter((transaction) => transaction.eventId === event.id && transaction.status === 'completed');
  const showBuybacks = buybacks.filter((buyback) => buyback.eventId === event.id && buyback.status === 'completed');
  const showExpenses = expenses.filter((expense) => expense.eventId === event.id);
  const revenue = showTransactions.reduce((sum, transaction) => sum + transaction.total, 0);
  const grossProfit = showTransactions.reduce((sum, transaction) => sum + transaction.grossProfit, 0);
  const buybackSpend = showBuybacks.reduce((sum, buyback) => sum + buyback.totalPaid, 0);
  const expenseTotal = showExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  return {
    salesCount: showTransactions.length,
    revenue,
    grossProfit,
    margin: revenue > 0 ? grossProfit / revenue : 0,
    buybackCount: showBuybacks.length,
    buybackSpend,
    expenseCount: showExpenses.length,
    expenseTotal,
    netCash: revenue - buybackSpend - expenseTotal,
    profitAfterExpenses: grossProfit - expenseTotal,
    expenses: showExpenses
  };
}

function emptyShowMetrics() {
  return {
    salesCount: 0,
    revenue: 0,
    grossProfit: 0,
    margin: 0,
    buybackCount: 0,
    buybackSpend: 0,
    expenseCount: 0,
    expenseTotal: 0,
    netCash: 0,
    profitAfterExpenses: 0,
    expenses: [] as ShowExpense[]
  };
}

function createExpenseDraft(): ExpenseDraft {
  return {
    category: 'booth_fee',
    description: 'Booth fee',
    amount: '',
    paymentMethod: 'cash',
    notes: ''
  };
}

function sanitizeDecimalInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, '');
  const [first, ...rest] = normalized.split('.');
  return rest.length ? `${first}.${rest.join('').slice(0, 2)}` : first;
}

function expenseLabel(category: ShowExpenseCategory) {
  return expenseOptions.find((option) => option.value === category)?.label || 'Other';
}

function defaultExpenseDescription(category: ShowExpenseCategory) {
  return expenseLabel(category);
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

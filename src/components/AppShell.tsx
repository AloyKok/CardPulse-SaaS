import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Boxes, CalendarDays, Clock3, HandCoins, MoreHorizontal, ScanLine, Tags, TrendingUp } from 'lucide-react';
import { PendingSyncIndicator } from './PendingSyncIndicator';
import { useOrg } from '../lib/org/OrgProvider';
import { listEvents } from '../lib/supabase/api';
import { useRealtimeSync } from '../lib/supabase/useRealtimeSync';
import { isLocalDemoMode } from '../lib/supabase/client';
import { useCartStore } from '../store/cartStore';
import { formatShowEventOptionLabel } from '../lib/events/dateRange';

const nav = [
  { to: '/', label: 'Sell', icon: ScanLine },
  { to: '/buybacks', label: 'Buy', icon: HandCoins },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/show', label: 'Show', icon: CalendarDays },
  { to: '/history', label: 'History', icon: Clock3 },
  { to: '/more', label: 'More', icon: MoreHorizontal }
];

const desktopNav = [
  { to: '/', label: 'Sell', icon: ScanLine },
  { to: '/buybacks', label: 'Buybacks', icon: HandCoins },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/show', label: 'Shows', icon: CalendarDays },
  { to: '/history', label: 'History', icon: Clock3 },
  { to: '/labels', label: 'Labels', icon: Tags },
  { to: '/market', label: 'Market', icon: TrendingUp },
  { to: '/more', label: 'More', icon: MoreHorizontal }
];

export function AppShell() {
  const { organization } = useOrg();
  const saleMode = useCartStore((state) => state.saleMode);
  const eventId = useCartStore((state) => state.eventId);
  const eventsQuery = useQuery({ queryKey: ['events', organization.id, 'shell-context'], queryFn: () => listEvents(organization.id) });
  const activeShow = (eventsQuery.data || []).find((event) => event.id === eventId);
  useRealtimeSync(organization.id);
  const contextLabel = saleMode === 'daily'
    ? 'Daily / online'
    : saleMode === 'show' && activeShow
      ? formatShowEventOptionLabel(activeShow)
      : 'No active selling context';

  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip bg-[#f3f6f8] text-ink lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-white px-4 py-5 lg:grid lg:grid-rows-[auto_1fr_auto]">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-action">CardPulse</p>
          <h1 className="mt-1 truncate text-xl font-black">{organization.name}</h1>
          {isLocalDemoMode && <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase text-amber-900">Local demo</span>}
        </div>

        <nav className="mt-6 grid content-start gap-1">
          {desktopNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-3 text-sm font-black transition ${isActive ? 'bg-ink text-white shadow-soft' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'}`
              }
            >
              <Icon size={19} aria-hidden="true" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="grid gap-3 rounded-xl border border-line bg-slate-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Selling context</p>
          <Link
            to={saleMode === 'show' && activeShow ? '/show' : '/'}
            className={`grid min-h-12 gap-1 rounded-lg px-3 py-2 text-sm font-black ${saleMode ? 'bg-emerald-50 text-action' : 'bg-amber-50 text-amber-900'}`}
          >
            <span className="truncate">{contextLabel}</span>
            <span className="text-xs opacity-70">Change context</span>
          </Link>
          <PendingSyncIndicator />
        </div>
      </aside>

      <div className="min-w-0">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 px-3 py-2 backdrop-blur sm:px-4 lg:hidden">
        <div className="mx-auto grid min-w-0 max-w-6xl gap-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-black uppercase tracking-wide text-action">CardPulse</p>
                {isLocalDemoMode && <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">Local demo</span>}
              </div>
              <h1 className="truncate text-lg font-black leading-tight">{organization.name}</h1>
            </div>
            <PendingSyncIndicator />
          </div>
          <Link
            to={saleMode === 'show' && activeShow ? '/show' : '/'}
            className={`flex min-h-9 min-w-0 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-xs font-bold ${saleMode ? 'bg-emerald-50 text-action' : 'bg-amber-50 text-amber-900'}`}
          >
            <span className="min-w-0 truncate">Current: {contextLabel}</span>
            <span className="shrink-0 text-[11px]">Change</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-6xl px-3 pb-28 pt-4 sm:px-4 lg:px-6 lg:py-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] shadow-soft lg:hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-6">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[10px] font-semibold sm:text-xs ${isActive ? 'text-action' : 'text-slate-500'}`
              }
            >
              <Icon size={21} aria-hidden="true" />
              <span className="max-w-full truncate">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      </div>
    </div>
  );
}

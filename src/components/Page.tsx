import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, action, children }: PageHeaderProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="grid gap-4 bg-[linear-gradient(135deg,#ffffff_0%,#f7fafc_52%,#eef6f3_100%)] p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-black uppercase tracking-[0.18em] text-action">{eyebrow}</p>}
            <h2 className="mt-1 break-words text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
            {description && <div className="mt-1 text-sm font-semibold leading-6 text-slate-600">{description}</div>}
          </div>
          {action && <div className="min-w-0 sm:justify-self-end">{action}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

export function StatCard({ label, value, detail, tone = 'default' }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'danger' }) {
  const toneClass = {
    default: 'bg-white text-ink',
    good: 'bg-emerald-50 text-emerald-900',
    warn: 'bg-amber-50 text-amber-900',
    danger: 'bg-red-50 text-red-900'
  }[tone];

  return (
    <div className={`min-w-0 rounded-xl border border-line p-3 ${toneClass}`}>
      <p className="truncate text-xs font-black uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 truncate text-xl font-black leading-tight sm:text-2xl">{value}</p>
      {detail && <p className="mt-1 min-w-0 break-words text-xs font-bold opacity-70">{detail}</p>}
    </div>
  );
}

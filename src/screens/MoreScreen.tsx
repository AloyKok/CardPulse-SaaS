import { Link } from 'react-router-dom';
import { BarChart3, Download, Settings, Tags, TrendingUp, Users } from 'lucide-react';
import { PageHeader } from '../components/Page';
import { signOut } from '../lib/supabase/api';
import { isLocalDemoMode } from '../lib/supabase/client';

const links = [
  { to: '/labels', label: 'Labels', icon: Tags },
  { to: '/market', label: 'Market cleanup', icon: TrendingUp },
  { to: '/dashboard', label: 'Reports', icon: BarChart3 },
  { to: '/import-export', label: 'Import / Export', icon: Download },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export function MoreScreen() {
  return (
    <div className="grid gap-4">
      <PageHeader eyebrow="Workspace" title="More" description="Labels, reports, imports, users, and settings." />
      <div className="grid gap-2">
        {links.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-white px-4 font-black shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </div>
      {!isLocalDemoMode && (
        <button className="min-h-14 rounded-2xl border border-line bg-white px-4 text-left font-black text-danger shadow-sm" onClick={() => signOut()}>
          Sign out
        </button>
      )}
    </div>
  );
}

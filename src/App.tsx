import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { AppShell } from './components/AppShell';
import { useAuth } from './lib/supabase/AuthProvider';
import { OrgProvider, useMembershipsQuery } from './lib/org/OrgProvider';
import { acceptInvite, bootstrapOwnerOrg } from './lib/supabase/api';
import { Button } from './components/Button';
import { Field, TextInput } from './components/Field';

const AuthScreen = lazy(() => import('./screens/AuthScreen').then((module) => ({ default: module.AuthScreen })));
const SellScreen = lazy(() => import('./screens/SellScreen').then((module) => ({ default: module.SellScreen })));
const InventoryScreen = lazy(() => import('./screens/InventoryScreen').then((module) => ({ default: module.InventoryScreen })));
const DashboardScreen = lazy(() => import('./screens/DashboardScreen').then((module) => ({ default: module.DashboardScreen })));
const HistoryScreen = lazy(() => import('./screens/HistoryScreen').then((module) => ({ default: module.HistoryScreen })));
const MoreScreen = lazy(() => import('./screens/MoreScreen').then((module) => ({ default: module.MoreScreen })));
const LabelsScreen = lazy(() => import('./screens/LabelsScreen').then((module) => ({ default: module.LabelsScreen })));
const ImportExportScreen = lazy(() => import('./screens/ImportExportScreen').then((module) => ({ default: module.ImportExportScreen })));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then((module) => ({ default: module.SettingsScreen })));
const UsersScreen = lazy(() => import('./screens/UsersScreen').then((module) => ({ default: module.UsersScreen })));
const EventsScreen = lazy(() => import('./screens/EventsScreen').then((module) => ({ default: module.EventsScreen })));
const MarketScreen = lazy(() => import('./screens/MarketScreen').then((module) => ({ default: module.MarketScreen })));
const BuybacksScreen = lazy(() => import('./screens/BuybacksScreen').then((module) => ({ default: module.BuybacksScreen })));

export function App() {
  return (
    <BrowserRouter basename="/admin">
      <Suspense fallback={<FullScreenMessage message="Loading screen..." />}>
        <Routes>
          <Route path="/auth" element={<AuthScreen />} />
          <Route path="/accept/:token" element={<AcceptInviteScreen />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function ProtectedApp() {
  const { user, loading } = useAuth();
  const membershipsQuery = useMembershipsQuery();

  if (loading) return <FullScreenMessage message="Loading session..." />;
  if (!user) return <Navigate to="/auth" replace />;
  if (membershipsQuery.isLoading) return <FullScreenMessage message="Loading organization..." />;
  if (!membershipsQuery.data?.length) return <CreateOrgScreen />;

  return (
    <OrgProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<SellScreen />} />
          <Route path="inventory" element={<InventoryScreen />} />
          <Route path="dashboard" element={<DashboardScreen />} />
          <Route path="history" element={<HistoryScreen />} />
          <Route path="more" element={<MoreScreen />} />
          <Route path="labels" element={<LabelsScreen />} />
          <Route path="import-export" element={<ImportExportScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="users" element={<UsersScreen />} />
          <Route path="show" element={<EventsScreen />} />
          <Route path="events" element={<Navigate to="/show" replace />} />
          <Route path="market" element={<MarketScreen />} />
          <Route path="buybacks" element={<BuybacksScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </OrgProvider>
  );
}

function CreateOrgScreen() {
  const [name, setName] = useState('CardPulse Booth');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => bootstrapOwnerOrg(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memberships'] })
  });

  return (
    <div className="grid min-h-dvh place-items-center bg-[#f3f6f8] p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-soft">
        <h1 className="text-xl font-bold">Create organization</h1>
        <p className="mt-1 text-sm text-slate-600">This creates the seller workspace and makes you the owner.</p>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Field label="Organization name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          {mutation.error && <p className="text-sm text-danger">{mutation.error.message}</p>}
          <Button disabled={mutation.isPending}>{mutation.isPending ? 'Creating...' : 'Create workspace'}</Button>
        </form>
      </div>
    </div>
  );
}

function AcceptInviteScreen() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const mutation = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memberships'] });
      navigate('/');
    }
  });

  if (!user && !loading) return <Navigate to={`/auth?next=/accept/${token}`} replace />;

  return (
    <div className="grid min-h-dvh place-items-center bg-[#f3f6f8] p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-soft">
        <h1 className="text-xl font-bold">Accept invite</h1>
        <p className="mt-1 text-sm text-slate-600">Use the same email address the owner invited.</p>
        {mutation.error && <p className="mt-4 text-sm text-danger">{mutation.error.message}</p>}
        <Button className="mt-4 w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending || !token}>
          {mutation.isPending ? 'Accepting...' : 'Join workspace'}
        </Button>
      </div>
    </div>
  );
}

function FullScreenMessage({ message }: { message: string }) {
  return <div className="grid min-h-dvh place-items-center bg-[#f3f6f8] p-6 text-sm font-black uppercase tracking-wide text-slate-600">{message}</div>;
}

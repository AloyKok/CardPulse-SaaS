import React from 'react';
import ReactDOM from 'react-dom/client';
import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { AuthProvider } from './lib/supabase/AuthProvider';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 30,
      retry: 1
    }
  }
});

const heavyPersistKeys = new Set(['inventory', 'market-snapshots']);

try {
  window.localStorage.removeItem('cardpulse-query-cache');
  window.localStorage.removeItem('cardpulse-query-cache-v2');
} catch {
  // Ignore storage failures in private browsing / restricted webviews.
}

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'cardpulse-query-cache-v3'
});

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 12,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) && !heavyPersistKeys.has(String(query.queryKey[0]))
        }
      }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>
);

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RefreshCcw, Search } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, TextInput } from '../components/Field';
import { PageHeader, Surface } from '../components/Page';
import { formatMoney } from '../lib/format/money';
import {
  getSettings,
  listMarketCandidatesFromUrl,
  listInventory,
  listMarketMappings,
  listMarketPriceSnapshots,
  refreshMarketMapping,
  saveMarketMapping,
  saveMarketSnapshot,
  searchSnkrdunkMarketByCardNumber,
  searchYuyuteiMarketByCardNumber
} from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';
import type { InventoryItem, MarketCandidate, MarketMapping, MarketPriceSnapshot } from '../types/domain';

export function MarketScreen() {
  const { organization } = useOrg();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeItemId, setActiveItemId] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [candidates, setCandidates] = useState<Record<string, MarketCandidate[]>>({});
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'market'], queryFn: () => listInventory(organization.id) });
  const mappingsQuery = useQuery({ queryKey: ['market-mappings', organization.id], queryFn: () => listMarketMappings(organization.id) });
  const snapshotsQuery = useQuery({ queryKey: ['market-snapshots', organization.id], queryFn: () => listMarketPriceSnapshots(organization.id) });
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const symbol = settingsQuery.data?.currencySymbol || 'S$';
  const snapshots = useMemo(() => snapshotsQuery.data || [], [snapshotsQuery.data]);

  const mappingsByItem = useMemo(() => {
    const map = new Map<string, MarketMapping[]>();
    (mappingsQuery.data || []).forEach((mapping) => {
      const rows = map.get(mapping.inventoryItemId) || [];
      rows.push(mapping);
      map.set(mapping.inventoryItemId, rows);
    });
    return map;
  }, [mappingsQuery.data]);
  const latestByItem = useMemo(() => {
    const map = new Map<string, Map<string, MarketPriceSnapshot>>();
    snapshots.forEach((snapshot) => {
      const sourceMap = map.get(snapshot.inventoryItemId) || new Map<string, MarketPriceSnapshot>();
      const existing = sourceMap.get(snapshot.source);
      if (!existing || new Date(snapshot.fetchedAt).getTime() > new Date(existing.fetchedAt).getTime()) {
        sourceMap.set(snapshot.source, snapshot);
      }
      map.set(snapshot.inventoryItemId, sourceMap);
    });
    return map;
  }, [snapshots]);
  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (inventoryQuery.data || [])
      .filter((item) => item.itemType === 'single_card')
      .filter((item) => !query || [item.itemName, item.itemNumber, item.cardNumber, item.setName, item.rarity, item.art].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [inventoryQuery.data, search]);

  const searchMutation = useMutation({
    mutationFn: async ({ item, source }: { item: InventoryItem; source: 'yuyutei' | 'snkrdunk' }) => {
      const cardNumber = item.cardNumber?.trim();
      if (!cardNumber) throw new Error('Market search needs a card number');
      return {
        item,
        rows: source === 'snkrdunk'
          ? await searchSnkrdunkMarketByCardNumber(cardNumber)
          : await searchYuyuteiMarketByCardNumber(cardNumber)
      };
    },
    onSuccess: ({ item, rows }) => {
      setCandidates((current) => ({ ...current, [item.id]: rows }));
      setActiveItemId(item.id);
    }
  });
  const linkMutation = useMutation({
    mutationFn: async ({ item, candidate }: { item: InventoryItem; candidate: MarketCandidate }) => {
      await saveMarketMapping(organization.id, item.id, candidate);
      await saveMarketSnapshot(organization.id, item.id, candidate);
    },
    onSuccess: async () => {
      setManualUrl('');
      await invalidateMarket(queryClient, organization.id);
    }
  });
  const refreshMutation = useMutation({
    mutationFn: async ({ item, mapping }: { item: InventoryItem; mapping: MarketMapping }) => {
      const candidate = await refreshMarketMapping(mapping);
      await saveMarketMapping(organization.id, item.id, candidate);
      await saveMarketSnapshot(organization.id, item.id, candidate);
    },
    onSuccess: async () => {
      setManualUrl('');
      await invalidateMarket(queryClient, organization.id);
    }
  });
  const urlMutation = useMutation({
    mutationFn: async ({ item, sourceUrl }: { item: InventoryItem; sourceUrl: string }) => ({
      item,
      rows: await listMarketCandidatesFromUrl(sourceUrl)
    }),
    onSuccess: ({ item, rows }) => {
      setManualUrl('');
      setCandidates((current) => ({ ...current, [item.id]: rows }));
      setActiveItemId(item.id);
    }
  });

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Market intelligence"
        title="Market cleanup"
        description="Review unlinked cards, refresh linked Yuyutei/SNKRDUNK prices, and fix market mappings in bulk."
      />

      <Surface>
        <Field label="Filter cards">
          <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, item number, card number, set" />
        </Field>
      </Surface>

      <div className="grid gap-3">
        {items.map((item) => {
          const mappings = mappingsByItem.get(item.id) || [];
          const latestBySource = latestByItem.get(item.id) || new Map<string, MarketPriceSnapshot>();
          const rows = candidates[item.id] || [];
          const open = activeItemId === item.id;
          return (
            <article key={item.id} className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div className="min-w-0">
                  <p className="break-words font-black">{item.itemName}</p>
                  <p className="break-all text-sm font-semibold text-slate-600">{item.cardNumber} / {item.rarity} / {item.art} / {item.condition}</p>
                  <p className="break-all text-xs text-slate-500">{item.itemNumber}</p>
                </div>
                <div className="text-right">
                  <p className="font-black">{formatMoney(item.askingPrice, symbol)}</p>
                  <p className="text-xs font-semibold text-slate-500">Your ask</p>
                </div>
              </div>

              <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm">
                <div className="flex min-w-0 justify-between gap-3">
                  <span className="font-semibold text-slate-600">Market mappings</span>
                  <strong className={`text-right ${mappings.length ? 'text-action' : 'text-warn'}`}>{mappings.length ? `${mappings.length} linked` : 'Not linked'}</strong>
                </div>
                {mappings.length === 0 && <p className="text-sm font-semibold text-slate-500">No market source linked yet.</p>}
                {mappings
                  .slice()
                  .sort((left, right) => marketSourceLabel(left.source).localeCompare(marketSourceLabel(right.source)))
                  .map((mapping) => {
                    const latest = latestBySource.get(mapping.source);
                    return (
                      <div key={mapping.source} className="grid gap-2 rounded-md border border-line bg-white p-3">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <a className="inline-flex min-h-11 min-w-0 items-center gap-2 break-all text-sm font-bold text-sky-700" href={mapping.sourceUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={16} className="shrink-0" /> {marketSourceLabel(mapping.source)} / {mapping.displayName || mapping.sourceUrl}
                          </a>
                          <Button
                            variant="secondary"
                            className="shrink-0"
                            disabled={refreshMutation.isPending}
                            onClick={() => refreshMutation.mutate({ item, mapping })}
                          >
                            <RefreshCcw size={16} />
                          </Button>
                        </div>
                        <div className="flex min-w-0 justify-between gap-3">
                          <span className="font-semibold text-slate-600">Latest price</span>
                          <strong className="text-right">
                            {latest ? `${formatMarketPrice(latest.price, latest.currency)} ${latest.availability ? `/ ${latest.availability}` : ''}` : 'No snapshot'}
                          </strong>
                        </div>
                        {latest && <p className="text-xs font-semibold text-slate-500">Checked {new Date(latest.fetchedAt).toLocaleString()}</p>}
                      </div>
                    );
                  })}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  variant="secondary"
                  className="flex items-center justify-center gap-2"
                  disabled={!item.cardNumber || searchMutation.isPending}
                  onClick={() => searchMutation.mutate({ item, source: 'yuyutei' })}
                >
                  <Search size={16} /> Yuyutei
                </Button>
                <Button
                  variant="secondary"
                  className="flex items-center justify-center gap-2"
                  disabled={!item.cardNumber || searchMutation.isPending}
                  onClick={() => searchMutation.mutate({ item, source: 'snkrdunk' })}
                >
                  <Search size={16} /> SNKRDUNK
                </Button>
                {mappings.length > 0 && (
                  <Button
                    className="col-span-2 flex items-center justify-center gap-2 sm:col-span-1"
                    disabled={refreshMutation.isPending}
                    onClick={() => mappings.forEach((mapping) => refreshMutation.mutate({ item, mapping }))}
                  >
                    <RefreshCcw size={16} /> Refresh all
                  </Button>
                )}
              </div>

              {open && (
                <div className="grid gap-3 rounded-md border border-line p-3">
                  <Field label="Link by Yuyutei or SNKRDUNK card URL">
                    <div className="grid gap-2 min-[520px]:grid-cols-[minmax(0,1fr)_auto]">
                      <TextInput value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} placeholder="https://yuyu-tei.jp/sell/opc/card/op15/10010" />
                      <Button
                        disabled={!manualUrl.trim() || urlMutation.isPending}
                        onClick={() => urlMutation.mutate({ item, sourceUrl: manualUrl.trim() })}
                      >
                        Load choices
                      </Button>
                    </div>
                  </Field>

                  {searchMutation.error && <p className="text-sm text-danger">{searchMutation.error.message}</p>}
                  {linkMutation.error && <p className="text-sm text-danger">{linkMutation.error.message}</p>}
                  {refreshMutation.error && <p className="text-sm text-danger">{refreshMutation.error.message}</p>}
                  {urlMutation.error && <p className="text-sm text-danger">{urlMutation.error.message}</p>}

                  <div className="grid gap-2">
                    {rows.length === 0 && !searchMutation.isPending && <p className="text-sm text-slate-600">No search results loaded yet.</p>}
                    {searchMutation.isPending && <p className="text-sm text-slate-600">Searching market...</p>}
                    {rows.map((candidate) => (
                      <button
                        key={`${candidate.mode}-${candidate.sourceUrl}-${candidateLabel(candidate)}`}
                        type="button"
                        className="grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-line bg-white p-3 text-left text-sm"
                        onClick={() => linkMutation.mutate({ item, candidate })}
                      >
                        <span className="min-w-0">
                          <strong className="block break-words">{marketSourceLabel(candidate.source)} / {candidateLabel(candidate)} / {candidate.displayName}</strong>
                          <span className="block break-all text-xs text-slate-600">{candidate.cardNumber} / {candidate.sourceUrl}</span>
                        </span>
                        <strong>{formatMarketPrice(candidate.price, candidate.currency)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

async function invalidateMarket(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  await queryClient.invalidateQueries({ queryKey: ['market-mappings', orgId] });
  await queryClient.invalidateQueries({ queryKey: ['market-snapshots', orgId] });
}

function formatMarketPrice(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function marketSourceLabel(source: string) {
  return source === 'snkrdunk' ? 'SNKRDUNK' : 'Yuyutei';
}

function candidateLabel(candidate: MarketCandidate) {
  if (candidate.source === 'snkrdunk') return candidate.conditionName ? `${candidate.conditionName} condition` : 'Ask';
  return candidate.mode === 'sell' ? 'Sale' : 'Buylist';
}

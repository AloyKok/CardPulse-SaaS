import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Edit3, ExternalLink, Package, Plus, RefreshCcw, Search, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Field, SelectInput, TextArea, TextInput } from '../components/Field';
import { PageHeader, StatCard, Surface } from '../components/Page';
import {
  deleteInventoryItem,
  generateInventoryItemNumber,
  getSettings,
  getInventoryItem,
  listBuybacks,
  listInventory,
  listInventoryPage,
  listMarketMappings,
  listMarketPriceSnapshots,
  listMarketCandidatesFromUrl,
  refreshMarketMapping,
  saveInventoryItem,
  saveMarketMapping,
  saveMarketSnapshot,
  searchSnkrdunkMarketByCardNumber,
  searchYuyuteiMarketByCardNumber,
  updateBuybackProcessingStatus,
  type InventoryInput
} from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';
import { useAuth } from '../lib/supabase/AuthProvider';
import { formatMoney } from '../lib/format/money';
import type {
  CardArt,
  CardCategory,
  CardLanguage,
  CardRarity,
  Buyback,
  InventoryFilters,
  InventoryItem,
  InventoryItemType,
  MarketCandidate,
  MarketMapping,
  MarketPriceSnapshot,
  SealedProductType
} from '../types/domain';
import { ONE_PIECE_SET_NAMES } from '../lib/cards/onePieceMetadata';
import { inventoryItemTypeLabels, sealedProductTypeLabels, sealedProductTypeOptions } from '../lib/inventory/productTypes';

const emptyFilters: InventoryFilters = {
  search: '',
  itemType: '',
  setName: '',
  rarity: '',
  art: '',
  category: '',
  language: '',
  condition: '',
  status: '',
  lowStockOnly: false
};

const standardRarityOptions = ['C', 'UC', 'R', 'SR', 'SEC', 'Leader', 'Promo'].map((value) => ({ value, label: value }));
const donRarityOptions = ['Gold', 'Foil', 'Promo'].map((value) => ({ value, label: value }));
const rarityOptions = [...standardRarityOptions, ...donRarityOptions];
const artOptions = ['Base', 'Parallel', 'Manga', 'SP'].map((value) => ({ value, label: value }));
const categoryOptions = ['Character', 'Leader', 'Event', 'Stage', 'DON'].map((value) => ({ value, label: value }));
const languageOptions = [
  { value: 'EN', label: 'English' },
  { value: 'JP', label: 'Japanese' },
  { value: 'OTHER', label: 'Other' }
];
const conditionOptions = ['MINT', 'NM', 'LP', 'MP', 'HP', 'DMG', 'GRADED'].map((value) => ({ value, label: value }));
const sealedConditionOptions = ['SEALED', 'OPENED', 'DAMAGED'].map((value) => ({ value, label: value }));
const itemTypeOptions = [
  { value: '', label: 'All item types' },
  { value: 'single_card', label: 'Single cards' },
  { value: 'sealed_product', label: 'Sealed products' },
  { value: 'mystery_pack', label: 'Mystery packs' }
];
const INVENTORY_PAGE_SIZE = 20;

export function InventoryScreen() {
  const { organization } = useOrg();
  const [filters, setFilters] = useState(emptyFilters);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState('');
  const [marketRefreshSummary, setMarketRefreshSummary] = useState('');
  const [page, setPage] = useState(0);
  const [searchText, setSearchText] = useState(emptyFilters.search);
  const [openedBuybackId, setOpenedBuybackId] = useState('');
  const searchParamKey = searchParams.toString();
  const buybackId = searchParams.get('buybackId') || '';
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const buybacksQuery = useQuery({
    queryKey: ['buybacks', organization.id, 'inventory-prefill'],
    queryFn: () => listBuybacks(organization.id, 1000),
    enabled: Boolean(buybackId)
  });
  const marketMappingsQuery = useQuery({ queryKey: ['market-mappings', organization.id], queryFn: () => listMarketMappings(organization.id) });
  const marketSnapshotsQuery = useQuery({ queryKey: ['market-snapshots', organization.id], queryFn: () => listMarketPriceSnapshots(organization.id) });
  const query = useQuery({
    queryKey: ['inventory', organization.id, filters, page],
    queryFn: () => listInventoryPage(organization.id, filters, { includeImages: true, page, pageSize: INVENTORY_PAGE_SIZE }),
    placeholderData: (previous) => previous
  });
  const deleteMutation = useMutation({
    mutationFn: (item: InventoryItem) => deleteInventoryItem(organization.id, item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] })
  });

  useEffect(() => {
    setPage(0);
  }, [filters, searchParamKey]);

  const sourceBuyback = useMemo(
    () => (buybacksQuery.data || []).find((buyback) => buyback.id === buybackId) || null,
    [buybackId, buybacksQuery.data]
  );

  useEffect(() => {
    if (!sourceBuyback || openedBuybackId === sourceBuyback.id) return;
    setEditing(null);
    setFormOpen(true);
    setOpenedBuybackId(sourceBuyback.id);
  }, [openedBuybackId, sourceBuyback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => current.search === searchText ? current : { ...current, search: searchText });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  const refreshLinkedMarketMutation = useMutation({
    mutationFn: async () => {
      const mappings = marketMappingsQuery.data || await listMarketMappings(organization.id);
      let refreshed = 0;
      const errors: string[] = [];

      // Refresh one at a time to avoid hammering market providers from the local dev server.
      for (const mapping of mappings) {
        try {
          const candidate = await refreshMarketMapping(mapping);
          await saveMarketMapping(organization.id, mapping.inventoryItemId, candidate);
          await saveMarketSnapshot(organization.id, mapping.inventoryItemId, candidate);
          refreshed += 1;
        } catch (error) {
          const label = mapping.displayName || mapping.sourceUrl;
          const message = error instanceof Error ? error.message : 'refresh failed';
          errors.push(`${label}: ${message}`);
        }
      }

      await invalidateMarket(queryClient, organization.id);
      return { total: mappings.length, refreshed, errors };
    },
    onMutate: () => setMarketRefreshSummary('Refreshing linked market prices...'),
    onSuccess: ({ total, refreshed, errors }) => {
      if (total === 0) {
        setMarketRefreshSummary('No linked market cards to refresh yet.');
        return;
      }
      setMarketRefreshSummary(errors.length
        ? `${refreshed} of ${total} linked cards updated. ${errors.length} failed.`
        : `${refreshed} linked cards updated.`);
    },
    onError: (error) => setMarketRefreshSummary(error instanceof Error ? error.message : 'Market refresh failed.')
  });

  const items = useMemo(() => {
    let rows = query.data?.items || [];
    if (searchParams.get('aging')) {
      const cutoff = Date.now() - (settingsQuery.data?.agingThresholdDays || 60) * 86400000;
      rows = rows.filter((item) => item.quantity > 0 && new Date(item.createdAt).getTime() <= cutoff);
    }
    if (searchParams.get('belowMarket')) {
      rows = rows.filter((item) => item.quantity > 0 && item.marketPrice != null && item.askingPrice < item.marketPrice);
    }
    if (searchParams.get('price')) {
      const latestByItem = latestComparableMarketByItem(marketSnapshotsQuery.data || [], settingsQuery.data);
      rows = rows.filter((item) => {
        const snapshot = latestByItem.get(item.id);
        if (!snapshot || snapshot.price <= 0 || item.quantity <= 0 || item.status !== 'in_stock') return false;
        if (searchParams.get('price') === 'over') return item.askingPrice > snapshot.price * 1.1;
        if (searchParams.get('price') === 'under') return item.askingPrice < snapshot.price * 0.9;
        return true;
      });
    }
    return rows;
  }, [marketSnapshotsQuery.data, query.data?.items, searchParams, settingsQuery.data]);
  const totalItems = query.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / INVENTORY_PAGE_SIZE));
  const conditionFilterOptions = useMemo(() => (
    [...new Set([...conditionOptions, ...sealedConditionOptions].map((option) => option.value))]
      .map((value) => ({ value, label: value }))
  ), []);
  const latestMarketsByItem = useMemo(() => {
    const map = new Map<string, Map<string, MarketPriceSnapshot>>();
    (marketSnapshotsQuery.data || []).forEach((snapshot) => {
      const sourceMap = map.get(snapshot.inventoryItemId) || new Map<string, MarketPriceSnapshot>();
      const existing = sourceMap.get(snapshot.source);
      if (!existing || new Date(snapshot.fetchedAt).getTime() > new Date(existing.fetchedAt).getTime()) {
        sourceMap.set(snapshot.source, snapshot);
      }
      map.set(snapshot.inventoryItemId, sourceMap);
    });
    return map;
  }, [marketSnapshotsQuery.data]);
  const marketSnapshotsByItem = useMemo(() => {
    const map = new Map<string, MarketPriceSnapshot[]>();
    (marketSnapshotsQuery.data || []).forEach((snapshot) => {
      const rows = map.get(snapshot.inventoryItemId) || [];
      rows.push(snapshot);
      map.set(snapshot.inventoryItemId, rows);
    });
    return map;
  }, [marketSnapshotsQuery.data]);
  const pageStats = useMemo(() => {
    const units = items.reduce((sum, item) => sum + item.quantity, 0);
    const askValue = items.reduce((sum, item) => sum + item.askingPrice * item.quantity, 0);
    const linked = items.filter((item) => latestMarketsByItem.has(item.id)).length;
    const soldOut = items.filter((item) => item.status === 'sold_out' || item.quantity <= 0).length;
    return { units, askValue, linked, soldOut };
  }, [items, latestMarketsByItem]);

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Inventory control"
        title="Inventory"
        description={`${totalItems} matching lines / page ${Math.min(page + 1, totalPages)} of ${totalPages}`}
        action={(
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button
              variant="secondary"
              className="flex items-center gap-2"
              disabled={refreshLinkedMarketMutation.isPending || (marketMappingsQuery.data?.length || 0) === 0}
              onClick={() => refreshLinkedMarketMutation.mutate()}
            >
              <RefreshCcw size={18} /> {refreshLinkedMarketMutation.isPending ? 'Refreshing' : 'Refresh linked'}
            </Button>
            <Button className="flex items-center gap-2" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus size={18} /> Add
            </Button>
          </div>
        )}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Units on page" value={String(pageStats.units)} />
          <StatCard label="Ask value" value={formatMoney(pageStats.askValue, settingsQuery.data?.currencySymbol)} />
          <StatCard label="Market linked" value={`${pageStats.linked}/${items.length}`} />
          <StatCard label="Sold out lines" value={String(pageStats.soldOut)} tone={pageStats.soldOut === 0 ? 'good' : 'warn'} />
        </div>
      </PageHeader>
      {marketRefreshSummary && (
        <p className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          {marketRefreshSummary}
        </p>
      )}

      <Surface className="grid gap-3">
        {(searchParams.get('aging') || searchParams.get('belowMarket') || searchParams.get('price')) && (
          <button
            type="button"
            className="min-h-11 rounded-md bg-amber-50 px-3 text-left text-sm font-bold text-amber-900"
            onClick={() => setSearchParams({})}
          >
            Showing dashboard attention items / tap to clear
          </button>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
          <TextInput className="w-full pl-10" placeholder="Search name, product type, set or item number" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <SelectInput value={filters.itemType} onValueChange={(value) => setFilters({ ...filters, itemType: value })} options={itemTypeOptions} />
          <SelectInput value={filters.setName} onValueChange={(value) => setFilters({ ...filters, setName: value })} options={[{ value: '', label: 'All sets' }, ...ONE_PIECE_SET_NAMES.map((value) => ({ value, label: value }))]} />
          <SelectInput value={filters.rarity} onValueChange={(value) => setFilters({ ...filters, rarity: value })} options={[{ value: '', label: 'All rarities' }, ...rarityOptions]} />
          <SelectInput value={filters.art} onValueChange={(value) => setFilters({ ...filters, art: value })} options={[{ value: '', label: 'All art' }, ...artOptions]} />
          <SelectInput value={filters.category} onValueChange={(value) => setFilters({ ...filters, category: value })} options={[{ value: '', label: 'All categories' }, ...categoryOptions]} />
          <SelectInput value={filters.language} onValueChange={(value) => setFilters({ ...filters, language: value })} options={[{ value: '', label: 'All languages' }, ...languageOptions]} />
          <SelectInput value={filters.condition} onValueChange={(value) => setFilters({ ...filters, condition: value })} options={[{ value: '', label: 'All conditions' }, ...conditionFilterOptions]} />
          <SelectInput
            value={filters.status}
            onValueChange={(value) => setFilters({ ...filters, status: value })}
            options={[
              { value: '', label: 'Any status' },
              { value: 'in_stock', label: 'In stock' },
              { value: 'sold_out', label: 'Sold out' },
              { value: 'reserved', label: 'Reserved' }
            ]}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={filters.lowStockOnly} onChange={(event) => setFilters({ ...filters, lowStockOnly: event.target.checked })} />
          Low stock only
        </label>
      </Surface>

      {query.isLoading ? <p className="text-sm text-slate-600">Loading inventory...</p> : null}
      {query.error ? <p className="text-sm text-danger">{query.error.message}</p> : null}

      <div className="grid gap-2">
        {items.map((item) => {
          const latestMarkets = [...(latestMarketsByItem.get(item.id)?.values() || [])];
          const marketHistory = marketSnapshotsByItem.get(item.id) || [];
          return (
          <article key={item.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:border-slate-300">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 lg:grid-cols-[auto_minmax(0,1fr)_12rem_8rem]">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={`${item.itemName} preview`}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[5/7] h-28 w-20 shrink-0 rounded-md border border-line bg-slate-50 object-contain lg:h-36 lg:w-24"
                />
              ) : (
                <div className="grid aspect-[5/7] h-28 w-20 shrink-0 place-items-center rounded-md border border-dashed border-line bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400 lg:h-36 lg:w-24">
                  No photo
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="break-words text-base font-black leading-tight">{item.itemName}</p>
                  <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">{inventoryItemTypeLabels[item.itemType]}</span>
                </div>
                <p className="mt-1 break-all text-sm font-semibold text-slate-600">{item.itemNumber}</p>
                {item.itemType === 'single_card' ? (
                  <>
                    <p className="break-words text-sm text-slate-600">{item.cardNumber} / {item.setName} / {item.language}</p>
                    <p className="break-words text-sm text-slate-600">{item.rarity} / {item.art} / {item.category} / {item.condition} / qty {item.quantity}</p>
                  </>
                ) : (
                  <p className="break-words text-sm text-slate-600">
                    {item.productCategory ? `${sealedProductTypeLabels[item.productCategory]} / ` : ''}{item.language} / {item.condition} / qty {item.quantity}
                  </p>
                )}
                <div className="mt-2 lg:hidden">
                  <p className="text-lg font-black">{formatMoney(item.askingPrice, settingsQuery.data?.currencySymbol)}</p>
                  {item.itemType === 'single_card' && <MarketPriceList snapshots={marketHistory} latestSnapshots={latestMarkets} />}
                  <p className={`text-xs font-bold ${item.status === 'in_stock' ? 'text-action' : 'text-warn'}`}>{item.status.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="hidden min-w-0 rounded-md bg-slate-50 p-3 text-right lg:block">
                <p className="text-xs font-bold text-slate-500">Ask price</p>
                <p className="mt-1 text-lg font-black">{formatMoney(item.askingPrice, settingsQuery.data?.currencySymbol)}</p>
                {item.itemType === 'single_card' && <MarketPriceList snapshots={marketHistory} latestSnapshots={latestMarkets} align="right" />}
              </div>
              <div className="hidden min-w-0 rounded-md bg-slate-50 p-3 text-right lg:block">
                <p className="text-xs font-bold text-slate-500">Stock</p>
                <p className="mt-1 text-lg font-black">{item.quantity}</p>
                <p className={`text-xs font-bold ${item.status === 'in_stock' ? 'text-action' : 'text-warn'}`}>{item.status.replace('_', ' ')}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button
                variant="secondary"
                className="flex items-center justify-center gap-2"
                disabled={loadingEditId === item.id}
                onClick={async () => {
                  setLoadingEditId(item.id);
                  try {
                    setEditing(await getInventoryItem(organization.id, item.id) || item);
                    setFormOpen(true);
                  } finally {
                    setLoadingEditId('');
                  }
                }}
              >
                <Edit3 size={16} /> {loadingEditId === item.id ? 'Opening' : 'Edit'}
              </Button>
              <Button
                variant="ghost"
                className="flex items-center justify-center gap-2 text-danger"
                onClick={() => {
                  if (confirm(`Delete ${item.itemName} (${item.itemNumber})? Sales history snapshots stay intact.`)) deleteMutation.mutate(item);
                }}
              >
                <Trash2 size={16} /> Delete
              </Button>
            </div>
          </article>
          );
        })}
      </div>

      {totalItems > INVENTORY_PAGE_SIZE && (
        <div className="sticky bottom-[72px] z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-line bg-white p-2 shadow-sm sm:static">
          <Button
            type="button"
            variant="secondary"
            disabled={page === 0 || query.isFetching}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Previous
          </Button>
          <span className="text-center text-sm font-bold text-slate-600">
            {Math.min(page + 1, totalPages)} / {totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={page + 1 >= totalPages || query.isFetching}
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
          >
            Next
          </Button>
        </div>
      )}

      {formOpen && (
        <InventoryForm
          key={editing?.id || 'new'}
          item={editing}
          sourceBuyback={sourceBuyback}
          onOpenExisting={async (existing) => {
            setEditing(await getInventoryItem(organization.id, existing.id) || existing);
            setFormOpen(true);
          }}
          onClose={() => {
            setFormOpen(false);
            clearBuybackPrefill();
          }}
          onSaved={async () => {
            setFormOpen(false);
            if (sourceBuyback) {
              await updateBuybackProcessingStatus(
                organization.id,
                sourceBuyback.id,
                sourceBuyback.itemCount <= 1 ? 'processed' : 'partially_processed'
              );
              await queryClient.invalidateQueries({ queryKey: ['buybacks', organization.id] });
            }
            clearBuybackPrefill();
            queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });
          }}
        />
      )}
    </div>
  );

  function clearBuybackPrefill() {
    if (!buybackId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('buybackId');
    setSearchParams(next);
  }
}

function InventoryForm({
  item,
  sourceBuyback,
  onOpenExisting,
  onClose,
  onSaved
}: {
  item: InventoryItem | null;
  sourceBuyback?: Buyback | null;
  onOpenExisting: (item: InventoryItem) => void;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { organization } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<InventoryItemType | null>(item?.itemType || null);
  const [marketCandidates, setMarketCandidates] = useState<MarketCandidate[]>([]);
  const [pendingMarketCandidates, setPendingMarketCandidates] = useState<MarketCandidate[]>([]);
  const [marketLinked, setMarketLinked] = useState(false);
  const [manualMarketUrl, setManualMarketUrl] = useState('');
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const [input, setInput] = useState<InventoryInput>({
    itemNumber: item?.itemNumber || '',
    autoGenerateItemNumber: !item,
    itemType: item?.itemType || 'single_card',
    productCategory: item?.productCategory || null,
    itemName: item?.itemName || sourceBuyback?.itemSummary || '',
    cardNumber: item?.cardNumber || '',
    setName: item?.setName || '',
    rarity: item?.rarity || 'C',
    art: item?.art || 'Base',
    language: item?.language || 'JP',
    category: item?.category || 'Character',
    condition: item?.condition || 'MINT',
    gradeCompany: item?.gradeCompany || '',
    grade: item?.grade || '',
    certNumber: item?.certNumber || '',
    quantity: item?.quantity ?? sourceBuyback?.itemCount ?? 1,
    costBasis: item?.costBasis ?? buybackAverageCost(sourceBuyback),
    floorPrice: item?.floorPrice || null,
    askingPrice: item?.askingPrice ?? 0,
    marketPrice: item?.marketPrice || null,
    location: item?.location || '',
    acquisitionSource: item?.acquisitionSource || buybackAcquisitionSource(sourceBuyback),
    acquisitionDate: item?.acquisitionDate || sourceBuyback?.createdAt.slice(0, 10) || '',
    listedOnline: item?.listedOnline || false,
    tags: item?.tags || [],
    imageUrl: item?.imageUrl || '',
    notes: item?.notes || buybackInventoryNotes(sourceBuyback),
    status: item?.status || 'in_stock'
  });
  const [generatedItemNumber, setGeneratedItemNumber] = useState(item?.itemNumber || '');
  const mappingsQuery = useQuery({
    queryKey: ['market-mappings', organization.id, item?.id || 'form'],
    queryFn: () => listMarketMappings(organization.id),
    enabled: Boolean(item?.id)
  });
  const snapshotsQuery = useQuery({
    queryKey: ['market-snapshots', organization.id, item?.id || 'form'],
    queryFn: () => listMarketPriceSnapshots(organization.id),
    enabled: Boolean(item?.id)
  });
  const duplicateCheckQuery = useQuery({
    queryKey: ['inventory', organization.id, 'duplicate-check'],
    queryFn: () => listInventory(organization.id),
    enabled: selectedType === 'single_card'
  });
  const currentMappings = useMemo(() => {
    if (!item?.id) return [];
    return (mappingsQuery.data || []).filter((mapping) => mapping.inventoryItemId === item.id);
  }, [item?.id, mappingsQuery.data]);
  const currentSnapshots = useMemo(() => {
    if (!item?.id) return [];
    const bySource = new Map<string, MarketPriceSnapshot>();
    (snapshotsQuery.data || [])
      .filter((snapshot) => snapshot.inventoryItemId === item.id)
      .forEach((snapshot) => {
        const existing = bySource.get(snapshot.source);
        if (!existing || new Date(snapshot.fetchedAt).getTime() > new Date(existing.fetchedAt).getTime()) {
          bySource.set(snapshot.source, snapshot);
        }
      });
    return [...bySource.values()];
  }, [item?.id, snapshotsQuery.data]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (input.itemType !== 'single_card') return;
    const nextOptions = input.category === 'DON' ? donRarityOptions : standardRarityOptions;
    if (nextOptions.some((option) => option.value === input.rarity)) return;
    setInput((current) => ({ ...current, rarity: nextOptions[0].value as CardRarity }));
  }, [input.category, input.itemType, input.rarity]);

  useEffect(() => {
    const reference = input.itemType === 'single_card'
      ? input.cardNumber || ''
      : input.itemType === 'sealed_product'
        ? input.productCategory || ''
        : 'pack';
    if (!input.autoGenerateItemNumber || !reference.trim() || !input.condition.trim()) {
      setGeneratedItemNumber(input.itemNumber || '');
      return;
    }
    let cancelled = false;
    generateInventoryItemNumber(organization.id, input.itemType, reference, input.condition)
      .then((number) => {
        if (!cancelled) setGeneratedItemNumber(number);
      })
      .catch(() => {
        if (!cancelled) setGeneratedItemNumber('');
      });
    return () => {
      cancelled = true;
    };
  }, [input.autoGenerateItemNumber, input.cardNumber, input.condition, input.itemNumber, input.itemType, input.productCategory, organization.id]);
  const mutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Not signed in');
      const effectiveInput = input.autoGenerateItemNumber && generatedItemNumber
        ? { ...input, itemNumber: generatedItemNumber }
        : input;
      return saveInventoryItem(organization.id, user.id, effectiveInput, item?.id);
    },
    onSuccess: async (saved) => {
      await onSaved();
      void queryClient.invalidateQueries({ queryKey: ['inventory', organization.id] });
      if (saved.itemType === 'single_card' && pendingMarketCandidates.length > 0) {
        void Promise.all(pendingMarketCandidates.flatMap((candidate) => [
          saveMarketMapping(organization.id, saved.id, candidate),
          saveMarketSnapshot(organization.id, saved.id, candidate)
        ]))
          .then(() => invalidateMarket(queryClient, organization.id))
          .catch((error) => console.error('Market link save failed', error));
      }
    }
  });
  const marketSearchMutation = useMutation({
    mutationFn: async ({ source, cardNumber }: { source: 'yuyutei' | 'snkrdunk'; cardNumber: string }) => (
      source === 'snkrdunk'
        ? searchSnkrdunkMarketByCardNumber(cardNumber)
        : searchYuyuteiMarketByCardNumber(cardNumber)
    ),
    onSuccess: (rows) => setMarketCandidates(rows)
  });
  const marketLinkMutation = useMutation({
    mutationFn: async ({ saved, candidate }: { saved: InventoryItem; candidate: MarketCandidate }) => {
      await saveMarketMapping(organization.id, saved.id, candidate);
      await saveMarketSnapshot(organization.id, saved.id, candidate);
      return candidate;
    },
    onSuccess: async () => {
      setMarketLinked(true);
      await invalidateMarket(queryClient, organization.id);
    }
  });
  const marketRefreshMutation = useMutation({
    mutationFn: async ({ saved, mapping }: { saved: InventoryItem; mapping: MarketMapping }) => {
      const candidate = await refreshMarketMapping(mapping);
      await saveMarketMapping(organization.id, saved.id, candidate);
      await saveMarketSnapshot(organization.id, saved.id, candidate);
      return candidate;
    },
    onSuccess: async () => {
      setManualMarketUrl('');
      setMarketLinked(true);
      await invalidateMarket(queryClient, organization.id);
    }
  });
  const marketUrlMutation = useMutation({
    mutationFn: (sourceUrl: string) => listMarketCandidatesFromUrl(sourceUrl),
    onSuccess: (candidates) => {
      setManualMarketUrl('');
      const snkrdunkCandidate = candidates.find((candidate) => candidate.source === 'snkrdunk');
      if (snkrdunkCandidate) {
        applySnkrdunkAutofill(snkrdunkCandidate);
      }
      if (candidates.length === 1) {
        linkOrQueueMarketCandidate(candidates[0]);
        return;
      }
      setMarketLinked(false);
      setMarketCandidates(candidates);
    }
  });
  const formMarketTarget = item;
  const formRarityOptions = input.category === 'DON' ? donRarityOptions : standardRarityOptions;
  const selectedRarity = formRarityOptions.some((option) => option.value === input.rarity)
    ? input.rarity || formRarityOptions[0].value
    : formRarityOptions[0].value;
  const duplicateReview = useMemo(
    () => buildDuplicateReview(input, duplicateCheckQuery.data || [], item?.id),
    [duplicateCheckQuery.data, input, item?.id]
  );

  return (
    <div className="fixed inset-0 z-50 flex min-w-0 items-start justify-center overflow-hidden bg-slate-950/50 sm:items-center sm:p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-form-title"
        className="grid max-h-dvh min-h-dvh w-full min-w-0 max-w-2xl gap-4 overflow-y-auto overscroll-contain bg-white p-3 shadow-soft sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg sm:p-4"
        onPaste={async (event) => {
          const file = getClipboardImage(event.clipboardData);
          if (!file) return;
          event.preventDefault();
          await handlePhotoFile(file);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!selectedType) return;
          mutation.mutate();
        }}
      >
        <div className="sticky -top-3 z-20 flex items-center justify-between border-b border-line bg-white py-2 sm:-top-4">
          <h3 id="inventory-form-title" className="text-xl font-black">{item ? 'Edit item' : 'Add item'}</h3>
          <button type="button" className="grid min-h-11 min-w-11 place-items-center" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        {!selectedType ? (
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-slate-600">What are you adding?</p>
            <ItemTypeChoice
              icon={<CreditCard size={24} />}
              title="Single / Slabs"
              description="Raw cards and graded slabs with card number, set, rarity, art and condition."
              onClick={() => chooseItemType('single_card')}
            />
            <ItemTypeChoice
              icon={<Package size={24} />}
              title="Sealed product"
              description="Booster boxes, booster packs, starter decks, promo sets and collections."
              onClick={() => chooseItemType('sealed_product')}
            />
          </div>
        ) : (
          <>
            {!item && (
              <button
                type="button"
                className="min-h-11 rounded-md border border-line bg-slate-50 px-3 text-left text-sm font-semibold text-action"
                onClick={() => setSelectedType(null)}
              >
                {inventoryItemTypeLabels[selectedType]} · Change type
              </button>
            )}
            {selectedType === 'single_card' && !item && (
              <section className="grid gap-2 rounded-lg border border-action/30 bg-sky-50 p-3">
                <div>
                  <p className="text-sm font-black text-action">Autofill from SNKRDUNK</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    Paste a SNKRDUNK card URL to fill the card name, code, set, rarity, and art.
                  </p>
                </div>
                <div className="grid gap-2 min-[520px]:grid-cols-[minmax(0,1fr)_auto]">
                  <TextInput
                    value={manualMarketUrl}
                    onChange={(event) => setManualMarketUrl(event.target.value)}
                    placeholder="https://snkrdunk.com/en/trading-cards/442288"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!manualMarketUrl.trim() || marketUrlMutation.isPending}
                    onClick={() => marketUrlMutation.mutate(manualMarketUrl.trim())}
                  >
                    {marketUrlMutation.isPending ? 'Loading...' : 'Autofill'}
                  </Button>
                </div>
              </section>
            )}
            <Field label={selectedType === 'single_card' ? 'Card name' : 'Product name'}>
              <TextInput value={input.itemName} onChange={(e) => setInput({ ...input, itemName: e.target.value })} required />
            </Field>
            {selectedType === 'single_card' && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Card number"><TextInput value={input.cardNumber || ''} onChange={(e) => { setPendingMarketCandidates([]); setInput({ ...input, cardNumber: e.target.value }); }} required /></Field>
                  <Field label="Set name">
                    <SelectInput
                      value={input.setName || ''}
                      onValueChange={(value) => setInput({ ...input, setName: value })}
                      placeholder="Select a set"
                      options={ONE_PIECE_SET_NAMES.map((value) => ({ value, label: value }))}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Field label="Rarity">
                    <SelectInput value={selectedRarity} onValueChange={(value) => setInput({ ...input, rarity: value as CardRarity })} options={formRarityOptions} />
                  </Field>
                  <Field label="Art">
                    <SelectInput value={input.art || 'Base'} onValueChange={(value) => setInput({ ...input, art: value as CardArt })} options={artOptions} />
                  </Field>
                  <Field label="Language">
                    <SelectInput value={input.language} onValueChange={(value) => setInput({ ...input, language: value as CardLanguage })} options={languageOptions} />
                  </Field>
                  <Field label="Category">
                    <SelectInput
                      value={input.category || 'Character'}
                      onValueChange={(value) => {
                        const nextCategory = value as CardCategory;
                        const nextOptions = nextCategory === 'DON' ? donRarityOptions : standardRarityOptions;
                        const nextRarity = nextOptions.some((option) => option.value === input.rarity)
                          ? input.rarity
                          : nextOptions[0].value;
                        setInput({ ...input, category: nextCategory, rarity: nextRarity as CardRarity });
                      }}
                      options={categoryOptions}
                    />
                  </Field>
                </div>
                <Field label="Condition">
                  <SelectInput value={input.condition} onValueChange={(value) => setInput({ ...input, condition: value })} options={conditionOptions} />
                </Field>
                {input.condition === 'GRADED' && (
                  <div className="grid gap-3 min-[380px]:grid-cols-2">
                    <Field label="Grade company"><TextInput value={input.gradeCompany || ''} onChange={(e) => setInput({ ...input, gradeCompany: e.target.value })} /></Field>
                    <Field label="Grade"><TextInput value={input.grade || ''} onChange={(e) => setInput({ ...input, grade: e.target.value })} /></Field>
                    <Field label="Cert number"><TextInput value={input.certNumber || ''} onChange={(e) => setInput({ ...input, certNumber: e.target.value })} /></Field>
                  </div>
                )}
                <DuplicateReviewPanel
                  review={duplicateReview}
                  symbol={settingsQuery.data?.currencySymbol}
                  onOpenExisting={onOpenExisting}
                />
              </>
            )}
            {selectedType === 'sealed_product' && (
              <div className="grid gap-3 min-[400px]:grid-cols-2">
                <Field label="Sealed product type">
                  <SelectInput
                    value={input.productCategory || ''}
                    onValueChange={(value) => setInput({ ...input, productCategory: value as SealedProductType })}
                    placeholder="Select product type"
                    options={sealedProductTypeOptions}
                  />
                </Field>
                <Field label="Condition">
                  <SelectInput value={input.condition} onValueChange={(value) => setInput({ ...input, condition: value })} options={sealedConditionOptions} />
                </Field>
              </div>
            )}
            {selectedType !== 'single_card' && (
              <Field label="Language">
                <SelectInput value={input.language} onValueChange={(value) => setInput({ ...input, language: value as CardLanguage })} options={languageOptions} />
              </Field>
            )}
        <div className="grid gap-3 min-[380px]:grid-cols-3">
          <Field label="Qty"><TextInput type="number" min={0} value={input.quantity} onChange={(e) => setInput({ ...input, quantity: Number(e.target.value) })} required /></Field>
          <Field label="Cost"><TextInput type="number" min={0} step="0.01" value={input.costBasis ?? ''} onChange={(e) => setInput({ ...input, costBasis: e.target.value ? Number(e.target.value) : null })} /></Field>
          <Field label="Asking price"><TextInput type="number" min={0} step="0.01" value={input.askingPrice} onChange={(e) => setInput({ ...input, askingPrice: Number(e.target.value) })} required /></Field>
        </div>
        {selectedType === 'single_card' && (
          <InventoryMarketPanel
            cardNumber={input.cardNumber || ''}
            targetItem={formMarketTarget}
            currentMappings={currentMappings}
            currentSnapshots={currentSnapshots}
            pendingCandidates={pendingMarketCandidates}
            candidates={marketCandidates}
            linked={marketLinked}
            manualUrl={manualMarketUrl}
            isSearching={marketSearchMutation.isPending}
            isLinking={marketLinkMutation.isPending || marketRefreshMutation.isPending || marketUrlMutation.isPending}
            searchError={marketSearchMutation.error}
            linkError={marketLinkMutation.error || marketRefreshMutation.error || marketUrlMutation.error}
            onManualUrlChange={setManualMarketUrl}
            onSearch={(source) => marketSearchMutation.mutate({ source, cardNumber: input.cardNumber || '' })}
            onRefreshMapping={(mapping) => {
              const target = formMarketTarget;
              if (target) marketRefreshMutation.mutate({ saved: target, mapping });
            }}
            onLinkUrl={() => {
              if (manualMarketUrl.trim()) marketUrlMutation.mutate(manualMarketUrl.trim());
            }}
            onLink={linkOrQueueMarketCandidate}
          />
        )}
        <div className="rounded-md border border-line p-3">
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={input.autoGenerateItemNumber}
              onChange={(e) => setInput({ ...input, autoGenerateItemNumber: e.target.checked })}
            />
            Auto-generate item number
          </label>
          <Field label="Item number">
            <TextInput
              value={input.autoGenerateItemNumber ? generatedItemNumber : input.itemNumber || ''}
              onChange={(e) => setInput({ ...input, itemNumber: e.target.value.toUpperCase() })}
              disabled={input.autoGenerateItemNumber}
              placeholder="OP-OP04-123-MINT-001"
              required={!input.autoGenerateItemNumber}
            />
          </Field>
          <p className="mt-2 text-xs text-slate-500">
            {selectedType === 'single_card'
              ? 'Format: OP + card number + condition + sequence.'
              : selectedType === 'sealed_product'
                ? 'Format: SEALED + product type + sequence.'
                : 'Format: MYSTERY-PACK + sequence.'}
          </p>
        </div>
        <div
          className="grid gap-3 rounded-md border border-dashed border-line bg-slate-50 p-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={async (event) => {
            event.preventDefault();
            const file = [...event.dataTransfer.files].find((candidate) => candidate.type.startsWith('image/'));
            if (file) await handlePhotoFile(file);
          }}
        >
          <Field label="Photo">
            <TextInput
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                await handlePhotoFile(file);
              }}
            />
          </Field>
          <p className="text-xs font-semibold text-slate-500">Paste, drop, or upload a photo. Black outer margins are trimmed automatically.</p>
        </div>
        {input.imageUrl && (
          <div className="grid place-items-center rounded-md border border-line bg-slate-950 p-3">
            <img
              src={input.imageUrl}
              alt="Item preview"
              className="aspect-[5/7] max-h-[65dvh] w-auto max-w-full rounded bg-white object-contain"
            />
          </div>
        )}
        <Field label="Notes"><TextArea value={input.notes || ''} onChange={(e) => setInput({ ...input, notes: e.target.value })} /></Field>
        {mutation.error && <p className="text-sm text-danger">{mutation.error.message}</p>}
        <div className="sticky bottom-0 flex gap-2 bg-white pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={
              mutation.isPending ||
              !input.itemName.trim() ||
              (selectedType === 'single_card' && (!input.setName || !input.cardNumber)) ||
              (selectedType === 'sealed_product' && !input.productCategory)
            }
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
          </>
        )}
      </form>
    </div>
  );

  function chooseItemType(itemType: InventoryItemType) {
    setSelectedType(itemType);
    setInput((current) => ({
      ...current,
      itemType,
      productCategory: itemType === 'sealed_product' ? 'booster_box' : null,
      cardNumber: itemType === 'single_card' ? current.cardNumber : null,
      setName: itemType === 'single_card' ? current.setName : null,
      rarity: itemType === 'single_card' ? current.rarity || 'C' : null,
      art: itemType === 'single_card' ? current.art || 'Base' : null,
      category: itemType === 'single_card' ? current.category || 'Character' : null,
      condition: itemType === 'single_card' ? 'MINT' : itemType === 'sealed_product' ? 'SEALED' : 'NEW'
    }));
  }

  function linkOrQueueMarketCandidate(candidate: MarketCandidate) {
    const target = item;
    setMarketLinked(true);
    if (candidate.source === 'snkrdunk') {
      applySnkrdunkAutofill(candidate);
    }
    if (target) {
      marketLinkMutation.mutate({ saved: target, candidate });
    } else {
      setPendingMarketCandidates((current) => [
        candidate,
        ...current.filter((existing) => existing.source !== candidate.source)
      ]);
    }
  }

  async function applySnkrdunkAutofill(candidate: MarketCandidate) {
    if (candidate.source !== 'snkrdunk') return;
    const parsed = parseSnkrdunkAutofill(candidate);
    setInput((current) => ({
      ...current,
      itemType: 'single_card',
      itemName: parsed.itemName || current.itemName,
      cardNumber: parsed.cardNumber || current.cardNumber,
      setName: parsed.setName || current.setName,
      rarity: parsed.rarity || current.rarity,
      art: parsed.art || current.art,
      imageUrl: current.imageUrl,
      language: current.language || 'JP'
    }));

  }

  async function handlePhotoFile(file: File) {
    try {
      const imageUrl = await fileToDataUrl(file);
      setInput((current) => ({ ...current, imageUrl }));
    } catch {
      alert('This photo could not be processed. Try a JPEG, PNG, or WebP image.');
    }
  }
}

function buybackAverageCost(sourceBuyback?: Buyback | null) {
  if (!sourceBuyback) return null;
  return Math.round((sourceBuyback.totalPaid / Math.max(1, sourceBuyback.itemCount)) * 100) / 100;
}

function buybackAcquisitionSource(sourceBuyback?: Buyback | null) {
  if (!sourceBuyback) return '';
  return sourceBuyback.sellerName ? `Buyback: ${sourceBuyback.sellerName}` : 'Buyback';
}

function buybackInventoryNotes(sourceBuyback?: Buyback | null) {
  if (!sourceBuyback) return '';
  return [
    `From buyback ${sourceBuyback.id}`,
    sourceBuyback.notes ? `Buyback notes: ${sourceBuyback.notes}` : ''
  ].filter(Boolean).join('\n');
}

function ItemTypeChoice({
  icon,
  title,
  description,
  onClick
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="grid min-h-20 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-line bg-white p-3 text-left shadow-sm transition hover:border-action hover:bg-sky-50"
      onClick={onClick}
    >
      <span className="grid h-12 w-12 place-items-center rounded-md bg-slate-100 text-action">{icon}</span>
      <span className="min-w-0">
        <strong className="block">{title}</strong>
        <span className="mt-1 block text-sm text-slate-600">{description}</span>
      </span>
    </button>
  );
}

type DuplicateReview = {
  cardNumber: string;
  exactMatches: InventoryItem[];
  similarCards: InventoryItem[];
  itemNumberMatches: InventoryItem[];
};

function DuplicateReviewPanel({
  review,
  symbol,
  onOpenExisting
}: {
  review: DuplicateReview;
  symbol?: string;
  onOpenExisting: (item: InventoryItem) => void;
}) {
  const rows = [...review.exactMatches, ...review.similarCards].slice(0, 8);
  if (!review.cardNumber && review.itemNumberMatches.length === 0) return null;
  if (rows.length === 0 && review.itemNumberMatches.length === 0) return null;

  return (
    <section className={`grid gap-3 rounded-lg border p-3 ${review.exactMatches.length || review.itemNumberMatches.length ? 'border-amber-300 bg-amber-50' : 'border-line bg-slate-50'}`}>
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-900">
          {review.exactMatches.length || review.itemNumberMatches.length ? 'Possible duplicate found' : 'Similar cards already recorded'}
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {review.exactMatches.length
            ? 'The same card details already exist. Open it if you only need to update quantity or price.'
            : 'Same card number exists. You can continue if rarity, art, language, condition, or grade is different.'}
        </p>
      </div>

      {review.itemNumberMatches.map((existing) => (
        <DuplicateCardRow
          key={`item-number-${existing.id}`}
          item={existing}
          symbol={symbol}
          badge="Same item number"
          urgent
          onOpenExisting={onOpenExisting}
        />
      ))}

      {rows.map((existing) => (
        <DuplicateCardRow
          key={existing.id}
          item={existing}
          symbol={symbol}
          badge={review.exactMatches.some((match) => match.id === existing.id) ? 'Exact match' : 'Similar'}
          urgent={review.exactMatches.some((match) => match.id === existing.id)}
          onOpenExisting={onOpenExisting}
        />
      ))}
    </section>
  );
}

function DuplicateCardRow({
  item,
  symbol,
  badge,
  urgent,
  onOpenExisting
}: {
  item: InventoryItem;
  symbol?: string;
  badge: string;
  urgent?: boolean;
  onOpenExisting: (item: InventoryItem) => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-line bg-white p-3 text-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <strong className="block break-words">{item.itemName}</strong>
          <span className="mt-1 block break-all text-xs font-semibold text-slate-600">{item.itemNumber}</span>
        </span>
        <span className={`shrink-0 rounded px-2 py-1 text-xs font-black ${urgent ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
          {badge}
        </span>
      </div>
      <p className="break-words text-xs font-semibold text-slate-600">
        {item.cardNumber} / {item.setName} / {item.rarity} / {item.art} / {item.language} / {item.condition}
        {item.condition === 'GRADED' ? ` / ${[item.gradeCompany, item.grade, item.certNumber].filter(Boolean).join(' ')}` : ''}
      </p>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-500">Qty {item.quantity} / Ask {formatMoney(item.askingPrice, symbol)}</span>
        <Button type="button" variant="secondary" className="shrink-0 px-3" onClick={() => onOpenExisting(item)}>
          Open
        </Button>
      </div>
    </div>
  );
}

function MarketPriceList({
  snapshots,
  latestSnapshots,
  align = 'left'
}: {
  snapshots: MarketPriceSnapshot[];
  latestSnapshots: MarketPriceSnapshot[];
  align?: 'left' | 'right';
}) {
  if (latestSnapshots.length === 0) {
    return (
      <div className={`mt-1 text-xs font-bold text-slate-500 ${align === 'right' ? 'text-right' : ''}`}>
        Market not tracked
      </div>
    );
  }

  return (
    <div className={`mt-1 grid gap-2 ${align === 'right' ? 'justify-items-end text-right' : ''}`}>
      {latestSnapshots
        .sort((left, right) => marketSourceLabel(left.source).localeCompare(marketSourceLabel(right.source)))
        .map((snapshot) => (
          <MarketPriceLine
            key={snapshot.source}
            snapshot={snapshot}
            snapshots={snapshots.filter((row) => row.source === snapshot.source)}
            align={align}
          />
        ))}
    </div>
  );
}

function MarketPriceLine({
  snapshot,
  snapshots = [],
  align = 'left'
}: {
  snapshot?: MarketPriceSnapshot;
  snapshots?: MarketPriceSnapshot[];
  align?: 'left' | 'right';
}) {
  if (!snapshot) {
    return (
      <div className={`mt-1 text-xs font-bold text-slate-500 ${align === 'right' ? 'text-right' : ''}`}>
        Market not tracked
      </div>
    );
  }
  return (
    <div className={`mt-1 grid gap-0.5 text-xs ${align === 'right' ? 'justify-items-end text-right' : ''}`}>
      <p className="font-black text-action">{marketSourceLabel(snapshot.source)} {formatMarketPrice(snapshot.price, snapshot.currency)}</p>
      <p className="font-semibold text-slate-500">{formatMarketCheckedAt(snapshot.fetchedAt)}</p>
      <MarketTrendSparkline snapshots={snapshots} align={align} />
    </div>
  );
}

function MarketTrendSparkline({ snapshots, align }: { snapshots: MarketPriceSnapshot[]; align: 'left' | 'right' }) {
  const dailyPoints = getDailyMarketPoints(snapshots, 14);
  if (dailyPoints.length === 0) return null;

  const width = 116;
  const height = 34;
  const padding = 4;
  const prices = dailyPoints.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1, max - min);
  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;
  const chartPoints = dailyPoints.length === 1 ? [dailyPoints[0], dailyPoints[0]] : dailyPoints;
  const path = chartPoints.map((point, index) => {
    const x = padding + (chartPoints.length === 1 ? drawableWidth : (index / (chartPoints.length - 1)) * drawableWidth);
    const y = padding + ((max - point.price) / range) * drawableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first = dailyPoints[0];
  const last = dailyPoints[dailyPoints.length - 1];
  const delta = last.price - first.price;
  const colorClass = delta > 0 ? 'text-action' : delta < 0 ? 'text-danger' : 'text-slate-500';
  const currency = dailyPoints[0]?.currency || 'JPY';
  const deltaLabel = delta === 0 ? 'Flat' : `${delta > 0 ? '+' : ''}${formatMarketPrice(delta, currency)}`;
  const title = dailyPoints.map((point) => `${point.day}: ${formatMarketPrice(point.price, point.currency)}`).join('\n');

  return (
    <div className={`mt-1 grid gap-1 ${align === 'right' ? 'justify-items-end' : ''}`}>
      <svg
        className="h-[34px] w-[116px] overflow-visible rounded bg-slate-50"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${marketSourceLabel(snapshots[0]?.source || 'yuyutei')} daily price trend, ${deltaLabel}`}
      >
        <title>{title}</title>
        <polyline
          points={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={colorClass}
        />
        {chartPoints.map((point, index) => {
          const x = padding + (chartPoints.length === 1 ? drawableWidth : (index / (chartPoints.length - 1)) * drawableWidth);
          const y = padding + ((max - point.price) / range) * drawableHeight;
          return <circle key={`${point.day}-${index}`} cx={x} cy={y} r="2" className={colorClass} fill="currentColor" />;
        })}
      </svg>
      <p className={`text-[11px] font-bold ${colorClass}`}>
        {dailyPoints.length}d trend · {deltaLabel}
      </p>
    </div>
  );
}

function InventoryMarketPanel({
  cardNumber,
  targetItem,
  currentMappings,
  currentSnapshots,
  pendingCandidates,
  candidates,
  linked,
  manualUrl,
  isSearching,
  isLinking,
  searchError,
  linkError,
  onManualUrlChange,
  onSearch,
  onRefreshMapping,
  onLinkUrl,
  onLink
}: {
  cardNumber: string;
  targetItem?: InventoryItem | null;
  currentMappings: MarketMapping[];
  currentSnapshots: MarketPriceSnapshot[];
  pendingCandidates: MarketCandidate[];
  candidates: MarketCandidate[];
  linked: boolean;
  manualUrl: string;
  isSearching: boolean;
  isLinking: boolean;
  searchError: Error | null;
  linkError: Error | null;
  onManualUrlChange: (value: string) => void;
  onSearch: (source: 'yuyutei' | 'snkrdunk') => void;
  onRefreshMapping: (mapping: MarketMapping) => void;
  onLinkUrl: () => void;
  onLink: (candidate: MarketCandidate) => void;
}) {
  const hasCardNumber = Boolean(cardNumber.trim());
  const snapshotBySource = new Map(currentSnapshots.map((snapshot) => [snapshot.source, snapshot]));
  return (
    <section className="grid gap-3 rounded-lg border border-action/30 bg-sky-50 p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-action">Market tracking</p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-600">
            Search and link Yuyutei or SNKRDUNK while adding or editing this card.
          </p>
        </div>
        <div className="grid shrink-0 gap-2">
          <Button type="button" variant="secondary" className="flex items-center gap-2 px-3" onClick={() => onSearch('yuyutei')} disabled={!hasCardNumber || isSearching}>
            <Search size={16} /> Yuyutei
          </Button>
          <Button type="button" variant="secondary" className="flex items-center gap-2 px-3" onClick={() => onSearch('snkrdunk')} disabled={!hasCardNumber || isSearching}>
            <Search size={16} /> SNKRDUNK
          </Button>
        </div>
      </div>

      <div className="grid gap-2 rounded-md border border-line bg-white p-3 text-sm">
        <span className="font-semibold text-slate-600">Current markets</span>
        {currentMappings.length === 0 && <strong>Not linked</strong>}
        {currentMappings.map((mapping) => {
          const snapshot = snapshotBySource.get(mapping.source);
          return (
            <div key={mapping.source} className="grid gap-2 rounded-md border border-line bg-slate-50 p-2">
              <div className="flex min-w-0 justify-between gap-3">
                <span className="font-black">{marketSourceLabel(mapping.source)}</span>
                <strong className="text-right">
                  {snapshot ? formatMarketPrice(snapshot.price, snapshot.currency) : 'No snapshot'}
                </strong>
              </div>
              {snapshot && <p className="text-xs font-semibold text-slate-500">{formatMarketCheckedAt(snapshot.fetchedAt)}</p>}
              <a className="inline-flex min-h-8 min-w-0 items-center gap-1 break-all text-xs font-bold text-sky-700" href={mapping.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={13} className="shrink-0" /> {mapping.displayName || mapping.sourceUrl}
              </a>
              {targetItem && (
                <Button type="button" variant="secondary" className="mt-1 flex items-center justify-center gap-2" disabled={isLinking} onClick={() => onRefreshMapping(mapping)}>
                  <RefreshCcw size={16} /> Refresh {marketSourceLabel(mapping.source)}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 min-[520px]:grid-cols-[minmax(0,1fr)_auto]">
        <TextInput
          value={manualUrl}
          onChange={(event) => onManualUrlChange(event.target.value)}
          placeholder="Paste Yuyutei or SNKRDUNK card URL"
        />
        <Button type="button" variant="secondary" disabled={!manualUrl.trim() || isLinking} onClick={onLinkUrl}>
          Load choices
        </Button>
      </div>

      {linked && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          {targetItem ? 'Market link saved and price snapshot recorded.' : 'Market result selected. It will be linked when you save the card.'}
        </p>
      )}
      {pendingCandidates.length > 0 && !targetItem && (
        <div className="grid gap-2 rounded-md border border-emerald-200 bg-white p-3 text-sm">
          <p className="font-black text-emerald-800">Selected market links</p>
          {pendingCandidates
            .slice()
            .sort((left, right) => marketSourceLabel(left.source).localeCompare(marketSourceLabel(right.source)))
            .map((candidate) => (
              <div key={candidate.source} className="flex min-w-0 justify-between gap-3 rounded bg-emerald-50 px-3 py-2 font-semibold text-emerald-900">
                <span className="min-w-0 break-words">{marketSourceLabel(candidate.source)} / {candidateLabel(candidate)}</span>
                <strong className="shrink-0">{formatMarketPrice(candidate.price, candidate.currency)}</strong>
              </div>
            ))}
        </div>
      )}
      {isSearching && <p className="text-sm font-semibold text-slate-600">Searching market...</p>}
      {searchError && <p className="text-sm font-bold text-danger">{searchError.message}</p>}
      {linkError && <p className="text-sm font-bold text-danger">{linkError.message}</p>}

      <div className="grid gap-2">
        {!isSearching && candidates.length === 0 && (
          <p className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-600">
            Tap a source after entering the card number, or paste a Yuyutei/SNKRDUNK card URL.
          </p>
        )}
        {candidates.map((candidate) => (
          <button
            key={`${candidate.mode}-${candidate.sourceUrl}-${candidateLabel(candidate)}`}
            type="button"
            className="grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-line bg-white p-3 text-left text-sm shadow-sm disabled:opacity-60"
            disabled={isLinking}
            onClick={() => onLink(candidate)}
          >
            <span className="min-w-0">
              <strong className="block break-words">
                {marketSourceLabel(candidate.source)} / {candidateLabel(candidate)} / {candidate.displayName}
              </strong>
              <span className="mt-1 flex min-w-0 items-center gap-1 break-all text-xs font-semibold text-slate-600">
                <ExternalLink size={13} className="shrink-0" /> {candidate.cardNumber} / {candidate.sourceUrl}
              </span>
            </span>
            <strong className="text-right">{formatMarketPrice(candidate.price, candidate.currency)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

async function fileToDataUrl(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 720;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const source = document.createElement('canvas');
  source.width = Math.max(1, Math.round(bitmap.width * scale));
  source.height = Math.max(1, Math.round(bitmap.height * scale));
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new Error('Unable to process image');
  sourceContext.drawImage(bitmap, 0, 0, source.width, source.height);
  bitmap.close();

  const crop = getContentCrop(sourceContext, source.width, source.height);
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to process image');
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function getClipboardImage(data: DataTransfer) {
  const file = [...data.files].find((candidate) => candidate.type.startsWith('image/'));
  if (file) return file;
  return [...data.items]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .find((candidate): candidate is File => Boolean(candidate)) || null;
}

function getContentCrop(context: CanvasRenderingContext2D, width: number, height: number) {
  const data = context.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      if (alpha > 20 && (red > 24 || green > 24 || blue > 24)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) return { x: 0, y: 0, width, height };

  const padding = Math.round(Math.min(width, height) * 0.015);
  const x = Math.max(0, left - padding);
  const y = Math.max(0, top - padding);
  const cropRight = Math.min(width - 1, right + padding);
  const cropBottom = Math.min(height - 1, bottom + padding);
  const cropWidth = cropRight - x + 1;
  const cropHeight = cropBottom - y + 1;

  if (cropWidth > width * 0.96 && cropHeight > height * 0.96) return { x: 0, y: 0, width, height };
  return { x, y, width: cropWidth, height: cropHeight };
}

function formatMarketPrice(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function getDailyMarketPoints(snapshots: MarketPriceSnapshot[], limit: number) {
  const byDay = new Map<string, { day: string; price: number; currency: string; fetchedAt: string }>();
  [...snapshots]
    .sort((left, right) => new Date(left.fetchedAt).getTime() - new Date(right.fetchedAt).getTime())
    .forEach((snapshot) => {
      const date = new Date(snapshot.fetchedAt);
      if (Number.isNaN(date.getTime())) return;
      const day = date.toISOString().slice(0, 10);
      byDay.set(day, { day, price: Number(snapshot.price), currency: snapshot.currency, fetchedAt: snapshot.fetchedAt });
    });

  return [...byDay.values()]
    .filter((point) => Number.isFinite(point.price))
    .slice(-limit);
}

function marketSourceLabel(source: string) {
  return source === 'snkrdunk' ? 'SNKRDUNK' : 'Yuyutei';
}

function candidateLabel(candidate: MarketCandidate) {
  if (candidate.source === 'snkrdunk') return candidate.conditionName ? `${candidate.conditionName} condition` : 'Ask';
  return candidate.mode === 'sell' ? 'Sale' : 'Buylist';
}

function parseSnkrdunkAutofill(candidate: MarketCandidate) {
  if (candidate.source !== 'snkrdunk') return {};
  const title = candidate.name || candidate.displayName;
  const cardNumber = candidate.cardNumber || title.match(/\[([A-Z]{1,4}\d{1,2}-\d{3}|P-\d{3}|EB\d{2}-\d{3}|ST\d{2}-\d{3})\]/i)?.[1]?.toUpperCase() || '';
  const beforeCardNumber = title.split('[')[0]?.trim() || title;
  const rarityCode = beforeCardNumber.match(/\b(SEC|SR|R|UC|C|L|P|SP)(?:-[A-Z]+)?$/i)?.[0]?.toUpperCase() || candidate.rarity || '';
  const rarity = normalizeSnkrdunkRarity(rarityCode || candidate.rarity || '');
  const itemName = beforeCardNumber
    .replace(/\s+\b(SEC|SR|R|UC|C|L|P|SP)(?:-[A-Z]+)?$/i, '')
    .trim();
  return {
    itemName,
    cardNumber,
    setName: findSetNameForCard(cardNumber, title),
    rarity,
    art: inferSnkrdunkArt(title, rarityCode),
    imageUrl: candidate.imageUrl || ''
  };
}

function normalizeSnkrdunkRarity(value: string): CardRarity | null {
  const rarity = value.split('-')[0]?.toUpperCase();
  if (rarity === 'SEC') return 'SEC';
  if (rarity === 'SR') return 'SR';
  if (rarity === 'R') return 'R';
  if (rarity === 'UC') return 'UC';
  if (rarity === 'C') return 'C';
  if (rarity === 'L') return 'Leader';
  if (rarity === 'P') return 'Promo';
  return null;
}

function inferSnkrdunkArt(title: string, rarityCode: string): CardArt {
  const normalizedTitle = title.toLowerCase();
  const normalizedCode = rarityCode.toUpperCase();
  if (normalizedTitle.includes('manga')) return 'Manga';
  if (normalizedCode.includes('-P')) return 'Parallel';
  if (normalizedCode.includes('-SP')) return 'SP';
  return 'Base';
}

function findSetNameForCard(cardNumber: string, title: string) {
  const packName = extractSnkrdunkPackName(title);
  if (packName) {
    const normalizedPackName = normalizeSetLookup(packName);
    const fromPack = ONE_PIECE_SET_NAMES.find((setName) => normalizeSetLookup(setName).includes(normalizedPackName));
    if (fromPack) return fromPack;
  }

  const code = cardNumber.match(/^([A-Z]+)(\d{2})-/i);
  if (code) {
    const prefix = `${code[1].toUpperCase()}-${code[2]}`;
    const exact = ONE_PIECE_SET_NAMES.find((setName) => setName.toUpperCase().startsWith(`[${prefix}]`) || setName.toUpperCase().startsWith(`${prefix}:`));
    if (exact) return exact;
  }

  return '';
}

function extractSnkrdunkPackName(title: string) {
  return title
    .match(/\((?:Booster Pack|Extra Booster|Starter Deck)?\s*["“]?([^"”)]+)["”]?\)/i)?.[1]
    ?.trim() || '';
}

function normalizeSetLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^[a-z]{2}-\d{2}:\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildDuplicateReview(input: InventoryInput, items: InventoryItem[], currentItemId?: string): DuplicateReview {
  const cardNumber = normalizeCardCode(input.cardNumber || '');
  const enteredItemNumber = input.autoGenerateItemNumber ? '' : normalizeCardCode(input.itemNumber || '');
  const candidates = items.filter((item) => item.id !== currentItemId);
  const itemNumberMatches = enteredItemNumber
    ? candidates.filter((item) => normalizeCardCode(item.itemNumber) === enteredItemNumber)
    : [];

  if (!cardNumber || input.itemType !== 'single_card') {
    return { cardNumber, exactMatches: [], similarCards: [], itemNumberMatches };
  }

  const sameCardNumber = candidates
    .filter((item) => item.itemType === 'single_card' && normalizeCardCode(item.cardNumber || '') === cardNumber)
    .sort((left, right) => Number(isExactCardMatch(right, input)) - Number(isExactCardMatch(left, input)));
  const exactMatches = sameCardNumber.filter((item) => isExactCardMatch(item, input));
  const exactIds = new Set(exactMatches.map((item) => item.id));
  const similarCards = sameCardNumber.filter((item) => !exactIds.has(item.id));

  return { cardNumber, exactMatches, similarCards, itemNumberMatches };
}

function isExactCardMatch(item: InventoryItem, input: InventoryInput) {
  if (normalizeCardCode(item.cardNumber || '') !== normalizeCardCode(input.cardNumber || '')) return false;
  if (normalizeText(item.setName || '') !== normalizeText(input.setName || '')) return false;
  if (normalizeText(item.rarity || '') !== normalizeText(input.rarity || '')) return false;
  if (normalizeText(item.art || '') !== normalizeText(input.art || '')) return false;
  if (normalizeText(item.language || '') !== normalizeText(input.language || '')) return false;
  if (normalizeText(item.category || '') !== normalizeText(input.category || '')) return false;
  if (normalizeText(item.condition || '') !== normalizeText(input.condition || '')) return false;
  if (normalizeText(input.condition || '') === 'GRADED') {
    if (normalizeText(item.gradeCompany || '') !== normalizeText(input.gradeCompany || '')) return false;
    if (normalizeText(item.grade || '') !== normalizeText(input.grade || '')) return false;
    if (normalizeText(item.certNumber || '') !== normalizeText(input.certNumber || '')) return false;
  }
  return true;
}

function normalizeCardCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeText(value: string) {
  return value.trim().toUpperCase();
}

function latestComparableMarketByItem(snapshots: MarketPriceSnapshot[], settings?: { currency?: string; currencySymbol?: string }) {
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

function comparableMarketCurrency(settings?: { currency?: string; currencySymbol?: string }) {
  if (settings?.currency?.toUpperCase() === 'SGD' || settings?.currencySymbol === 'S$') return 'SGD';
  return settings?.currency?.toUpperCase() || 'SGD';
}

function formatMarketCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Market checked';
  return `Checked ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

async function invalidateMarket(queryClient: ReturnType<typeof useQueryClient>, orgId: string) {
  await queryClient.invalidateQueries({ queryKey: ['market-mappings', orgId] });
  await queryClient.invalidateQueries({ queryKey: ['market-snapshots', orgId] });
}

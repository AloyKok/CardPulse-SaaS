import type { User } from '@supabase/supabase-js';
import { isLocalDemoMode, supabase } from './client';
import {
  mapBuyback,
  mapInventoryItem,
  mapMarketMapping,
  mapMarketPriceSnapshot,
  mapMembership,
  mapOrganization,
  mapSettings,
  mapShowEvent,
  mapShowExpense,
  mapTransaction
} from './mappers';
import type {
  CardArt,
  CardCategory,
  CardLanguage,
  CardRarity,
  InventoryFilters,
  InventoryItem,
  InventoryItemType,
  InventoryStatus,
  MarketCandidate,
  MarketMapping,
  MarketPriceSnapshot,
  MemberRole,
  PaymentMethod,
  BuybackProcessingStatus,
  QueuedSale,
  SealedProductType,
  SnkrdunkMarketCandidate,
  Settings,
  ShowEvent,
  ShowExpense,
  YuyuteiMarketCandidate
} from '../../types/domain';
import type { Database } from '../../types/database';
import {
  completeLocalSale,
  createLocalInvite,
  deleteLocalShowExpense,
  deleteLocalInventoryItem,
  deleteLocalBuyback,
  getLocalDatabase,
  getLocalBuybacks,
  getLocalEvents,
  getLocalInventory,
  getLocalMemberships,
  getLocalSettings,
  getLocalShowExpenses,
  getLocalTransactions,
  generateLocalItemNumber,
  LOCAL_USER_ID,
  removeLocalMembership,
  saveLocalBuyback,
  saveLocalEvent,
  saveLocalShowExpense,
  saveLocalInventoryItem,
  saveLocalSettings,
  unvoidLocalBuyback,
  unvoidLocalSale,
  updateLocalBuyback,
  updateLocalBuybackProcessingStatus,
  updateLocalBuybackSource,
  updateLocalTransactionSaleSource,
  voidLocalBuyback,
  voidLocalSale
} from '../local/localDatabase';

type InventoryRow = Database['public']['Tables']['inventory_items']['Row'];

export interface InventoryInput {
  itemNumber?: string;
  autoGenerateItemNumber?: boolean;
  itemType: InventoryItemType;
  productCategory?: SealedProductType | null;
  itemName: string;
  cardNumber?: string | null;
  setName?: string | null;
  rarity?: CardRarity | null;
  art?: CardArt | null;
  language: CardLanguage;
  category?: CardCategory | null;
  condition: string;
  gradeCompany?: string | null;
  grade?: string | null;
  certNumber?: string | null;
  quantity: number;
  costBasis?: number | null;
  floorPrice?: number | null;
  askingPrice: number;
  marketPrice?: number | null;
  location?: string | null;
  acquisitionSource?: string | null;
  acquisitionDate?: string | null;
  listedOnline?: boolean;
  tags?: string[] | null;
  imageUrl?: string | null;
  notes?: string | null;
  status?: InventoryItem['status'];
}

export interface BuybackInput {
  eventId?: string | null;
  sellerName?: string | null;
  itemSummary: string;
  itemCount: number;
  totalPaid: number;
  paymentMethod: PaymentMethod;
  notes?: string | null;
}

export interface ShowExpenseInput {
  eventId: string;
  category: ShowExpense['category'];
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string | null;
}

const accountEmails: Record<string, string> = {
  aloykok: 'aloykok@login.cardpulse.app',
  tedlee: 'tedlee@login.cardpulse.app'
};

export async function signIn(username: string, password: string) {
  if (isLocalDemoMode) return;
  const email = accountEmails[username.trim().toLowerCase()];
  if (!email) throw new Error('Invalid username or password');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Invalid username or password');
}

export async function signOut() {
  if (isLocalDemoMode) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSessionUser(): Promise<User | null> {
  if (isLocalDemoMode) return { id: LOCAL_USER_ID } as User;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function listMemberships() {
  if (isLocalDemoMode) return getLocalMemberships();
  const { data, error } = await supabase
    .from('memberships')
    .select('*, organizations(*)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data || []) as unknown as Array<Database['public']['Tables']['memberships']['Row'] & { organizations?: Database['public']['Tables']['organizations']['Row'] | null }>).map(mapMembership);
}

export async function listMyMemberships() {
  if (isLocalDemoMode) {
    const user = await getSessionUser();
    return getLocalMemberships().filter((membership) => !user || membership.userId === user.id);
  }
  const user = await getSessionUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('memberships')
    .select('*, organizations(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data || []) as unknown as Array<Database['public']['Tables']['memberships']['Row'] & { organizations?: Database['public']['Tables']['organizations']['Row'] | null }>).map(mapMembership);
}

export async function listOrgMemberships(orgId: string) {
  if (isLocalDemoMode) return getLocalMemberships().filter((membership) => membership.orgId === orgId);
  const { data, error } = await supabase
    .from('memberships')
    .select('*, organizations(*)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data || []) as unknown as Array<Database['public']['Tables']['memberships']['Row'] & { organizations?: Database['public']['Tables']['organizations']['Row'] | null }>).map(mapMembership);
}

export async function bootstrapOwnerOrg(name: string) {
  if (isLocalDemoMode) return getLocalDatabase().organization;
  const { data, error } = await supabase.rpc('bootstrap_owner_org', { p_org_name: name });
  if (error) throw error;
  return mapOrganization(data);
}

export async function acceptInvite(token: string) {
  if (isLocalDemoMode) {
    const membership = getLocalMemberships()[0];
    if (!membership) throw new Error('Local demo membership not found');
    return membership;
  }
  const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
  if (error) throw error;
  return mapMembership(data);
}

const INVENTORY_SELECT_BASE = [
  'id',
  'org_id',
  'item_number',
  'item_type',
  'product_category',
  'item_name',
  'card_number',
  'set_name',
  'rarity',
  'art',
  'language',
  'category',
  'condition',
  'grade_company',
  'grade',
  'cert_number',
  'quantity',
  'cost_basis',
  'floor_price',
  'asking_price',
  'market_price',
  'market_price_updated_at',
  'location',
  'acquisition_source',
  'acquisition_date',
  'listed_online',
  'tags',
  'notes',
  'status',
  'created_by',
  'created_at',
  'updated_at'
].join(',');

const INVENTORY_SELECT_FULL = `${INVENTORY_SELECT_BASE},image_url`;

export async function listInventory(orgId: string, filters?: Partial<InventoryFilters>, options?: { includeImages?: boolean }) {
  if (isLocalDemoMode) return getLocalInventory(filters);
  let query = supabase
    .from('inventory_items')
    .select(options?.includeImages ? INVENTORY_SELECT_FULL : INVENTORY_SELECT_BASE)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  query = applyInventoryFilters(query, filters);

  const { data, error } = await query;
  if (error) throw error;

  return mapInventoryRows(data);
}

export async function listInventoryPage(
  orgId: string,
  filters?: Partial<InventoryFilters>,
  options: { includeImages?: boolean; page: number; pageSize: number } = { page: 0, pageSize: 20 }
) {
  if (isLocalDemoMode) {
    const rows = getLocalInventory(filters);
    const from = options.page * options.pageSize;
    return { items: rows.slice(from, from + options.pageSize), total: rows.length };
  }

  const from = Math.max(0, options.page) * options.pageSize;
  const to = from + options.pageSize - 1;
  let query = supabase
    .from('inventory_items')
    .select(options.includeImages ? INVENTORY_SELECT_FULL : INVENTORY_SELECT_BASE, { count: 'exact' })
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  query = applyInventoryFilters(query, filters).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: mapInventoryRows(data), total: count || 0 };
}

function applyInventoryFilters<T extends {
  eq: (column: string, value: string | number | boolean) => T;
  ilike: (column: string, pattern: string) => T;
  lte: (column: string, value: number) => T;
  gt: (column: string, value: number) => T;
  or: (filters: string) => T;
}>(
  query: T,
  filters?: Partial<InventoryFilters>
) {
  if (filters?.status) query = query.eq('status', filters.status as InventoryStatus);
  if (filters?.itemType) query = query.eq('item_type', filters.itemType as InventoryItemType);
  if (filters?.setName) query = query.ilike('set_name', `%${filters.setName}%`);
  if (filters?.rarity) query = query.eq('rarity', filters.rarity as CardRarity);
  if (filters?.art) query = query.eq('art', filters.art as CardArt);
  if (filters?.category) query = query.eq('category', filters.category as CardCategory);
  if (filters?.language) query = query.eq('language', filters.language as CardLanguage);
  if (filters?.condition) query = query.eq('condition', filters.condition);
  if (filters?.lowStockOnly) query = query.lte('quantity', 2).gt('quantity', 0);

  const search = filters?.search?.trim();
  if (search) {
    const term = escapeInventorySearchTerm(search);
    query = query.or([
      `item_name.ilike.%${term}%`,
      `set_name.ilike.%${term}%`,
      `card_number.ilike.%${term}%`,
      `item_number.ilike.%${term}%`,
      `rarity.ilike.%${term}%`,
      `condition.ilike.%${term}%`
    ].join(','));
  }

  return query;
}

function mapInventoryRows(data: unknown) {
  return ((data || []) as Array<Record<string, unknown>>)
    .map((row) => mapInventoryItem({ image_url: null, ...row } as Parameters<typeof mapInventoryItem>[0]));
}

function escapeInventorySearchTerm(value: string) {
  return value.replace(/[%_,()]/g, '').trim();
}

export async function getInventoryItem(orgId: string, idOrItemNumber: string) {
  if (isLocalDemoMode) {
    const normalized = idOrItemNumber.trim().toLowerCase();
    return getLocalInventory().find((item) => item.id.toLowerCase() === normalized || item.itemNumber.toLowerCase() === normalized) || null;
  }
  const normalized = idOrItemNumber.trim();
  const byId = /^[0-9a-f-]{36}$/i.test(normalized);
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('org_id', orgId)
    .or(byId ? `id.eq.${normalized},item_number.ilike.${normalized}` : `item_number.ilike.${normalized}`)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInventoryItem(data) : null;
}

export async function saveInventoryItem(orgId: string, userId: string, input: InventoryInput, itemId?: string) {
  if (isLocalDemoMode) return saveLocalInventoryItem(input, itemId);
  const clean = normalizeInventoryInput(input);

  if (itemId) {
    const itemNumber = clean.autoGenerateItemNumber
      ? clean.itemNumber || await generateInventoryItemNumber(orgId, clean.itemType, itemNumberReference(clean), clean.condition)
      : clean.itemNumber;
    await assertUniqueItemNumber(orgId, itemNumber, itemId);
    const { data, error } = await supabase
      .from('inventory_items')
      .update({
        item_number: itemNumber,
        item_type: clean.itemType,
        product_category: clean.productCategory,
        item_name: clean.itemName,
        card_number: clean.cardNumber,
        set_name: clean.setName,
        rarity: clean.rarity,
        art: clean.art,
        language: clean.language,
        category: clean.category,
        condition: clean.condition,
        grade_company: clean.gradeCompany,
        grade: clean.grade,
        cert_number: clean.certNumber,
        quantity: clean.quantity,
        cost_basis: clean.costBasis,
        floor_price: clean.floorPrice,
        asking_price: clean.askingPrice,
        market_price: clean.marketPrice,
        location: clean.location,
        acquisition_source: clean.acquisitionSource,
        acquisition_date: clean.acquisitionDate,
        listed_online: clean.listedOnline,
        tags: clean.tags,
        image_url: clean.imageUrl,
        notes: clean.notes,
        status: clean.status
      })
      .eq('org_id', orgId)
      .eq('id', itemId)
      .select('*')
      .single();
    if (error) throw error;
    return mapInventoryItem(data);
  }

  const existing = clean.autoGenerateItemNumber ? await findExactInventoryLine(orgId, clean) : null;
  if (existing) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update({
        quantity: existing.quantity + clean.quantity,
        status: existing.quantity + clean.quantity > 0 ? 'in_stock' : clean.status,
        asking_price: clean.askingPrice,
        cost_basis: clean.costBasis,
        floor_price: clean.floorPrice,
        market_price: clean.marketPrice,
        location: clean.location,
        acquisition_source: clean.acquisitionSource,
        acquisition_date: clean.acquisitionDate,
        listed_online: clean.listedOnline,
        tags: clean.tags,
        notes: clean.notes || existing.notes
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return mapInventoryItem(data);
  }

  const itemNumber = clean.autoGenerateItemNumber
    ? clean.itemNumber || await generateInventoryItemNumber(orgId, clean.itemType, itemNumberReference(clean), clean.condition)
    : clean.itemNumber;
  await assertUniqueItemNumber(orgId, itemNumber);

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      org_id: orgId,
      item_number: itemNumber,
      item_type: clean.itemType,
      product_category: clean.productCategory,
      item_name: clean.itemName,
      card_number: clean.cardNumber,
      set_name: clean.setName,
      rarity: clean.rarity,
      art: clean.art,
      language: clean.language,
      category: clean.category,
      condition: clean.condition,
      grade_company: clean.gradeCompany,
      grade: clean.grade,
      cert_number: clean.certNumber,
      quantity: clean.quantity,
      cost_basis: clean.costBasis,
      floor_price: clean.floorPrice,
      asking_price: clean.askingPrice,
      market_price: clean.marketPrice,
      location: clean.location,
      acquisition_source: clean.acquisitionSource,
      acquisition_date: clean.acquisitionDate,
      listed_online: clean.listedOnline,
      tags: clean.tags,
      image_url: clean.imageUrl,
      notes: clean.notes,
      status: clean.status,
      created_by: userId
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapInventoryItem(data);
}

export async function deleteInventoryItem(orgId: string, id: string) {
  if (isLocalDemoMode) {
    deleteLocalInventoryItem(id);
    return;
  }
  const { error } = await supabase.from('inventory_items').delete().eq('org_id', orgId).eq('id', id);
  if (error) throw error;
}

export async function completeSale(payload: Omit<QueuedSale, 'id' | 'createdAt' | 'status' | 'lastError'>) {
  if (isLocalDemoMode) return completeLocalSale(payload);
  const { data, error } = await supabase.rpc('complete_sale', {
    p_org_id: payload.orgId,
    p_cart: payload.cart,
    p_discount: payload.discount,
    p_payment_method: payload.paymentMethod,
    p_event_id: payload.eventId || null,
    p_client_ref: payload.clientRef,
    p_notes: payload.notes || null
  });
  if (error) throw error;
  return mapTransaction(data);
}

export async function listTransactions(orgId: string, limit = 100) {
  if (isLocalDemoMode) return getLocalTransactions(limit);
  const pageSize = Math.min(1000, limit);
  const rows: Database['public']['Tables']['transactions']['Row'][] = [];
  for (let offset = 0; offset < limit; offset += pageSize) {
    const requested = Math.min(pageSize, limit - offset);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + requested - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < requested) break;
  }
  return rows.map(mapTransaction);
}

export async function listBuybacks(orgId: string, limit = 1000) {
  if (isLocalDemoMode) return getLocalBuybacks(limit);
  const pageSize = Math.min(1000, limit);
  const rows: Database['public']['Tables']['buybacks']['Row'][] = [];
  for (let offset = 0; offset < limit; offset += pageSize) {
    const requested = Math.min(pageSize, limit - offset);
    const { data, error } = await supabase
      .from('buybacks')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + requested - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < requested) break;
  }
  return rows.map(mapBuyback);
}

export async function createBuyback(orgId: string, userId: string, input: BuybackInput) {
  const clean = normalizeBuybackInput(input);
  if (isLocalDemoMode) return saveLocalBuyback(clean);
  const { data, error } = await supabase
    .from('buybacks')
    .insert({
      org_id: orgId,
      created_by: userId,
      event_id: clean.eventId,
      seller_name: clean.sellerName,
      item_summary: clean.itemSummary,
      item_count: clean.itemCount,
      total_paid: clean.totalPaid,
      payment_method: clean.paymentMethod,
      notes: clean.notes
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapBuyback(data);
}

export async function updateBuyback(orgId: string, buybackId: string, input: BuybackInput) {
  const clean = normalizeBuybackInput(input);
  if (isLocalDemoMode) return updateLocalBuyback(buybackId, clean);
  const { data, error } = await supabase
    .from('buybacks')
    .update({
      event_id: clean.eventId,
      seller_name: clean.sellerName,
      item_summary: clean.itemSummary,
      item_count: clean.itemCount,
      total_paid: clean.totalPaid,
      payment_method: clean.paymentMethod,
      notes: clean.notes
    })
    .eq('org_id', orgId)
    .eq('id', buybackId)
    .select('*')
    .single();
  if (error) throw error;
  return mapBuyback(data);
}

export async function deleteBuyback(orgId: string, buybackId: string) {
  if (isLocalDemoMode) {
    deleteLocalBuyback(buybackId);
    return;
  }
  const { error } = await supabase
    .from('buybacks')
    .delete()
    .eq('org_id', orgId)
    .eq('id', buybackId);
  if (error) throw error;
}

export async function updateBuybackSource(orgId: string, buybackId: string, eventId: string | null) {
  if (isLocalDemoMode) return updateLocalBuybackSource(buybackId, eventId);
  const { data, error } = await supabase
    .from('buybacks')
    .update({ event_id: eventId })
    .eq('org_id', orgId)
    .eq('id', buybackId)
    .select('*')
    .single();
  if (error) throw error;
  return mapBuyback(data);
}

export async function updateBuybackProcessingStatus(orgId: string, buybackId: string, processingStatus: BuybackProcessingStatus) {
  if (isLocalDemoMode) return updateLocalBuybackProcessingStatus(buybackId, processingStatus);
  const { data, error } = await supabase
    .from('buybacks')
    .update({
      processing_status: processingStatus,
      processed_at: processingStatus === 'processed' ? new Date().toISOString() : null
    })
    .eq('org_id', orgId)
    .eq('id', buybackId)
    .select('*')
    .single();
  if (error) throw error;
  return mapBuyback(data);
}

export async function voidBuyback(orgId: string, buybackId: string) {
  if (isLocalDemoMode) return voidLocalBuyback(buybackId);
  const user = await getSessionUser();
  const { data, error } = await supabase
    .from('buybacks')
    .update({ status: 'voided', voided_at: new Date().toISOString(), voided_by: user?.id || null })
    .eq('org_id', orgId)
    .eq('id', buybackId)
    .select('*')
    .single();
  if (error) throw error;
  return mapBuyback(data);
}

export async function unvoidBuyback(orgId: string, buybackId: string) {
  if (isLocalDemoMode) return unvoidLocalBuyback(buybackId);
  const { data, error } = await supabase
    .from('buybacks')
    .update({ status: 'completed', voided_at: null, voided_by: null })
    .eq('org_id', orgId)
    .eq('id', buybackId)
    .select('*')
    .single();
  if (error) throw error;
  return mapBuyback(data);
}

export async function voidSale(orgId: string, transactionId: string) {
  if (isLocalDemoMode) return voidLocalSale(transactionId);
  const { data, error } = await supabase.rpc('void_sale', {
    p_org_id: orgId,
    p_transaction_id: transactionId
  });
  if (error) throw error;
  return mapTransaction(data);
}

export async function unvoidSale(orgId: string, transactionId: string) {
  if (isLocalDemoMode) return unvoidLocalSale(transactionId);
  const { data, error } = await supabase.rpc('unvoid_sale', {
    p_org_id: orgId,
    p_transaction_id: transactionId
  });
  if (error) throw error;
  return mapTransaction(data);
}

export async function updateTransactionSaleSource(orgId: string, transactionId: string, eventId: string | null) {
  if (isLocalDemoMode) return updateLocalTransactionSaleSource(transactionId, eventId);
  const { data, error } = await supabase.rpc('update_transaction_sale_source', {
    p_org_id: orgId,
    p_transaction_id: transactionId,
    p_event_id: eventId
  });
  if (error) throw error;
  return mapTransaction(data);
}

export async function listEvents(orgId: string) {
  if (isLocalDemoMode) return getLocalEvents();
  const { data, error } = await supabase.from('show_events').select('*').eq('org_id', orgId).order('start_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapShowEvent);
}

export async function saveEvent(orgId: string, event: Pick<ShowEvent, 'name' | 'startDate' | 'endDate' | 'location'>, id?: string) {
  if (isLocalDemoMode) return saveLocalEvent(event, id);
  if (event.endDate < event.startDate) throw new Error('End date cannot be before start date');
  if (id) {
    const { data, error } = await supabase
      .from('show_events')
      .update({
        name: event.name,
        start_date: event.startDate,
        end_date: event.endDate,
        location: event.location || null
      })
      .eq('org_id', orgId)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapShowEvent(data);
  }

  const { data, error } = await supabase
    .from('show_events')
    .insert({
      org_id: orgId,
      name: event.name,
      start_date: event.startDate,
      end_date: event.endDate,
      location: event.location || null
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapShowEvent(data);
}

export async function listShowExpenses(orgId: string, eventId?: string) {
  if (isLocalDemoMode) return getLocalShowExpenses(eventId);
  let query = supabase.from('show_expenses').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
  if (eventId) query = query.eq('event_id', eventId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapShowExpense);
}

export async function createShowExpense(orgId: string, userId: string, input: ShowExpenseInput) {
  const clean = normalizeShowExpenseInput(input);
  if (isLocalDemoMode) return saveLocalShowExpense(clean);
  const { data, error } = await supabase
    .from('show_expenses')
    .insert({
      org_id: orgId,
      event_id: clean.eventId,
      created_by: userId,
      category: clean.category,
      description: clean.description,
      amount: clean.amount,
      payment_method: clean.paymentMethod,
      notes: clean.notes
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapShowExpense(data);
}

export async function deleteShowExpense(orgId: string, expenseId: string) {
  if (isLocalDemoMode) {
    deleteLocalShowExpense(expenseId);
    return;
  }
  const { error } = await supabase
    .from('show_expenses')
    .delete()
    .eq('org_id', orgId)
    .eq('id', expenseId);
  if (error) throw error;
}

export async function getSettings(orgId: string): Promise<Settings> {
  if (isLocalDemoMode) return getLocalSettings();
  const { data, error } = await supabase.from('settings').select('*').eq('org_id', orgId).single();
  if (error) throw error;
  return mapSettings(data);
}

export async function updateSettings(orgId: string, settings: Partial<Settings>) {
  if (isLocalDemoMode) return saveLocalSettings(settings);
  const { data, error } = await supabase
    .from('settings')
    .update({
      currency: settings.currency,
      currency_symbol: settings.currencySymbol,
      default_condition: settings.defaultCondition,
      default_language: settings.defaultLanguage,
      active_event_id: settings.activeEventId || null,
      pricing_api_key: settings.pricingApiKey || null,
      label_sheet_preset: settings.labelSheetPreset,
      aging_threshold_days: settings.agingThresholdDays
    })
    .eq('org_id', orgId)
    .select('*')
    .single();
  if (error) throw error;
  return mapSettings(data);
}

export async function inviteAdmin(orgId: string, userId: string, email: string, role: MemberRole = 'admin') {
  if (isLocalDemoMode) return createLocalInvite(email, role);
  const { data, error } = await supabase
    .from('invitations')
    .insert({ org_id: orgId, email: email.trim().toLowerCase(), role, created_by: userId })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function removeMembership(orgId: string, membershipId: string) {
  if (isLocalDemoMode) {
    removeLocalMembership(membershipId);
    return;
  }
  const { error } = await supabase.from('memberships').delete().eq('org_id', orgId).eq('id', membershipId);
  if (error) throw error;
}

export async function listMarketMappings(orgId: string) {
  if (isLocalDemoMode) return getLocalMarketMappings();
  const { data, error } = await supabase
    .from('market_mappings')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapMarketMapping);
}

export async function listMarketPriceSnapshots(orgId: string, limit = 1000) {
  if (isLocalDemoMode) return getLocalMarketSnapshots();
  const { data, error } = await supabase
    .from('market_price_snapshots')
    .select('*')
    .eq('org_id', orgId)
    .order('fetched_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapMarketPriceSnapshot);
}

export async function searchYuyuteiMarket(item: InventoryItem) {
  const cardNumber = item.cardNumber?.trim();
  if (!cardNumber) throw new Error('Yuyutei search needs a card number');
  return searchYuyuteiMarketByCardNumber(cardNumber);
}

export async function searchYuyuteiMarketByCardNumber(cardNumber: string) {
  const cleanCardNumber = cardNumber.trim();
  if (!cleanCardNumber) throw new Error('Yuyutei search needs a card number');
  const data = await invokeYuyuteiMarket<{ candidates: YuyuteiMarketCandidate[] }>({ action: 'search', cardNumber: cleanCardNumber });
  return data.candidates || [];
}

export async function refreshYuyuteiMarket(sourceUrl: string) {
  const data = await invokeYuyuteiMarket<{ result: YuyuteiMarketCandidate }>({ action: 'refresh', sourceUrl });
  if (!data.result) throw new Error('Yuyutei did not return a price');
  return data.result;
}

export async function searchSnkrdunkMarketByCardNumber(cardNumber: string) {
  const cleanCardNumber = cardNumber.trim();
  if (!cleanCardNumber) throw new Error('SNKRDUNK search needs a card number');
  const data = await invokeSnkrdunkMarket<{ candidates: SnkrdunkMarketCandidate[] }>({ action: 'search', cardNumber: cleanCardNumber });
  return data.candidates || [];
}

export async function listSnkrdunkMarketCandidatesFromUrl(sourceUrl: string) {
  const data = await invokeSnkrdunkMarket<{ candidates: SnkrdunkMarketCandidate[] }>({ action: 'conditions', sourceUrl });
  return data.candidates || [];
}

export async function refreshSnkrdunkMarket(sourceUrl: string, conditionName = 'A') {
  const data = await invokeSnkrdunkMarket<{ result: SnkrdunkMarketCandidate }>({ action: 'refresh', sourceUrl, conditionName });
  if (!data.result) throw new Error('SNKRDUNK did not return a price');
  return data.result;
}

export async function refreshMarketCandidate(sourceUrl: string) {
  if (sourceUrl.includes('snkrdunk.com')) return refreshSnkrdunkMarket(sourceUrl);
  return refreshYuyuteiMarket(sourceUrl);
}

export async function listMarketCandidatesFromUrl(sourceUrl: string) {
  if (sourceUrl.includes('snkrdunk.com')) return listSnkrdunkMarketCandidatesFromUrl(sourceUrl);
  return [await refreshYuyuteiMarket(sourceUrl)];
}

export async function refreshMarketMapping(mapping: Pick<MarketMapping, 'source' | 'sourceUrl' | 'metadata'>) {
  if (mapping.source === 'snkrdunk') {
    const conditionName = typeof mapping.metadata?.conditionName === 'string' ? mapping.metadata.conditionName : 'A';
    return refreshSnkrdunkMarket(mapping.sourceUrl, conditionName);
  }
  return refreshYuyuteiMarket(mapping.sourceUrl);
}

export async function saveMarketMapping(orgId: string, inventoryItemId: string, candidate: MarketCandidate) {
  if (isLocalDemoMode) return saveLocalMarketMapping(orgId, inventoryItemId, candidate);
  const { data, error } = await supabase
    .from('market_mappings')
    .upsert({
      org_id: orgId,
      inventory_item_id: inventoryItemId,
      source: candidate.source,
      source_url: candidate.sourceUrl,
      external_id: candidate.externalId || null,
      display_name: candidate.displayName,
      metadata: candidate as unknown as Database['public']['Tables']['market_mappings']['Insert']['metadata']
    }, { onConflict: 'org_id,inventory_item_id,source' })
    .select('*')
    .single();
  if (error) throw error;
  return mapMarketMapping(data);
}

export async function saveMarketSnapshot(orgId: string, inventoryItemId: string, candidate: MarketCandidate) {
  if (isLocalDemoMode) return saveLocalMarketSnapshot(orgId, inventoryItemId, candidate);
  const { data, error } = await supabase
    .from('market_price_snapshots')
    .insert({
      org_id: orgId,
      inventory_item_id: inventoryItemId,
      source: candidate.source,
      source_url: candidate.sourceUrl,
      price: candidate.price,
      currency: candidate.currency,
      availability: candidate.availability || null,
      raw: candidate as unknown as Database['public']['Tables']['market_price_snapshots']['Insert']['raw']
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapMarketPriceSnapshot(data);
}

async function findExactInventoryLine(orgId: string, input: InventoryInput) {
  let query = supabase
    .from('inventory_items')
    .select('*')
    .eq('org_id', orgId)
    .eq('item_type', input.itemType)
    .eq('item_name', input.itemName.trim())
    .eq('language', input.language)
    .eq('condition', input.condition.trim());

  query = input.productCategory ? query.eq('product_category', input.productCategory) : query.is('product_category', null);
  query = input.cardNumber ? query.eq('card_number', input.cardNumber.trim()) : query.is('card_number', null);
  query = input.setName ? query.eq('set_name', input.setName.trim()) : query.is('set_name', null);
  query = input.rarity ? query.eq('rarity', input.rarity) : query.is('rarity', null);
  query = input.art ? query.eq('art', input.art) : query.is('art', null);
  query = input.category ? query.eq('category', input.category) : query.is('category', null);
  query = input.gradeCompany ? query.eq('grade_company', input.gradeCompany) : query.is('grade_company', null);
  query = input.grade ? query.eq('grade', input.grade) : query.is('grade', null);
  query = input.certNumber ? query.eq('cert_number', input.certNumber) : query.is('cert_number', null);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data ? mapInventoryItem(data as InventoryRow) : null;
}

function normalizeInventoryInput(input: InventoryInput) {
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const isCard = input.itemType === 'single_card';
  const isSealed = input.itemType === 'sealed_product';
  if (!input.itemName.trim()) throw new Error('Item name is required');
  if (isCard && (!input.cardNumber?.trim() || !input.setName?.trim())) throw new Error('Card number and set name are required');
  if (isSealed && !input.productCategory) throw new Error('Sealed product type is required');
  return {
    itemNumber: input.itemNumber?.trim().toUpperCase() || '',
    autoGenerateItemNumber: input.autoGenerateItemNumber ?? true,
    itemType: input.itemType,
    productCategory: isSealed ? input.productCategory || null : null,
    itemName: input.itemName.trim(),
    cardNumber: isCard ? input.cardNumber?.trim().toUpperCase() || null : null,
    setName: isCard ? input.setName?.trim() || null : null,
    rarity: isCard ? input.rarity || 'C' : null,
    art: isCard ? input.art || 'Base' : null,
    language: input.language,
    category: isCard ? input.category || 'Character' : null,
    condition: input.condition.trim() || (isSealed ? 'SEALED' : input.itemType === 'mystery_pack' ? 'NEW' : 'MINT'),
    gradeCompany: isCard && input.condition === 'GRADED' ? input.gradeCompany?.trim() || null : null,
    grade: isCard && input.condition === 'GRADED' ? input.grade?.trim() || null : null,
    certNumber: isCard && input.condition === 'GRADED' ? input.certNumber?.trim() || null : null,
    quantity,
    costBasis: input.costBasis === undefined || input.costBasis === null ? null : Math.max(0, Number(input.costBasis)),
    floorPrice: input.floorPrice === undefined || input.floorPrice === null ? null : Math.max(0, Number(input.floorPrice)),
    askingPrice: Math.max(0, Number(input.askingPrice) || 0),
    marketPrice: input.marketPrice === undefined || input.marketPrice === null ? null : Math.max(0, Number(input.marketPrice)),
    location: input.location?.trim() || null,
    acquisitionSource: input.acquisitionSource?.trim() || null,
    acquisitionDate: input.acquisitionDate || null,
    listedOnline: Boolean(input.listedOnline),
    tags: (input.tags || []).map((tag) => tag.trim()).filter(Boolean),
    imageUrl: input.imageUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    status: input.status || (quantity > 0 ? 'in_stock' : 'sold_out')
  };
}

function normalizeBuybackInput(input: BuybackInput): BuybackInput {
  const itemSummary = input.itemSummary.trim();
  if (!itemSummary) throw new Error('Item summary is required');
  const totalPaid = Math.max(0, Number(input.totalPaid) || 0);
  if (totalPaid <= 0) throw new Error('Total paid must be more than 0');
  return {
    eventId: input.eventId || null,
    sellerName: input.sellerName?.trim() || null,
    itemSummary,
    itemCount: Math.max(1, Math.floor(Number(input.itemCount) || 1)),
    totalPaid,
    paymentMethod: input.paymentMethod,
    notes: input.notes?.trim() || null
  };
}

function normalizeShowExpenseInput(input: ShowExpenseInput): ShowExpenseInput {
  const description = input.description.trim();
  if (!description) throw new Error('Description is required');
  const amount = Math.max(0, Number(input.amount) || 0);
  if (amount <= 0) throw new Error('Amount must be more than 0');
  return {
    eventId: input.eventId,
    category: input.category,
    description,
    amount,
    paymentMethod: input.paymentMethod,
    notes: input.notes?.trim() || null
  };
}

export async function generateInventoryItemNumber(
  orgId: string,
  itemType: InventoryItemType,
  reference: string,
  condition: string
) {
  if (isLocalDemoMode) return generateLocalItemNumber(itemType, reference, condition);
  const { data, error } = await supabase.rpc('generate_item_number', {
    p_org_id: orgId,
    p_item_type: itemType,
    p_reference: reference,
    p_condition: condition
  });
  if (error) throw error;
  return data;
}

async function assertUniqueItemNumber(orgId: string, itemNumber: string, excludeId?: string) {
  if (!itemNumber) throw new Error('Item number is required when auto-generation is off');
  let query = supabase
    .from('inventory_items')
    .select('id, item_name')
    .eq('org_id', orgId)
    .ilike('item_number', itemNumber);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (data) throw new Error(`Item number ${itemNumber} is already recorded for ${data.item_name}`);
}

async function invokeYuyuteiMarket<T>(body: { action: 'search'; cardNumber: string } | { action: 'refresh'; sourceUrl: string }) {
  try {
    const response = await fetch(`/api/yuyutei-market?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body)
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload?.error) {
        throw new Error(formatYuyuteiApiError(String(payload.error)));
      }
      return payload as T;
    }
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
    if (payload?.error) {
      throw new Error(formatYuyuteiApiError(String(payload.error)));
    }
    throw new Error(`Yuyutei lookup failed through the app API (${response.status})`);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('Yuyutei lookup failed through the app API');
  }
}

function formatYuyuteiApiError(message: string) {
  if (message.includes('Yuyutei returned 403')) {
    return 'Yuyutei is blocking hosted search from Vercel. Use local dev for automatic lookup and linked-card refresh.';
  }
  return message;
}

async function invokeSnkrdunkMarket<T>(
  body:
    | { action: 'search'; cardNumber: string }
    | { action: 'conditions'; sourceUrl: string }
    | { action: 'refresh'; sourceUrl: string; conditionName?: string }
) {
  try {
    const response = await fetch(`/api/snkrdunk-market?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body)
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload?.error) throw new Error(String(payload.error));
      return payload as T;
    }
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
    if (payload?.error) throw new Error(String(payload.error));
    throw new Error(`SNKRDUNK lookup failed through the app API (${response.status})`);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('SNKRDUNK lookup failed through the app API');
  }
}

function itemNumberReference(input: Pick<InventoryInput, 'itemType' | 'cardNumber' | 'productCategory'>) {
  if (input.itemType === 'single_card') return input.cardNumber || '';
  if (input.itemType === 'sealed_product') return input.productCategory || 'other_sealed';
  return 'pack';
}

const LOCAL_MARKET_MAPPINGS_KEY = 'cardpulse-market-mappings';
const LOCAL_MARKET_SNAPSHOTS_KEY = 'cardpulse-market-snapshots';

function getLocalMarketMappings(): MarketMapping[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_MARKET_MAPPINGS_KEY) || '[]') as MarketMapping[];
  } catch {
    return [];
  }
}

function getLocalMarketSnapshots(): MarketPriceSnapshot[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_MARKET_SNAPSHOTS_KEY) || '[]') as MarketPriceSnapshot[];
  } catch {
    return [];
  }
}

function saveLocalMarketMapping(orgId: string, inventoryItemId: string, candidate: MarketCandidate) {
  const now = new Date().toISOString();
  const rows = getLocalMarketMappings();
  const existingIndex = rows.findIndex((row) => row.orgId === orgId && row.inventoryItemId === inventoryItemId && row.source === candidate.source);
  const row: MarketMapping = {
    id: existingIndex >= 0 ? rows[existingIndex].id : crypto.randomUUID(),
    orgId,
    inventoryItemId,
    source: candidate.source,
    sourceUrl: candidate.sourceUrl,
    externalId: candidate.externalId || null,
    displayName: candidate.displayName,
    metadata: candidate as unknown as Record<string, unknown>,
    createdAt: existingIndex >= 0 ? rows[existingIndex].createdAt : now,
    updatedAt: now
  };
  if (existingIndex >= 0) rows[existingIndex] = row;
  else rows.unshift(row);
  localStorage.setItem(LOCAL_MARKET_MAPPINGS_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event('cardpulse-local-change'));
  return row;
}

function saveLocalMarketSnapshot(orgId: string, inventoryItemId: string, candidate: MarketCandidate) {
  const row: MarketPriceSnapshot = {
    id: crypto.randomUUID(),
    orgId,
    inventoryItemId,
    source: candidate.source,
    sourceUrl: candidate.sourceUrl,
    price: candidate.price,
    currency: candidate.currency,
    availability: candidate.availability || null,
    fetchedAt: new Date().toISOString(),
    raw: candidate as unknown as Record<string, unknown>
  };
  const rows = [row, ...getLocalMarketSnapshots()].slice(0, 1000);
  localStorage.setItem(LOCAL_MARKET_SNAPSHOTS_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event('cardpulse-local-change'));
  return row;
}

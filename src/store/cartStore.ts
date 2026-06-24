import { create } from 'zustand';
import type { CartLine, InventoryItem, PaymentMethod } from '../types/domain';
import { getLocalDateKey, type SaleMode } from '../lib/reports/revenuePeriods';

interface CartState {
  lines: CartLine[];
  saleMode: SaleMode | '';
  eventId: string;
  finalTotal: number | null;
  paymentMethod: PaymentMethod;
  notes: string;
  addItem: (item: InventoryItem, quantity?: number) => void;
  addMiscLine: (name: string, unitPrice: number, quantity?: number) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  setSaleMode: (saleMode: SaleMode | '') => void;
  setEventId: (eventId: string) => void;
  setFinalTotal: (total: number | null) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setNotes: (notes: string) => void;
  clear: () => void;
}

const SALE_CONTEXT_KEY = 'cardpulse-sale-context';

interface PersistedSaleContext {
  date: string;
  saleMode: SaleMode | '';
  eventId: string;
}

function loadSaleContext(): Pick<CartState, 'saleMode' | 'eventId'> {
  try {
    const raw = window.localStorage.getItem(SALE_CONTEXT_KEY);
    if (!raw) return { saleMode: '', eventId: '' };
    const parsed = JSON.parse(raw) as Partial<PersistedSaleContext>;
    if (parsed.date !== getLocalDateKey()) {
      window.localStorage.removeItem(SALE_CONTEXT_KEY);
      return { saleMode: '', eventId: '' };
    }
    return {
      saleMode: parsed.saleMode === 'daily' || parsed.saleMode === 'show' ? parsed.saleMode : '',
      eventId: typeof parsed.eventId === 'string' ? parsed.eventId : ''
    };
  } catch {
    return { saleMode: '', eventId: '' };
  }
}

function saveSaleContext(saleMode: SaleMode | '', eventId: string) {
  try {
    const payload: PersistedSaleContext = { date: getLocalDateKey(), saleMode, eventId };
    window.localStorage.setItem(SALE_CONTEXT_KEY, JSON.stringify(payload));
  } catch {
    // Sale context persistence is convenience-only; checkout still works without storage.
  }
}

const initialSaleContext = loadSaleContext();

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  saleMode: initialSaleContext.saleMode,
  eventId: initialSaleContext.eventId,
  finalTotal: null,
  paymentMethod: 'cash',
  notes: '',
  addItem: (item, quantity = 1) =>
    set((state) => {
      const existing = state.lines.find((line) => line.kind === 'inventory' && line.item.id === item.id);
      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.kind === 'inventory' && line.item.id === item.id
              ? { ...line, quantity: Math.min(item.quantity, line.quantity + quantity) }
              : line
          ),
          finalTotal: null
        };
      }
      return {
        lines: [{ kind: 'inventory', item, quantity: Math.min(item.quantity, quantity) }, ...state.lines],
        finalTotal: null
      };
    }),
  addMiscLine: (name, unitPrice, quantity = 1) =>
    set((state) => ({
      lines: [{
        kind: 'misc',
        id: crypto.randomUUID(),
        name: name.trim() || 'Others',
        unitPrice: Math.max(0, Number(unitPrice) || 0),
        quantity: Math.max(1, Number(quantity) || 1)
      }, ...state.lines],
      finalTotal: null
    })),
  setQuantity: (lineId, quantity) =>
    set((state) => ({
      lines: state.lines
        .map((line) =>
          lineIdFor(line) === lineId
            ? {
                ...line,
                quantity: line.kind === 'inventory'
                  ? Math.max(1, Math.min(line.item.quantity, quantity))
                  : Math.max(1, Number(quantity) || 1)
              }
            : line
        )
        .filter((line) => line.quantity > 0),
      finalTotal: null
    })),
  removeItem: (lineId) => set((state) => ({
    lines: state.lines.filter((line) => lineIdFor(line) !== lineId),
    finalTotal: null
  })),
  setSaleMode: (saleMode) =>
    set((state) => {
      saveSaleContext(saleMode, saleMode === 'daily' ? '' : state.eventId);
      return { saleMode, eventId: saleMode === 'daily' ? '' : state.eventId };
    }),
  setEventId: (eventId) =>
    set((state) => {
      saveSaleContext(state.saleMode, eventId);
      return { eventId };
    }),
  setFinalTotal: (finalTotal) => set({ finalTotal: finalTotal === null ? null : Math.max(0, finalTotal) }),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setNotes: (notes) => set({ notes }),
  clear: () => set({ lines: [], finalTotal: null, paymentMethod: 'cash', notes: '' })
}));

export function getCartSubtotal(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + lineUnitPrice(line) * line.quantity, 0);
}

export function lineIdFor(line: CartLine) {
  return line.kind === 'inventory' ? line.item.id : line.id;
}

export function lineUnitPrice(line: CartLine) {
  return line.kind === 'inventory' ? line.item.askingPrice : line.unitPrice;
}

import type { SaleLineItem, Transaction } from '../../types/domain';

export function lineFinalTotal(transaction: Pick<Transaction, 'subtotal' | 'total'>, line: Pick<SaleLineItem, 'lineTotal'>) {
  if (transaction.subtotal <= 0) return Math.max(0, line.lineTotal);
  return Math.max(0, line.lineTotal * (transaction.total / transaction.subtotal));
}

export function lineFinalUnitPrice(
  transaction: Pick<Transaction, 'subtotal' | 'total'>,
  line: Pick<SaleLineItem, 'lineTotal' | 'quantity' | 'unitPrice'>
) {
  if (line.quantity <= 0) return line.unitPrice;
  return lineFinalTotal(transaction, line) / line.quantity;
}

export function lineCostTotal(line: Pick<SaleLineItem, 'quantity' | 'unitCost'>) {
  return Math.max(0, line.unitCost * line.quantity);
}

export function lineFinalProfit(
  transaction: Pick<Transaction, 'subtotal' | 'total'>,
  line: Pick<SaleLineItem, 'lineTotal' | 'quantity' | 'unitCost'>
) {
  return lineFinalTotal(transaction, line) - lineCostTotal(line);
}

import type { Batch } from 'src/api/firestore/batches';
import type { TenantRole } from 'src/auth/firebase-claims';

// ----------------------------------------------------------------------

export type PaymentMethod =
  | 'cash'
  | 'pix'
  | 'credit_card'
  | 'debit_card'
  | 'store_credit'
  | 'credit_tab';

export const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'pix',
  'credit_card',
  'debit_card',
  'store_credit',
  'credit_tab',
];

export type PosCartItemInput = {
  productId: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
};

export type PosPaymentInput = {
  method: PaymentMethod;
  amount: number;
};

export type PosTotalsSummary = {
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  maxAllowedDiscountPercent: number;
  discountAllowed: boolean;
  deliveryFee: number;
  surchargeAmount: number;
  total: number;
  totalCost: number;
  grossProfit: number;
  paidAmount: number;
  creditTabAmount: number;
  remainingToPay: number;
  changeAmount: number;
  isPaymentComplete: boolean;
};

export const OPERATOR_MAX_DISCOUNT_PERCENT = 5;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Seleciona o lote ativo mais antigo com saldo disponível (FIFO - First In, First Out)
 * para um determinado produto.
 */
export function pickFifoBatch(batches: Batch[], productId: string): Batch | null {
  const candidates = batches
    .filter((b) => b.active && b.productId === productId && b.remainingQty > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return candidates[0] ?? null;
}

export function getMaxDiscountPercentForRole(role?: TenantRole | string | null): number {
  if (role === 'admin' || role === 'gestor') {
    return 100;
  }
  return OPERATOR_MAX_DISCOUNT_PERCENT;
}

export function calculatePosTotals(params: {
  items: PosCartItemInput[];
  discountAmount?: number;
  deliveryFee?: number;
  surchargeAmount?: number;
  payments: PosPaymentInput[];
  role?: TenantRole | string | null;
}): PosTotalsSummary {
  const subtotal = round2(
    params.items.reduce((acc, item) => {
      const qty = Math.max(0, Number(item.qty) || 0);
      const price = Math.max(0, Number(item.unitPrice) || 0);
      return acc + qty * price;
    }, 0)
  );

  const totalCost = round2(
    params.items.reduce((acc, item) => {
      const qty = Math.max(0, Number(item.qty) || 0);
      const cost = Math.max(0, Number(item.unitCost) || 0);
      return acc + qty * cost;
    }, 0)
  );

  const rawDiscount = Math.max(0, Number(params.discountAmount) || 0);
  const discountAmount = round2(Math.min(subtotal, rawDiscount));
  const discountPercent = subtotal > 0 ? round2((discountAmount / subtotal) * 100) : 0;

  const maxAllowedDiscountPercent = getMaxDiscountPercentForRole(params.role);
  const discountAllowed = discountPercent <= maxAllowedDiscountPercent + 0.0001;

  const deliveryFee = round2(Math.max(0, Number(params.deliveryFee) || 0));
  const surchargeAmount = round2(Math.max(0, Number(params.surchargeAmount) || 0));

  const total = round2(Math.max(0, subtotal - discountAmount + deliveryFee + surchargeAmount));
  const grossProfit = round2(total - totalCost);

  const paidAmount = round2(
    params.payments.reduce((acc, p) => acc + Math.max(0, Number(p.amount) || 0), 0)
  );

  const creditTabAmount = round2(
    params.payments
      .filter((p) => p.method === 'credit_tab')
      .reduce((acc, p) => acc + Math.max(0, Number(p.amount) || 0), 0)
  );

  const remainingToPay = round2(Math.max(0, total - paidAmount));
  const changeAmount = round2(Math.max(0, paidAmount - total));
  const isPaymentComplete = total > 0 ? paidAmount >= total - 0.001 : params.items.length > 0;

  return {
    subtotal,
    discountAmount,
    discountPercent,
    maxAllowedDiscountPercent,
    discountAllowed,
    deliveryFee,
    surchargeAmount,
    total,
    totalCost,
    grossProfit,
    paidAmount,
    creditTabAmount,
    remainingToPay,
    changeAmount,
    isPaymentComplete,
  };
}

export function generateSaleCode(date: Date = new Date(), suffix?: string): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const codeSuffix = suffix
    ? suffix.toUpperCase()
    : Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, '0');
  return `VD-${y}${m}${d}-${codeSuffix}`;
}

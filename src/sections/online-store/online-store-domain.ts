// ----------------------------------------------------------------------

export type OnlineStoreDayHours = {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  open: string;
  close: string;
  closed?: boolean;
};

export type OnlineStoreClosedReason = 'plan' | 'disabled' | 'outside_hours' | 'no_open_cash';

export type ResolveOpenInput = {
  hasEntitlement: boolean;
  enabled: boolean;
  hours: OnlineStoreDayHours[];
  now: Date;
  hasOpenCash: boolean;
  timeZone?: string;
};

export type OnlineOrderItemLike = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string;
};

export type OnlineOrderLike = {
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryType: 'pickup' | 'delivery';
  deliveryFee: number;
  paymentMethod: 'cash' | 'pix' | 'debit_card' | 'credit_card';
  items: OnlineOrderItemLike[];
  subtotal: number;
  total: number;
  notes?: string;
};

export type CreateSaleInputLike = {
  code: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  sellerUid?: string;
  sellerEmail?: string;
  items: Array<{
    productId: string;
    productName: string;
    productSku: string;
    unit: string;
    qty: number;
    unitPrice: number;
    unitCost: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  totalCost: number;
  grossProfit: number;
  payments: Array<{ method: string; amount: number }>;
  paidAmount: number;
  changeAmount: number;
  deliveryType: 'pickup' | 'delivery';
  deliveryAddress?: string;
  deliveryFee: number;
  notes?: string;
  channel: 'online';
  cashSessionId: string;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function partsInZone(now: Date, timeZone: string): { day: number; hhmm: string } {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(now);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = dayMap[weekday] ?? now.getUTCDay();

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
  return { day, hhmm: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` };
}

export function normalizeStoreSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isWithinOpeningHours(
  hours: OnlineStoreDayHours[],
  now: Date,
  timeZone: string = 'America/Sao_Paulo'
): boolean {
  const { day, hhmm } = partsInZone(now, timeZone);
  const entry = hours.find((h) => h.day === day);
  if (!entry || entry.closed) {
    return false;
  }
  return hhmm >= entry.open && hhmm <= entry.close;
}

export function resolveOnlineStoreOpen(input: ResolveOpenInput): {
  isOpen: boolean;
  closedReason?: OnlineStoreClosedReason;
} {
  if (!input.hasEntitlement) {
    return { isOpen: false, closedReason: 'plan' };
  }
  if (!input.enabled) {
    return { isOpen: false, closedReason: 'disabled' };
  }
  if (!isWithinOpeningHours(input.hours, input.now, input.timeZone)) {
    return { isOpen: false, closedReason: 'outside_hours' };
  }
  if (!input.hasOpenCash) {
    return { isOpen: false, closedReason: 'no_open_cash' };
  }
  return { isOpen: true };
}

export function buildOnlineOrderTotals(
  items: { qty: number; unitPrice: number }[],
  deliveryFee: number
): { subtotal: number; total: number } {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0));
  const total = roundMoney(subtotal + Number(deliveryFee || 0));
  return { subtotal, total };
}

export function mapOnlineOrderToCreateSaleInput(
  order: OnlineOrderLike,
  meta: { cashSessionId: string; sellerUid?: string; sellerEmail?: string; code: string }
): CreateSaleInputLike {
  const items = order.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    productSku: item.productSku,
    unit: item.unit,
    qty: item.qty,
    unitPrice: item.unitPrice,
    unitCost: 0,
    lineTotal: item.lineTotal,
  }));

  const itemNotes = order.items
    .filter((i) => i.notes)
    .map((i) => `${i.productName}: ${i.notes}`)
    .join('; ');
  const notes = [order.notes, itemNotes].filter(Boolean).join(' | ') || undefined;

  return {
    code: meta.code,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    sellerUid: meta.sellerUid,
    sellerEmail: meta.sellerEmail,
    items,
    subtotal: order.subtotal,
    discountAmount: 0,
    discountPercent: 0,
    total: order.total,
    totalCost: 0,
    grossProfit: order.total,
    payments: [{ method: order.paymentMethod, amount: order.total }],
    paidAmount: order.total,
    changeAmount: 0,
    deliveryType: order.deliveryType,
    deliveryAddress: order.customerAddress,
    deliveryFee: order.deliveryFee,
    notes,
    channel: 'online',
    cashSessionId: meta.cashSessionId,
  };
}

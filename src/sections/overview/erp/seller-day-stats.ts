// ----------------------------------------------------------------------

export type SellerDaySaleInput = {
  createdAt: string;
  total?: number;
  grandTotal?: number;
  status?: string;
};

export type SellerDayOnlineOrderInput = {
  status: string;
  createdAt?: string;
  fulfillmentStatus?: string;
};

export type SellerDaySummary<
  TSale extends SellerDaySaleInput = SellerDaySaleInput,
  TOrder extends SellerDayOnlineOrderInput = SellerDayOnlineOrderInput,
> = {
  salesCount: number;
  salesTotal: number;
  pendingOnlineCount: number;
  inProgressOnlineCount: number;
  todaySales: TSale[];
  openOnlineOrders: TOrder[];
};

const IN_PROGRESS_STATUSES = new Set(['accepted', 'preparing', 'out_for_delivery']);

/** Start/end of the local calendar day as ISO strings (end exclusive-friendly via <= end). */
export function getLocalDayBoundsIso(now: Date = new Date()): {
  startIso: string;
  endIso: string;
} {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function saleAmount(sale: SellerDaySaleInput): number {
  if (typeof sale.grandTotal === 'number' && Number.isFinite(sale.grandTotal)) {
    return sale.grandTotal;
  }
  if (typeof sale.total === 'number' && Number.isFinite(sale.total)) {
    return sale.total;
  }
  return 0;
}

function isInDay(iso: string | undefined, startIso: string, endIso: string): boolean {
  if (!iso) return false;
  return iso >= startIso && iso <= endIso;
}

function isInProgressOrder(order: SellerDayOnlineOrderInput): boolean {
  if (IN_PROGRESS_STATUSES.has(order.status)) return true;
  if (order.fulfillmentStatus && IN_PROGRESS_STATUSES.has(order.fulfillmentStatus)) {
    return order.status !== 'rejected' && order.status !== 'cancelled';
  }
  return false;
}

export function summarizeSellerDay<
  TSale extends SellerDaySaleInput,
  TOrder extends SellerDayOnlineOrderInput,
>(input: {
  sales: TSale[];
  onlineOrders: TOrder[];
  dayStartIso: string;
  dayEndIso: string;
}): SellerDaySummary<TSale, TOrder> {
  const todaySales = input.sales
    .filter((sale) => isInDay(sale.createdAt, input.dayStartIso, input.dayEndIso))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const salesTotal = todaySales.reduce((sum, sale) => sum + saleAmount(sale), 0);

  const pendingOnlineCount = input.onlineOrders.filter((o) => o.status === 'pending').length;
  const inProgressOnlineCount = input.onlineOrders.filter((o) => isInProgressOrder(o)).length;

  const openOnlineOrders = input.onlineOrders
    .filter((o) => o.status === 'pending' || isInProgressOrder(o))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

  return {
    salesCount: todaySales.length,
    salesTotal,
    pendingOnlineCount,
    inProgressOnlineCount,
    todaySales,
    openOnlineOrders,
  };
}

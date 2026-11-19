import type { Sale } from 'src/api/firestore/sales';
import type { Batch } from 'src/api/firestore/batches';
import type { Product } from 'src/api/firestore/products';
import type { Payable } from 'src/api/firestore/payables';
import type { Customer } from 'src/api/firestore/customers';
import type { Receivable } from 'src/api/firestore/receivables';
import type { OnlineOrder } from 'src/api/firestore/online-orders';
import type { ProcessingOrder } from 'src/api/firestore/processing-orders';
import type { PeriodBounds, DateFilterPreset } from 'src/components/period-filter';

import dayjs from 'dayjs';

import { isIsoInPeriodBounds } from 'src/components/period-filter';

import { buildAccrualDre } from 'src/sections/cash/accrual-dre';

// ----------------------------------------------------------------------

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcGrowthPercent(current: number, previous: number): number {
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

export function isLiterUnit(unit?: string): boolean {
  if (!unit) return false;
  const normalized = unit.trim().toLowerCase();
  return (
    normalized === 'l' ||
    normalized === 'lt' ||
    normalized === 'lts' ||
    normalized === 'litro' ||
    normalized === 'litros'
  );
}

export function resolvePreviousPeriodBounds(
  preset: DateFilterPreset,
  currentBounds: PeriodBounds
): PeriodBounds | null {
  if (preset === 'all' || !currentBounds.start || !currentBounds.end) {
    return null;
  }

  const startDay = currentBounds.start.startOf('day');
  const endDay = currentBounds.end.endOf('day');
  const spanDays = Math.max(1, endDay.startOf('day').diff(startDay, 'day') + 1);

  return {
    start: startDay.subtract(spanDays, 'day').startOf('day'),
    end: startDay.subtract(1, 'day').endOf('day'),
  };
}

// ----------------------------------------------------------------------
// Channel & Fiscal Summary
// ----------------------------------------------------------------------

export type ChannelBreakdown = {
  posRevenue: number;
  posCount: number;
  onlineRevenue: number;
  onlineCount: number;
  totalRevenue: number;
  totalCount: number;
  posSharePercent: number;
  onlineSharePercent: number;
  avgTicket: number;
  dailySeries: Array<{
    date: string;
    posRevenue: number;
    onlineRevenue: number;
    posCount: number;
    onlineCount: number;
  }>;
};

export function computeChannelBreakdown(sales: Sale[], bounds: PeriodBounds): ChannelBreakdown {
  const completed = sales.filter(
    (s) => s.status === 'completed' && isIsoInPeriodBounds(s.createdAt, bounds)
  );

  let posRevenue = 0;
  let posCount = 0;
  let onlineRevenue = 0;
  let onlineCount = 0;

  const dailyMap = new Map<
    string,
    { date: string; posRevenue: number; onlineRevenue: number; posCount: number; onlineCount: number }
  >();

  completed.forEach((sale) => {
    const amount = Number(sale.total) || 0;
    const isOnline = sale.channel === 'online' || Boolean(sale.onlineOrderId);
    const dayKey = sale.createdAt ? dayjs(sale.createdAt).format('YYYY-MM-DD') : '';

    if (isOnline) {
      onlineRevenue += amount;
      onlineCount += 1;
    } else {
      posRevenue += amount;
      posCount += 1;
    }

    if (dayKey) {
      const existing = dailyMap.get(dayKey) ?? {
        date: dayKey,
        posRevenue: 0,
        onlineRevenue: 0,
        posCount: 0,
        onlineCount: 0,
      };
      if (isOnline) {
        existing.onlineRevenue = round2(existing.onlineRevenue + amount);
        existing.onlineCount += 1;
      } else {
        existing.posRevenue = round2(existing.posRevenue + amount);
        existing.posCount += 1;
      }
      dailyMap.set(dayKey, existing);
    }
  });

  const totalRevenue = round2(posRevenue + onlineRevenue);
  const totalCount = posCount + onlineCount;

  return {
    posRevenue: round2(posRevenue),
    posCount,
    onlineRevenue: round2(onlineRevenue),
    onlineCount,
    totalRevenue,
    totalCount,
    posSharePercent: totalRevenue > 0 ? round2((posRevenue / totalRevenue) * 100) : 0,
    onlineSharePercent: totalRevenue > 0 ? round2((onlineRevenue / totalRevenue) * 100) : 0,
    avgTicket: totalCount > 0 ? round2(totalRevenue / totalCount) : 0,
    dailySeries: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export type FiscalSummary = {
  authorizedCount: number;
  authorizedTotal: number;
  pendingCount: number;
  pendingTotal: number;
  cancelledCount: number;
  compliancePercent: number;
};

export function computeFiscalSummary(sales: Sale[], bounds: PeriodBounds): FiscalSummary {
  const inPeriod = sales.filter((s) => isIsoInPeriodBounds(s.createdAt, bounds));

  let authorizedCount = 0;
  let authorizedTotal = 0;
  let pendingCount = 0;
  let pendingTotal = 0;
  let cancelledCount = 0;

  inPeriod.forEach((sale) => {
    const amount = Number(sale.total) || 0;
    if (sale.status === 'cancelled' || sale.nfceStatus === 'cancelled') {
      cancelledCount += 1;
      return;
    }
    if (sale.nfceStatus === 'authorized') {
      authorizedCount += 1;
      authorizedTotal += amount;
    } else {
      pendingCount += 1;
      pendingTotal += amount;
    }
  });

  const activeTotal = authorizedCount + pendingCount;

  return {
    authorizedCount,
    authorizedTotal: round2(authorizedTotal),
    pendingCount,
    pendingTotal: round2(pendingTotal),
    cancelledCount,
    compliancePercent: activeTotal > 0 ? round2((authorizedCount / activeTotal) * 100) : 0,
  };
}

// ----------------------------------------------------------------------
// Online Order Funnel
// ----------------------------------------------------------------------

export type OnlineOrderFunnel = {
  total: number;
  pending: number;
  preparing: number;
  outForDelivery: number;
  delivered: number;
  rejectedOrCancelled: number;
  conversionRate: number;
  totalOnlineOrderValue: number;
};

export function computeOnlineOrderFunnel(
  orders: OnlineOrder[],
  bounds: PeriodBounds
): OnlineOrderFunnel {
  const inPeriod = orders.filter((o) => isIsoInPeriodBounds(o.createdAt, bounds));

  let pending = 0;
  let preparing = 0;
  let outForDelivery = 0;
  let delivered = 0;
  let rejectedOrCancelled = 0;
  let totalOnlineOrderValue = 0;

  inPeriod.forEach((order) => {
    const status = order.fulfillmentStatus || order.status;
    if (status === 'pending') {
      pending += 1;
      totalOnlineOrderValue += Number(order.total) || 0;
    } else if (status === 'accepted' || status === 'preparing') {
      preparing += 1;
      totalOnlineOrderValue += Number(order.total) || 0;
    } else if (status === 'out_for_delivery') {
      outForDelivery += 1;
      totalOnlineOrderValue += Number(order.total) || 0;
    } else if (status === 'delivered') {
      delivered += 1;
      totalOnlineOrderValue += Number(order.total) || 0;
    } else {
      rejectedOrCancelled += 1;
    }
  });

  const total = inPeriod.length;
  const acceptedTotal = preparing + outForDelivery + delivered;

  return {
    total,
    pending,
    preparing,
    outForDelivery,
    delivered,
    rejectedOrCancelled,
    conversionRate: total > 0 ? round2((acceptedTotal / total) * 100) : 0,
    totalOnlineOrderValue: round2(totalOnlineOrderValue),
  };
}

// ----------------------------------------------------------------------
// Today, Month-to-Date & Monthly Growth Forecast
// ----------------------------------------------------------------------

export type MonthForecastSummary = {
  todayRevenue: number;
  todaySalesCount: number;
  todayNetProfit: number;
  monthRevenue: number;
  monthSalesCount: number;
  monthNetProfit: number;
  monthExpenses: number;
  monthCogs: number;
  projectedMonthRevenue: number;
  projectedMonthNetProfit: number;
  prevMonthRevenue: number;
  projectedGrowthPercent: number;
  daysElapsedInMonth: number;
  daysInMonth: number;
};

export function computeTodayAndMonthForecast(params: {
  sales: Sale[];
  payables: Payable[];
  referenceDate?: dayjs.Dayjs;
}): MonthForecastSummary {
  const now = params.referenceDate ?? dayjs();

  const todayBounds: PeriodBounds = {
    start: now.startOf('day'),
    end: now.endOf('day'),
  };

  const monthBounds: PeriodBounds = {
    start: now.startOf('month'),
    end: now.endOf('day'),
  };

  const prevMonthDate = now.subtract(1, 'month');
  const prevMonthBounds: PeriodBounds = {
    start: prevMonthDate.startOf('month'),
    end: prevMonthDate.endOf('month'),
  };

  const todayDre = buildAccrualDre({
    sales: params.sales,
    payables: params.payables,
    bounds: todayBounds,
  });

  const monthDre = buildAccrualDre({
    sales: params.sales,
    payables: params.payables,
    bounds: monthBounds,
  });

  const prevMonthDre = buildAccrualDre({
    sales: params.sales,
    payables: params.payables,
    bounds: prevMonthBounds,
  });

  const daysElapsedInMonth = Math.max(1, now.date());
  const daysInMonth = now.daysInMonth();
  const multiplier = daysInMonth / daysElapsedInMonth;

  const projectedMonthRevenue = round2(monthDre.netRevenue * multiplier);
  const projectedMonthNetProfit = round2(monthDre.netProfit * multiplier);
  const projectedGrowthPercent = calcGrowthPercent(projectedMonthRevenue, prevMonthDre.netRevenue);

  return {
    todayRevenue: todayDre.netRevenue,
    todaySalesCount: todayDre.salesCount,
    todayNetProfit: todayDre.netProfit,
    monthRevenue: monthDre.netRevenue,
    monthSalesCount: monthDre.salesCount,
    monthNetProfit: monthDre.netProfit,
    monthExpenses: monthDre.operatingExpenses,
    monthCogs: monthDre.cogs,
    projectedMonthRevenue,
    projectedMonthNetProfit,
    prevMonthRevenue: prevMonthDre.netRevenue,
    projectedGrowthPercent,
    daysElapsedInMonth,
    daysInMonth,
  };
}

// ----------------------------------------------------------------------
// Top Products & Top Identified Customers
// ----------------------------------------------------------------------

export type TopProductRow = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  qtySold: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
  salesCount: number;
};

export function computeTopProducts(
  sales: Sale[],
  bounds: PeriodBounds,
  limit = 10
): TopProductRow[] {
  const completed = sales.filter(
    (s) => s.status === 'completed' && isIsoInPeriodBounds(s.createdAt, bounds)
  );

  const map = new Map<string, TopProductRow>();

  completed.forEach((sale) => {
    const seenInSale = new Set<string>();
    sale.items.forEach((item) => {
      const key = item.productId || item.productSku || item.productName;
      if (!key) return;
      const qty = Number(item.qty) || 0;
      const rev = Number(item.lineTotal) || qty * (Number(item.unitPrice) || 0);
      const cost = qty * (Number(item.unitCost) || 0);

      const current = map.get(key) ?? {
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        unit: item.unit || 'un',
        qtySold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        marginPercent: 0,
        salesCount: 0,
      };

      current.qtySold = round2(current.qtySold + qty);
      current.revenue = round2(current.revenue + rev);
      current.cost = round2(current.cost + cost);
      current.profit = round2(current.revenue - current.cost);
      current.marginPercent =
        current.revenue > 0 ? round2((current.profit / current.revenue) * 100) : 0;

      if (!seenInSale.has(key)) {
        current.salesCount += 1;
        seenInSale.add(key);
      }

      map.set(key, current);
    });
  });

  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export type TopCustomerRow = {
  key: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  ordersCount: number;
  totalSpent: number;
  avgTicket: number;
  lastPurchaseAt: string;
  currentDebt: number;
};

export function computeTopIdentifiedCustomers(
  sales: Sale[],
  customers: Customer[],
  bounds: PeriodBounds,
  limit = 10
): TopCustomerRow[] {
  const completed = sales.filter(
    (s) => s.status === 'completed' && isIsoInPeriodBounds(s.createdAt, bounds)
  );

  const customerMap = new Map<string, Customer>();
  customers.forEach((c) => customerMap.set(c.id, c));

  const map = new Map<string, TopCustomerRow>();

  completed.forEach((sale) => {
    const rawName = (sale.customerName ?? '').trim();
    const hasCustomer = Boolean(sale.customerId) || rawName.length > 0;
    if (!hasCustomer) return;

    const lower = rawName.toLowerCase();
    if (
      !sale.customerId &&
      (lower === 'consumidor final' || lower === 'balcão' || lower === 'balcao' || lower === 'cliente')
    ) {
      return;
    }

    const key = sale.customerId || `name:${lower}:${(sale.customerPhone ?? '').trim()}`;
    const customerRecord = sale.customerId ? customerMap.get(sale.customerId) : undefined;
    const total = Number(sale.total) || 0;

    const current = map.get(key) ?? {
      key,
      customerId: sale.customerId,
      customerName: customerRecord?.name || rawName || 'Cliente',
      customerPhone: sale.customerPhone || customerRecord?.phone,
      ordersCount: 0,
      totalSpent: 0,
      avgTicket: 0,
      lastPurchaseAt: sale.createdAt || '',
      currentDebt: customerRecord?.currentDebt ?? 0,
    };

    current.ordersCount += 1;
    current.totalSpent = round2(current.totalSpent + total);
    current.avgTicket = round2(current.totalSpent / current.ordersCount);
    if (sale.createdAt && sale.createdAt > current.lastPurchaseAt) {
      current.lastPurchaseAt = sale.createdAt;
    }

    map.set(key, current);
  });

  return Array.from(map.values())
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
}

// ----------------------------------------------------------------------
// Payables & Receivables Cash Flow Health
// ----------------------------------------------------------------------

export type CashFlowObligations = {
  payablesOpen: number;
  payablesOverdue: number;
  payablesPaidInPeriod: number;
  receivablesOpen: number;
  receivablesOverdue: number;
  receivablesReceivedInPeriod: number;
};

export function computeCashFlowObligations(params: {
  payables: Payable[];
  receivables: Receivable[];
  bounds: PeriodBounds;
  referenceDate?: dayjs.Dayjs;
}): CashFlowObligations {
  const todayStr = (params.referenceDate ?? dayjs()).format('YYYY-MM-DD');

  let payablesOpen = 0;
  let payablesOverdue = 0;
  let payablesPaidInPeriod = 0;

  params.payables.forEach((p) => {
    if (p.active === false || p.status === 'cancelled') return;
    const amt = Number(p.amount) || 0;
    if (p.status === 'open') {
      payablesOpen += amt;
      if (p.dueDate && p.dueDate < todayStr) {
        payablesOverdue += amt;
      }
    } else if (p.status === 'paid' && isIsoInPeriodBounds(p.updatedAt || p.createdAt, params.bounds)) {
      payablesPaidInPeriod += amt;
    }
  });

  let receivablesOpen = 0;
  let receivablesOverdue = 0;
  let receivablesReceivedInPeriod = 0;

  params.receivables.forEach((r) => {
    if (r.active === false || r.status === 'cancelled') return;
    const amt = Number(r.amount) || 0;
    if (r.status === 'open') {
      receivablesOpen += amt;
      if (r.dueDate && r.dueDate < todayStr) {
        receivablesOverdue += amt;
      }
    } else if (r.status === 'paid' && isIsoInPeriodBounds(r.updatedAt || r.createdAt, params.bounds)) {
      receivablesReceivedInPeriod += amt;
    }
  });

  return {
    payablesOpen: round2(payablesOpen),
    payablesOverdue: round2(payablesOverdue),
    payablesPaidInPeriod: round2(payablesPaidInPeriod),
    receivablesOpen: round2(receivablesOpen),
    receivablesOverdue: round2(receivablesOverdue),
    receivablesReceivedInPeriod: round2(receivablesReceivedInPeriod),
  };
}

// ----------------------------------------------------------------------
// Production & Processing Analytics (e.g., Açaí -> Liters)
// ----------------------------------------------------------------------

export type ProductionDailyPoint = {
  date: string;
  litersProduced: number;
  totalOutputQty: number;
  rawQtyUsed: number;
  totalCost: number;
  ordersCount: number;
};

export type ProductionOutputBreakdown = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  producedQty: number;
  soldQty: number;
  stockRemaining: number;
  allocatedTotalCost: number;
  avgUnitCost: number;
};

export type ProductionMetrics = {
  ordersCount: number;
  litersProduced: number;
  otherUnitsProduced: number;
  totalOutputQty: number;
  primaryOutputUnit: string;
  rawQtyUsed: number;
  primaryRawUnit: string;
  avgYieldRatio: number;
  rawTotalCost: number;
  extraTotalCost: number;
  totalProductionCost: number;
  avgUnitCost: number;
  litersSoldInPeriod: number;
  dailySeries: ProductionDailyPoint[];
  byProduct: ProductionOutputBreakdown[];
};

export function computeProductionMetrics(params: {
  orders: ProcessingOrder[];
  sales: Sale[];
  batches: Batch[];
  bounds: PeriodBounds;
}): ProductionMetrics {
  const completedOrders = params.orders.filter(
    (o) => o.status === 'completed' && isIsoInPeriodBounds(o.createdAt, params.bounds)
  );

  const completedSales = params.sales.filter(
    (s) => s.status === 'completed' && isIsoInPeriodBounds(s.createdAt, params.bounds)
  );

  let litersProduced = 0;
  let otherUnitsProduced = 0;
  let totalOutputQty = 0;
  let rawQtyUsed = 0;
  let rawTotalCost = 0;
  let extraTotalCost = 0;
  let totalProductionCost = 0;

  const rawUnitCounts = new Map<string, number>();
  const dailyMap = new Map<string, ProductionDailyPoint>();
  const productMap = new Map<string, ProductionOutputBreakdown>();

  completedOrders.forEach((order) => {
    const rawUsed = Number(order.rawQtyUsed) || 0;
    const rawCost = Number(order.rawTotalCost) || 0;
    const extra = Number(order.extraCost) || 0;
    const cost = Number(order.totalCost) || rawCost + extra;
    const dayKey = order.createdAt ? dayjs(order.createdAt).format('YYYY-MM-DD') : '';

    rawQtyUsed += rawUsed;
    rawTotalCost += rawCost;
    extraTotalCost += extra;
    totalProductionCost += cost;

    if (order.rawUnit) {
      rawUnitCounts.set(order.rawUnit, (rawUnitCounts.get(order.rawUnit) ?? 0) + rawUsed);
    }

    let orderLiters = 0;
    let orderOutput = 0;

    order.outputs.forEach((out) => {
      const qty = Number(out.qty) || 0;
      const allocCost = Number(out.allocatedTotalCost) || 0;
      orderOutput += qty;
      totalOutputQty += qty;

      if (isLiterUnit(out.unit)) {
        litersProduced += qty;
        orderLiters += qty;
      } else {
        otherUnitsProduced += qty;
      }

      const key = out.productId || out.productSku || out.productName;
      if (key) {
        const row = productMap.get(key) ?? {
          productId: out.productId,
          productName: out.productName,
          productSku: out.productSku,
          unit: out.unit || 'L',
          producedQty: 0,
          soldQty: 0,
          stockRemaining: 0,
          allocatedTotalCost: 0,
          avgUnitCost: 0,
        };
        row.producedQty = round2(row.producedQty + qty);
        row.allocatedTotalCost = round2(row.allocatedTotalCost + allocCost);
        row.avgUnitCost = row.producedQty > 0 ? round2(row.allocatedTotalCost / row.producedQty) : 0;
        productMap.set(key, row);
      }
    });

    if (dayKey) {
      const d = dailyMap.get(dayKey) ?? {
        date: dayKey,
        litersProduced: 0,
        totalOutputQty: 0,
        rawQtyUsed: 0,
        totalCost: 0,
        ordersCount: 0,
      };
      d.litersProduced = round2(d.litersProduced + orderLiters);
      d.totalOutputQty = round2(d.totalOutputQty + orderOutput);
      d.rawQtyUsed = round2(d.rawQtyUsed + rawUsed);
      d.totalCost = round2(d.totalCost + cost);
      d.ordersCount += 1;
      dailyMap.set(dayKey, d);
    }
  });

  // Sold qty in period (liters + per produced product)
  let litersSoldInPeriod = 0;
  completedSales.forEach((sale) => {
    sale.items.forEach((item) => {
      const qty = Number(item.qty) || 0;
      if (isLiterUnit(item.unit)) {
        litersSoldInPeriod += qty;
      }
      const key = item.productId || item.productSku || item.productName;
      const existing = productMap.get(key);
      if (existing) {
        existing.soldQty = round2(existing.soldQty + qty);
      }
    });
  });

  // Current FIFO stock remaining for produced items
  params.batches.forEach((batch) => {
    if (!batch.active || batch.remainingQty <= 0) return;
    const key = batch.productId || batch.productSku || batch.productName;
    const existing = productMap.get(key);
    if (existing) {
      existing.stockRemaining = round2(existing.stockRemaining + batch.remainingQty);
    }
  });

  let primaryRawUnit = 'kg';
  let maxRawQty = -1;
  rawUnitCounts.forEach((qty, unit) => {
    if (qty > maxRawQty) {
      maxRawQty = qty;
      primaryRawUnit = unit;
    }
  });

  const primaryOutputUnit = litersProduced > 0 ? 'L' : 'un';
  const denomOutput = litersProduced > 0 ? litersProduced : totalOutputQty;

  return {
    ordersCount: completedOrders.length,
    litersProduced: round2(litersProduced),
    otherUnitsProduced: round2(otherUnitsProduced),
    totalOutputQty: round2(totalOutputQty),
    primaryOutputUnit,
    rawQtyUsed: round2(rawQtyUsed),
    primaryRawUnit,
    avgYieldRatio: rawQtyUsed > 0 ? round2(denomOutput / rawQtyUsed) : 0,
    rawTotalCost: round2(rawTotalCost),
    extraTotalCost: round2(extraTotalCost),
    totalProductionCost: round2(totalProductionCost),
    avgUnitCost: denomOutput > 0 ? round2(totalProductionCost / denomOutput) : 0,
    litersSoldInPeriod: round2(litersSoldInPeriod),
    dailySeries: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    byProduct: Array.from(productMap.values()).sort((a, b) => b.producedQty - a.producedQty),
  };
}

// ----------------------------------------------------------------------
// Inventory & Batch Alerts
// ----------------------------------------------------------------------

export type LowStockAlert = {
  productId: string;
  productName: string;
  productSku: string;
  productType: 'raw' | 'finished';
  unit: string;
  currentStock: number;
  minStock: number;
  percentOfMin: number;
};

export type ExpiringBatchAlert = {
  batchId: string;
  lotCode: string;
  productName: string;
  unit: string;
  remainingQty: number;
  expiresAt: string;
  daysUntilExpiry: number;
};

export function computeInventoryAlerts(params: {
  products: Product[];
  batches: Batch[];
  referenceDate?: dayjs.Dayjs;
  expiryThresholdDays?: number;
}): {
  lowStock: LowStockAlert[];
  expiringBatches: ExpiringBatchAlert[];
  rawStockValue: number;
  finishedStockValue: number;
} {
  const now = (params.referenceDate ?? dayjs()).startOf('day');
  const threshold = params.expiryThresholdDays ?? 7;

  const stockByProduct = new Map<string, number>();
  let rawStockValue = 0;
  let finishedStockValue = 0;
  const expiringBatches: ExpiringBatchAlert[] = [];

  params.batches.forEach((b) => {
    if (!b.active || b.remainingQty <= 0) return;
    stockByProduct.set(b.productId, (stockByProduct.get(b.productId) ?? 0) + b.remainingQty);

    const val = b.remainingQty * (Number(b.unitCost) || 0);
    if (b.productType === 'raw') {
      rawStockValue += val;
    } else {
      finishedStockValue += val;
    }

    if (b.expiresAt) {
      const exp = dayjs(b.expiresAt).startOf('day');
      if (exp.isValid()) {
        const diff = exp.diff(now, 'day');
        if (diff <= threshold) {
          expiringBatches.push({
            batchId: b.id,
            lotCode: b.lotCode,
            productName: b.productName,
            unit: b.unit || 'un',
            remainingQty: round2(b.remainingQty),
            expiresAt: b.expiresAt,
            daysUntilExpiry: diff,
          });
        }
      }
    }
  });

  const lowStock: LowStockAlert[] = [];
  params.products.forEach((p) => {
    if (!p.active || !p.minStock || p.minStock <= 0) return;
    const current = round2(stockByProduct.get(p.id) ?? 0);
    if (current < p.minStock) {
      lowStock.push({
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        productType: p.type,
        unit: p.unit || 'un',
        currentStock: current,
        minStock: p.minStock,
        percentOfMin: Math.min(100, Math.round((current / p.minStock) * 100)),
      });
    }
  });

  return {
    lowStock: lowStock.sort((a, b) => a.percentOfMin - b.percentOfMin),
    expiringBatches: expiringBatches.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry),
    rawStockValue: round2(rawStockValue),
    finishedStockValue: round2(finishedStockValue),
  };
}

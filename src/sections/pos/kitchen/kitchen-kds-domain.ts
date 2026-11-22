import type { OnlineOrder } from 'src/api/firestore/online-orders';

// ----------------------------------------------------------------------

export type KitchenSlaLevel = 'on_time' | 'warning' | 'delayed';
export type KitchenDemandLevel = 'calm' | 'moderate' | 'high';

export type KitchenDemandSummary = {
  queueCount: number;
  acceptedCount: number;
  preparingCount: number;
  totalItems: number;
  avgWaitMinutes: number;
  delayedCount: number;
  demandLevel: KitchenDemandLevel;
};

export type ProductionSummaryItem = {
  key: string;
  productName: string;
  totalQty: number;
  orderCount: number;
};

// ----------------------------------------------------------------------

export function getOrderArrivalIso(order: OnlineOrder): string {
  return order.acceptedAt || order.createdAt || '';
}

export function filterAndSortKitchenOrders(orders: OnlineOrder[]): OnlineOrder[] {
  return orders
    .filter(
      (order) =>
        order.status !== 'rejected' &&
        order.status !== 'cancelled' &&
        (order.fulfillmentStatus === 'accepted' || order.fulfillmentStatus === 'preparing')
    )
    .sort((a, b) => {
      const timeA = Date.parse(getOrderArrivalIso(a)) || 0;
      const timeB = Date.parse(getOrderArrivalIso(b)) || 0;
      return timeA - timeB;
    });
}

export function computeElapsedSeconds(order: OnlineOrder, nowMs: number): number {
  const startMs = Date.parse(getOrderArrivalIso(order));
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

export function formatKitchenTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function getKitchenSlaLevel(
  elapsedMinutes: number,
  targetMinutes = 20
): KitchenSlaLevel {
  const safeTarget = Math.max(5, targetMinutes);
  if (elapsedMinutes >= safeTarget * 0.85) return 'delayed';
  if (elapsedMinutes >= safeTarget * 0.5) return 'warning';
  return 'on_time';
}

export function computeKitchenDemandSummary(
  kitchenOrders: OnlineOrder[],
  nowMs: number,
  targetMinutes = 20
): KitchenDemandSummary {
  const queueCount = kitchenOrders.length;
  let acceptedCount = 0;
  let preparingCount = 0;
  let totalItems = 0;
  let totalWaitSec = 0;
  let delayedCount = 0;

  kitchenOrders.forEach((order) => {
    if (order.fulfillmentStatus === 'accepted') acceptedCount += 1;
    if (order.fulfillmentStatus === 'preparing') preparingCount += 1;
    totalItems += (order.items || []).reduce((acc, item) => acc + Number(item.qty || 0), 0);
    const elapsedSec = computeElapsedSeconds(order, nowMs);
    totalWaitSec += elapsedSec;
    if (getKitchenSlaLevel(elapsedSec / 60, targetMinutes) === 'delayed') {
      delayedCount += 1;
    }
  });

  const avgWaitMinutes = queueCount > 0 ? Math.round(totalWaitSec / queueCount / 60) : 0;

  let demandLevel: KitchenDemandLevel = 'calm';
  if (delayedCount >= 2 || queueCount >= 8 || avgWaitMinutes >= targetMinutes * 0.8) {
    demandLevel = 'high';
  } else if (delayedCount >= 1 || queueCount >= 4 || avgWaitMinutes >= targetMinutes * 0.45) {
    demandLevel = 'moderate';
  }

  return {
    queueCount,
    acceptedCount,
    preparingCount,
    totalItems,
    avgWaitMinutes,
    delayedCount,
    demandLevel,
  };
}

export function buildProductionSummary(kitchenOrders: OnlineOrder[]): ProductionSummaryItem[] {
  const map = new Map<string, ProductionSummaryItem>();

  kitchenOrders.forEach((order) => {
    const seenInOrder = new Set<string>();
    (order.items || []).forEach((item) => {
      const key = item.productId || item.productName;
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.totalQty += Number(item.qty || 0);
        if (!seenInOrder.has(key)) {
          existing.orderCount += 1;
        }
      } else {
        map.set(key, {
          key,
          productName: item.productName,
          totalQty: Number(item.qty || 0),
          orderCount: 1,
        });
      }
      seenInOrder.add(key);
    });
  });

  return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
}

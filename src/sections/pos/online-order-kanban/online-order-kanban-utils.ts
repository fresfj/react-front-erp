import type { OnlineOrder, OnlineOrderFulfillmentStatus } from 'src/api/firestore/online-orders';

// ----------------------------------------------------------------------

export type KanbanColumnId =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered';

export type KanbanPeriodFilter = 'today' | '7d' | 'all';

export type SlaSeverity = 'normal' | 'warning' | 'overdue';

export type KanbanColumnDef = {
  id: KanbanColumnId;
  color: 'warning' | 'info' | 'primary' | 'secondary' | 'success';
  icon: string;
};

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { id: 'pending', color: 'warning', icon: 'solar:bell-bing-bold-duotone' },
  { id: 'accepted', color: 'info', icon: 'solar:check-circle-bold-duotone' },
  { id: 'preparing', color: 'primary', icon: 'solar:fire-bold-duotone' },
  { id: 'out_for_delivery', color: 'secondary', icon: 'solar:scooter-bold-duotone' },
  { id: 'delivered', color: 'success', icon: 'solar:verified-check-bold-duotone' },
];

export const KANBAN_COLUMN_IDS: KanbanColumnId[] = KANBAN_COLUMNS.map((c) => c.id);

export type TransitionPlan =
  | { allowed: false; reason: 'same_column' | 'cannot_revert_to_pending' | 'must_accept_first' | 'inactive_order' }
  | { allowed: true; action: 'accept' }
  | { allowed: true; action: 'accept_and_prepare' }
  | { allowed: true; action: 'update_status'; target: Exclude<KanbanColumnId, 'pending'> };

// ----------------------------------------------------------------------

export function isKanbanColumnId(value: string): value is KanbanColumnId {
  return KANBAN_COLUMN_IDS.includes(value as KanbanColumnId);
}

export function getOrderColumnId(order: OnlineOrder): KanbanColumnId | null {
  if (order.status === 'rejected' || order.status === 'cancelled') {
    return null;
  }
  if (order.status === 'pending') {
    return 'pending';
  }
  const f = order.fulfillmentStatus;
  if (f === 'accepted' || f === 'preparing' || f === 'out_for_delivery' || f === 'delivered') {
    return f;
  }
  return 'accepted';
}

export function isOrderActive(order: OnlineOrder): boolean {
  return (
    order.status === 'pending' ||
    (order.status === 'accepted' && order.fulfillmentStatus !== 'delivered')
  );
}

/**
 * Resolve se uma transição de arrastar/soltar entre colunas é permitida
 * e qual ação de backend deve ser disparada.
 */
export function resolveKanbanTransition(
  order: OnlineOrder,
  targetColumn: KanbanColumnId
): TransitionPlan {
  const currentColumn = getOrderColumnId(order);
  if (!currentColumn) {
    return { allowed: false, reason: 'inactive_order' };
  }
  if (currentColumn === targetColumn) {
    return { allowed: false, reason: 'same_column' };
  }
  if (targetColumn === 'pending') {
    return { allowed: false, reason: 'cannot_revert_to_pending' };
  }
  if (currentColumn === 'pending') {
    if (targetColumn === 'accepted') {
      return { allowed: true, action: 'accept' };
    }
    if (targetColumn === 'preparing') {
      return { allowed: true, action: 'accept_and_prepare' };
    }
    return { allowed: false, reason: 'must_accept_first' };
  }
  return {
    allowed: true,
    action: 'update_status',
    target: targetColumn,
  };
}

export function getNextKanbanColumn(columnId: KanbanColumnId): Exclude<KanbanColumnId, 'pending'> | null {
  switch (columnId) {
    case 'pending':
      return 'accepted';
    case 'accepted':
      return 'preparing';
    case 'preparing':
      return 'out_for_delivery';
    case 'out_for_delivery':
      return 'delivered';
    default:
      return null;
  }
}

/**
 * Filtra pedidos por período no Kanban.
 * Pedidos ativos (não finalizados/recusados) permanecem sempre visíveis
 * para evitar que pedidos pendentes de ontem fiquem ocultos.
 */
export function filterOrdersByKanbanPeriod(
  orders: OnlineOrder[],
  period: KanbanPeriodFilter,
  now: Date = new Date()
): OnlineOrder[] {
  if (period === 'all') return orders;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const cutoffMs = period === 'today' ? startOfToday : startOfToday - 6 * 24 * 60 * 60 * 1000;

  return orders.filter((order) => {
    if (isOrderActive(order)) return true;
    const createdMs = Date.parse(order.createdAt || '');
    if (Number.isNaN(createdMs)) return true;
    return createdMs >= cutoffMs;
  });
}

export function groupOrdersByColumn(
  orders: OnlineOrder[],
  optimisticMap?: Record<string, OnlineOrderFulfillmentStatus>
): Record<KanbanColumnId, OnlineOrder[]> {
  const grouped: Record<KanbanColumnId, OnlineOrder[]> = {
    pending: [],
    accepted: [],
    preparing: [],
    out_for_delivery: [],
    delivered: [],
  };

  orders.forEach((order) => {
    const overridden = optimisticMap?.[order.id];
    const effectiveOrder: OnlineOrder = overridden
      ? {
          ...order,
          status: overridden === 'pending' ? 'pending' : 'accepted',
          fulfillmentStatus: overridden,
        }
      : order;

    const colId = getOrderColumnId(effectiveOrder);
    if (colId) {
      grouped[colId].push(effectiveOrder);
    }
  });

  // Em etapas ativas, prioriza FIFO (mais antigos no topo para não atrasar);
  // em Finalizados, mais recentes no topo.
  const ascCols: KanbanColumnId[] = ['pending', 'accepted', 'preparing', 'out_for_delivery'];
  ascCols.forEach((col) => {
    grouped[col].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  });
  grouped.delivered.sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
  );

  return grouped;
}

export function formatDurationMinutes(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes));
  if (safe < 60) {
    return `${safe} min`;
  }
  const hours = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

export function getOrderSlaInfo(
  order: OnlineOrder,
  estimatedMinutes: number = 40,
  nowMs: number = Date.now()
): { elapsedMinutes: number; severity: SlaSeverity; label: string; isFinished: boolean } {
  const createdMs = Date.parse(order.createdAt || '');
  const isFinished =
    order.fulfillmentStatus === 'delivered' ||
    order.status === 'rejected' ||
    order.status === 'cancelled';

  if (Number.isNaN(createdMs)) {
    return { elapsedMinutes: 0, severity: 'normal', label: '0 min', isFinished };
  }

  let referenceMs = nowMs;
  if (isFinished) {
    const endIso =
      order.fulfillmentStatus === 'delivered'
        ? order.deliveredAt || order.updatedAt
        : order.rejectedAt || order.updatedAt;
    const parsedEnd = Date.parse(endIso || '');
    referenceMs = Number.isNaN(parsedEnd) ? createdMs : parsedEnd;
  }

  const diffMin = Math.max(0, Math.floor((referenceMs - createdMs) / 60000));
  const safeEstimated = Math.max(5, estimatedMinutes || 40);
  const label = formatDurationMinutes(diffMin);

  if (isFinished) {
    return { elapsedMinutes: diffMin, severity: 'normal', label, isFinished: true };
  }

  let severity: SlaSeverity = 'normal';
  if (diffMin >= safeEstimated) {
    severity = 'overdue';
  } else if (diffMin >= Math.floor(safeEstimated * 0.7)) {
    severity = 'warning';
  }

  return { elapsedMinutes: diffMin, severity, label, isFinished: false };
}

export type OrderJourneyStepKey =
  | 'created'
  | 'accepted'
  | 'preparing'
  | 'dispatched'
  | 'delivered'
  | 'rejected';

export type OrderJourneyEntry = {
  key: OrderJourneyStepKey;
  timestamp: string;
  deltaMinutes?: number;
  deltaLabel?: string;
};

export function buildOrderJourney(order: OnlineOrder): OrderJourneyEntry[] {
  const rawEntries: Array<{ key: OrderJourneyStepKey; timestamp?: string }> = [
    { key: 'created', timestamp: order.createdAt },
    { key: 'accepted', timestamp: order.acceptedAt },
    { key: 'preparing', timestamp: order.preparingAt },
    { key: 'dispatched', timestamp: order.dispatchedAt },
  ];

  if (order.fulfillmentStatus === 'delivered') {
    rawEntries.push({ key: 'delivered', timestamp: order.deliveredAt || order.updatedAt });
  } else if (order.status === 'rejected' || order.status === 'cancelled') {
    rawEntries.push({ key: 'rejected', timestamp: order.rejectedAt || order.updatedAt });
  }

  const valid = rawEntries.filter(
    (entry): entry is { key: OrderJourneyStepKey; timestamp: string } =>
      Boolean(entry.timestamp) && !Number.isNaN(Date.parse(entry.timestamp!))
  );

  return valid.map((entry, idx) => {
    if (idx === 0) {
      return { key: entry.key, timestamp: entry.timestamp };
    }
    const prevMs = Date.parse(valid[idx - 1].timestamp);
    const currMs = Date.parse(entry.timestamp);
    const deltaMinutes = Math.max(0, Math.floor((currMs - prevMs) / 60000));
    return {
      key: entry.key,
      timestamp: entry.timestamp,
      deltaMinutes,
      deltaLabel: `+${formatDurationMinutes(deltaMinutes)}`,
    };
  });
}

export function buildWhatsappPhoneUrl(phone: string, text?: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const full = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${full}${query}`;
}

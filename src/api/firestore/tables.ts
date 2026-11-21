import type { Unsubscribe } from 'firebase/firestore';

import {
  doc,
  query,
  where,
  addDoc,
  getDocs,
  orderBy,
  updateDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

import { omitUndefined } from './omit-undefined';
import { enterpriseDoc, enterpriseCollection } from './paths';

import type { Sale } from './sales';
import type { Product } from './products';
import type { OnlineOrderItem, OnlinePayOnDeliveryMethod } from './online-orders';

// ----------------------------------------------------------------------

export type DiningTableStatus = 'available' | 'occupied' | 'closing';

export type DiningTable = {
  id: string;
  number: string;
  label?: string;
  area?: string;
  capacity?: number;
  qrCodeSlug: string;
  status: DiningTableStatus;
  acceptingOrders: boolean;
  activeSessionId?: string;
  waiterUid?: string;
  waiterName?: string;
  customerName?: string;
  customerPhone?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TableSessionStatus = 'open' | 'closed';

export type TableSession = {
  id: string;
  tableId: string;
  tableNumber: string;
  status: TableSessionStatus;
  openedByType: 'waiter' | 'customer';
  waiterUid?: string;
  waiterName?: string;
  customerName?: string;
  customerPhone?: string;
  orderIds: string[];
  subtotal: number;
  serviceFeePercent?: number;
  serviceFeeAmount?: number;
  total: number;
  saleId?: string;
  cashSessionId?: string;
  openedAt: string;
  closedAt?: string;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function roundMoney(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100;
}

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

export function normalizeTableCode(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapTable(id: string, data: Record<string, unknown>): DiningTable {
  const status: DiningTableStatus =
    data.status === 'occupied' || data.status === 'closing' ? data.status : 'available';
  return {
    id,
    number: String(data.number ?? ''),
    label: optStr(data.label),
    area: optStr(data.area),
    capacity: typeof data.capacity === 'number' ? data.capacity : undefined,
    qrCodeSlug: String(data.qrCodeSlug ?? normalizeTableCode(String(data.number ?? id))),
    status,
    acceptingOrders: data.acceptingOrders !== false,
    activeSessionId: optStr(data.activeSessionId),
    waiterUid: optStr(data.waiterUid),
    waiterName: optStr(data.waiterName),
    customerName: optStr(data.customerName),
    customerPhone: optStr(data.customerPhone),
    active: data.active !== false,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

function mapTableSession(id: string, data: Record<string, unknown>): TableSession {
  return {
    id,
    tableId: String(data.tableId ?? ''),
    tableNumber: String(data.tableNumber ?? ''),
    status: data.status === 'closed' ? 'closed' : 'open',
    openedByType: data.openedByType === 'customer' ? 'customer' : 'waiter',
    waiterUid: optStr(data.waiterUid),
    waiterName: optStr(data.waiterName),
    customerName: optStr(data.customerName),
    customerPhone: optStr(data.customerPhone),
    orderIds: Array.isArray(data.orderIds) ? data.orderIds.map(String) : [],
    subtotal: Number(data.subtotal ?? 0),
    serviceFeePercent:
      typeof data.serviceFeePercent === 'number' ? data.serviceFeePercent : undefined,
    serviceFeeAmount:
      typeof data.serviceFeeAmount === 'number' ? data.serviceFeeAmount : undefined,
    total: Number(data.total ?? 0),
    saleId: optStr(data.saleId),
    cashSessionId: optStr(data.cashSessionId),
    openedAt: String(data.openedAt ?? ''),
    closedAt: optStr(data.closedAt),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

function generateTableOrderCode(tableNumber: string): string {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const cleanNum = tableNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'M';
  return `MS-${cleanNum}-${suffix}`;
}

function generateSaleCode(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VD-${ymd}-${suffix}`;
}

// ----------------------------------------------------------------------
// Subscriptions & CRUD
// ----------------------------------------------------------------------

export function subscribeTables(
  enterpriseId: string,
  cb: (rows: DiningTable[]) => void
): Unsubscribe {
  const col = enterpriseCollection(enterpriseId, 'tables');
  const q = query(col, orderBy('number', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => mapTable(d.id, d.data() as Record<string, unknown>)));
  });
}

export function subscribeOpenTableSessions(
  enterpriseId: string,
  cb: (rows: TableSession[]) => void
): Unsubscribe {
  const col = enterpriseCollection(enterpriseId, 'tableSessions');
  const q = query(col, where('status', '==', 'open'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => mapTableSession(d.id, d.data() as Record<string, unknown>)));
  });
}

export async function createTable(
  enterpriseId: string,
  input: {
    number: string;
    label?: string;
    area?: string;
    capacity?: number;
  }
): Promise<string> {
  const col = enterpriseCollection(enterpriseId, 'tables');
  const ts = nowIso();
  const num = input.number.trim();
  const qrCodeSlug = normalizeTableCode(`mesa-${num}`);
  const ref = await addDoc(
    col,
    omitUndefined({
      number: num,
      label: input.label?.trim() || undefined,
      area: input.area?.trim() || undefined,
      capacity: input.capacity && input.capacity > 0 ? Math.round(input.capacity) : 4,
      qrCodeSlug,
      status: 'available',
      acceptingOrders: true,
      active: true,
      createdAt: ts,
      updatedAt: ts,
    })
  );
  return ref.id;
}

export async function updateTable(
  enterpriseId: string,
  tableId: string,
  input: Partial<
    Pick<DiningTable, 'number' | 'label' | 'area' | 'capacity' | 'active' | 'acceptingOrders'>
  >
): Promise<void> {
  const ref = doc(enterpriseCollection(enterpriseId, 'tables'), tableId);
  const patch: Record<string, unknown> = {
    ...input,
    updatedAt: nowIso(),
  };
  if (input.number) {
    patch.number = input.number.trim();
    patch.qrCodeSlug = normalizeTableCode(`mesa-${input.number.trim()}`);
  }
  await updateDoc(ref, omitUndefined(patch) as Record<string, any>);
}

export async function deactivateTable(enterpriseId: string, tableId: string): Promise<void> {
  await updateTable(enterpriseId, tableId, { active: false });
}

export async function setEnterpriseTableOrdersEnabled(
  enterpriseId: string,
  enabled: boolean
): Promise<void> {
  await updateDoc(enterpriseDoc(enterpriseId), {
    'onlineStore.acceptTableOrders': enabled,
    updatedAt: nowIso(),
  });
}

function resolveProductUnitCost(productId: string, productsById: Map<string, Product>): number {
  const prod = productsById.get(productId);
  if (!prod) return 0;
  if (typeof prod.costPrice === 'number' && prod.costPrice > 0) {
    return roundMoney(prod.costPrice);
  }
  if (prod.isCombo && Array.isArray(prod.comboItems) && prod.comboItems.length > 0) {
    const sum = prod.comboItems.reduce((acc, ci) => {
      const comp = productsById.get(ci.productId);
      return acc + Number(comp?.costPrice || 0) * Number(ci.qty || 1);
    }, 0);
    return roundMoney(sum);
  }
  return 0;
}

// ----------------------------------------------------------------------
// Waiter Operations: Open Individual Comanda, Submit Order & Close Comanda
// ----------------------------------------------------------------------

export async function openNewTableSession(
  enterpriseId: string,
  params: {
    table: DiningTable;
    customerName: string;
    customerPhone?: string;
    waiterUid: string;
    waiterName: string;
  }
): Promise<string> {
  const { table, customerName, customerPhone, waiterUid, waiterName } = params;
  const cleanName = customerName.trim();
  if (!cleanName) {
    throw new Error('Informe o nome da comanda (ex.: João, Maria).');
  }

  const ts = nowIso();
  const wb = writeBatch(FIRESTORE);
  const sessionRef = doc(enterpriseCollection(enterpriseId, 'tableSessions'));
  const tableRef = doc(enterpriseCollection(enterpriseId, 'tables'), table.id);

  wb.set(
    sessionRef,
    omitUndefined({
      tableId: table.id,
      tableNumber: table.number,
      status: 'open',
      openedByType: 'waiter',
      waiterUid,
      waiterName,
      customerName: cleanName,
      customerPhone: customerPhone?.trim() || undefined,
      orderIds: [],
      subtotal: 0,
      total: 0,
      openedAt: ts,
      updatedAt: ts,
    })
  );

  wb.update(tableRef, {
    status: 'occupied',
    activeSessionId: table.activeSessionId || sessionRef.id,
    waiterUid: table.waiterUid || waiterUid,
    waiterName: table.waiterName || waiterName,
    customerName: table.customerName || cleanName,
    updatedAt: ts,
  });

  await wb.commit();
  return sessionRef.id;
}

export async function submitWaiterTableOrder(
  enterpriseId: string,
  params: {
    table: DiningTable;
    activeSession?: TableSession | null;
    waiterUid: string;
    waiterName: string;
    customerName?: string;
    customerPhone?: string;
    items: OnlineOrderItem[];
    notes?: string;
  }
): Promise<{ orderId: string; sessionId: string; code: string }> {
  const {
    table,
    activeSession,
    waiterUid,
    waiterName,
    customerName,
    customerPhone,
    items,
    notes,
  } = params;
  if (!items.length) {
    throw new Error('Adicione pelo menos um item ao pedido da mesa.');
  }

  // Regra de ouro: exige caixa aberto para iniciar qualquer venda/pedido de mesa
  const cashSnap = await getDocs(enterpriseCollection(enterpriseId, 'cashSessions'));
  const hasOpenCash = cashSnap.docs.some((d) => String(d.data()?.status || '') === 'open');
  if (!hasOpenCash) {
    throw new Error('Abra o caixa (/dashboard/cash) antes de lançar pedidos na mesa.');
  }

  const ts = nowIso();
  const orderSubtotal = roundMoney(items.reduce((acc, i) => acc + Number(i.lineTotal || 0), 0));
  const code = generateTableOrderCode(table.number);

  const wb = writeBatch(FIRESTORE);
  const orderRef = doc(enterpriseCollection(enterpriseId, 'onlineOrders'));
  const tableRef = doc(enterpriseCollection(enterpriseId, 'tables'), table.id);

  const linkedCustomerName =
    activeSession?.customerName || customerName?.trim() || table.customerName;
  const linkedCustomerPhone =
    activeSession?.customerPhone || customerPhone?.trim() || table.customerPhone;

  let sessionId = activeSession?.id || '';
  if (activeSession) {
    const sessionRef = doc(enterpriseCollection(enterpriseId, 'tableSessions'), activeSession.id);
    const nextSubtotal = roundMoney(activeSession.subtotal + orderSubtotal);
    wb.update(
      sessionRef,
      omitUndefined({
        orderIds: [...activeSession.orderIds, orderRef.id],
        subtotal: nextSubtotal,
        total: nextSubtotal,
        waiterUid: activeSession.waiterUid || waiterUid,
        waiterName: activeSession.waiterName || waiterName,
        customerName: linkedCustomerName || undefined,
        customerPhone: linkedCustomerPhone || undefined,
        updatedAt: ts,
      }) as Record<string, any>
    );
  } else {
    const sessionRef = doc(enterpriseCollection(enterpriseId, 'tableSessions'));
    sessionId = sessionRef.id;
    wb.set(
      sessionRef,
      omitUndefined({
        tableId: table.id,
        tableNumber: table.number,
        status: 'open',
        openedByType: 'waiter',
        waiterUid,
        waiterName,
        customerName: linkedCustomerName || undefined,
        customerPhone: linkedCustomerPhone || undefined,
        orderIds: [orderRef.id],
        subtotal: orderSubtotal,
        total: orderSubtotal,
        openedAt: ts,
        updatedAt: ts,
      })
    );
  }

  wb.set(
    orderRef,
    omitUndefined({
      code,
      status: 'accepted',
      fulfillmentStatus: 'preparing',
      customerName: linkedCustomerName
        ? `Mesa ${table.number} · ${linkedCustomerName}`
        : `Mesa ${table.number}`,
      customerPhone: linkedCustomerPhone || '',
      deliveryType: 'table',
      deliveryFee: 0,
      paymentMethod: 'cash',
      paymentChannel: 'on_delivery',
      paymentStatus: 'pay_on_delivery',
      orderSource: 'waiter',
      requestedByType: 'waiter',
      tableId: table.id,
      tableNumber: table.number,
      tableSessionId: sessionId,
      waiterUid,
      waiterName,
      items,
      subtotal: orderSubtotal,
      total: orderSubtotal,
      notes: notes?.trim() || undefined,
      acceptedByUid: waiterUid,
      acceptedAt: ts,
      preparingAt: ts,
      createdAt: ts,
      updatedAt: ts,
    })
  );

  wb.update(tableRef, {
    status: 'occupied',
    activeSessionId: table.activeSessionId || sessionId,
    waiterUid: table.waiterUid || waiterUid,
    waiterName: table.waiterName || waiterName,
    updatedAt: ts,
  });

  await wb.commit();
  return { orderId: orderRef.id, sessionId, code };
}

export async function closeTableSession(
  enterpriseId: string,
  params: {
    table: DiningTable;
    session: TableSession;
    remainingOpenSessions?: TableSession[];
    sessionOrders: Array<{
      id: string;
      items: OnlineOrderItem[];
      total: number;
    }>;
    products?: Product[];
    paymentMethod: OnlinePayOnDeliveryMethod;
    includeServiceFee: boolean;
    closedByUid: string;
    closedByEmail?: string;
    closedByName: string;
  }
): Promise<{ saleId: string }> {
  const {
    table,
    session,
    remainingOpenSessions = [],
    sessionOrders,
    products = [],
    paymentMethod,
    includeServiceFee,
    closedByUid,
    closedByEmail,
    closedByName,
  } = params;

  // Check open cash session
  const cashSnap = await getDocs(enterpriseCollection(enterpriseId, 'cashSessions'));
  const openCash = cashSnap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        status: String(data.status || ''),
        openedAt: String(data.openedAt || ''),
      };
    })
    .filter((s) => s.status === 'open')
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0];

  if (!openCash) {
    throw new Error('Abra o caixa antes de encerrar a comanda.');
  }

  const ts = nowIso();
  const allItems = sessionOrders.flatMap((o) => o.items);
  const productsById = new Map<string, Product>();
  products.forEach((p) => productsById.set(p.id, p));

  const persistedItems = allItems.map((item) => {
    const unitCost = resolveProductUnitCost(item.productId, productsById);
    return {
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      unit: item.unit,
      qty: item.qty,
      unitPrice: item.unitPrice,
      unitCost,
      lineTotal: item.lineTotal,
    };
  });

  const subtotal = roundMoney(
    sessionOrders.length > 0
      ? sessionOrders.reduce((acc, o) => acc + Number(o.total || 0), 0)
      : session.subtotal
  );
  const serviceFeePercent = includeServiceFee ? 10 : 0;
  const serviceFeeAmount = includeServiceFee ? roundMoney(subtotal * 0.1) : 0;
  const total = roundMoney(subtotal + serviceFeeAmount);
  const totalCost = roundMoney(
    persistedItems.reduce((acc, item) => acc + item.unitCost * Number(item.qty || 0), 0)
  );
  const grossProfit = roundMoney(total - totalCost);

  const wb = writeBatch(FIRESTORE);
  const saleRef = doc(enterpriseCollection(enterpriseId, 'sales'));

  wb.set(
    saleRef,
    omitUndefined({
      code: generateSaleCode(),
      customerName: session.customerName
        ? `Mesa ${table.number} · ${session.customerName}`
        : `Mesa ${table.number}`,
      customerPhone: session.customerPhone || '',
      sellerUid: closedByUid,
      sellerEmail: closedByEmail || undefined,
      items: persistedItems,
      subtotal,
      discountAmount: 0,
      discountPercent: 0,
      deliveryFee: serviceFeeAmount,
      total,
      totalCost,
      grossProfit,
      payments: [{ method: paymentMethod, amount: total }],
      paidAmount: total,
      changeAmount: 0,
      deliveryType: 'pickup',
      notes: includeServiceFee
        ? `Mesa ${table.number}${session.customerName ? ` (${session.customerName})` : ''} · Garçom: ${closedByName} · Taxa de serviço 10% (${serviceFeeAmount.toFixed(2)})`
        : `Mesa ${table.number}${session.customerName ? ` (${session.customerName})` : ''} · Garçom: ${closedByName}`,
      channel: 'table',
      tableId: table.id,
      tableNumber: table.number,
      tableSessionId: session.id,
      cashSessionId: openCash.id,
      status: 'completed',
      createdAt: ts,
      updatedAt: ts,
    })
  );

  // Mark all session orders as delivered / finished in Kanban
  sessionOrders.forEach((ord) => {
    const orderRef = doc(enterpriseCollection(enterpriseId, 'onlineOrders'), ord.id);
    wb.update(orderRef, {
      fulfillmentStatus: 'delivered',
      saleId: saleRef.id,
      cashSessionId: openCash.id,
      deliveredAt: ts,
      updatedAt: ts,
    });
  });

  // Close this table session
  const sessionRef = doc(enterpriseCollection(enterpriseId, 'tableSessions'), session.id);
  wb.update(sessionRef, {
    status: 'closed',
    subtotal,
    serviceFeePercent,
    serviceFeeAmount,
    total,
    saleId: saleRef.id,
    cashSessionId: openCash.id,
    closedAt: ts,
    updatedAt: ts,
  });

  // Keep table occupied if other individual comandas are still open; otherwise free table
  const tableRef = doc(enterpriseCollection(enterpriseId, 'tables'), table.id);
  const nextRemaining = remainingOpenSessions.find((s) => s.id !== session.id);
  if (nextRemaining) {
    wb.update(tableRef, {
      status: 'occupied',
      activeSessionId: nextRemaining.id,
      customerName: nextRemaining.customerName || '',
      customerPhone: nextRemaining.customerPhone || '',
      waiterUid: nextRemaining.waiterUid || '',
      waiterName: nextRemaining.waiterName || '',
      updatedAt: ts,
    });
  } else {
    wb.update(tableRef, {
      status: 'available',
      activeSessionId: '',
      waiterUid: '',
      waiterName: '',
      customerName: '',
      customerPhone: '',
      updatedAt: ts,
    });
  }

  await wb.commit();
  return { saleId: saleRef.id };
}

/**
 * Monta um objeto Sale compatível com o ReceiptDialog (58mm/80mm/PDF)
 * para imprimir a conferência / comanda da mesa ou de um pedido individual.
 */
export function buildTableReceiptSale(params: {
  code: string;
  tableNumber: string;
  comandaName?: string;
  customerPhone?: string;
  waiterName?: string;
  items: OnlineOrderItem[];
  includeServiceFee?: boolean;
  paymentMethod?: OnlinePayOnDeliveryMethod;
  notes?: string;
  createdAt?: string;
}): Sale {
  const {
    code,
    tableNumber,
    comandaName,
    customerPhone,
    waiterName,
    items,
    includeServiceFee = false,
    paymentMethod = 'cash',
    notes,
    createdAt,
  } = params;

  const subtotal = roundMoney(items.reduce((acc, i) => acc + Number(i.lineTotal || 0), 0));
  const serviceFee = includeServiceFee ? roundMoney(subtotal * 0.1) : 0;
  const total = roundMoney(subtotal + serviceFee);
  const ts = createdAt || nowIso();

  return {
    id: code,
    code,
    customerName: comandaName ? `Mesa ${tableNumber} · ${comandaName}` : `Mesa ${tableNumber}`,
    customerPhone: customerPhone || undefined,
    sellerUid: '',
    sellerEmail: waiterName ? `Garçom: ${waiterName}` : undefined,
    items: items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      unit: item.unit || 'un',
      qty: item.qty,
      unitPrice: item.unitPrice,
      unitCost: 0,
      lineTotal: item.lineTotal,
    })),
    subtotal,
    discountAmount: 0,
    discountPercent: 0,
    deliveryFee: serviceFee,
    total,
    totalCost: 0,
    grossProfit: total,
    payments: [{ method: paymentMethod, amount: total }],
    paidAmount: total,
    changeAmount: 0,
    deliveryType: 'pickup',
    notes:
      notes ||
      (includeServiceFee
        ? `Conferência Mesa ${tableNumber}${comandaName ? ` (${comandaName})` : ''} · Inclui 10% serviço`
        : `Conferência Mesa ${tableNumber}${comandaName ? ` (${comandaName})` : ''}`),
    status: 'completed',
    createdAt: ts,
    updatedAt: ts,
  };
}

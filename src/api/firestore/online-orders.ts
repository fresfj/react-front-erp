import type { Unsubscribe } from 'firebase/firestore';

import { httpsCallable } from 'firebase/functions';
import {
  doc,
  query,
  getDocs,
  orderBy,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';

import { FUNCTIONS } from 'src/lib/firebase';

import { enterpriseCollection } from './paths';

import type {
  OnlineStoreConfig,
  OnlinePayOnDeliveryMethod,
} from './platform';

// ----------------------------------------------------------------------

export type { OnlineStoreConfig, OnlinePayOnDeliveryMethod };

export type OnlineOrderStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export type OnlineOrderFulfillmentStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'rejected'
  | 'cancelled';

export type OnlineOrderItem = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string;
};

export type OnlineOrderPaymentChannel = 'online' | 'on_delivery';
export type OnlineOrderPaymentStatus = 'awaiting_confirmation' | 'confirmed' | 'pay_on_delivery';

export type OnlineOrderDeliveryType = 'pickup' | 'delivery' | 'table';
export type OnlineOrderSource = 'online_catalog' | 'table_qr' | 'waiter';

export type OnlineOrder = {
  id: string;
  code: string;
  status: OnlineOrderStatus;
  fulfillmentStatus: OnlineOrderFulfillmentStatus;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryType: OnlineOrderDeliveryType;
  deliveryFee: number;
  paymentMethod: OnlinePayOnDeliveryMethod;
  paymentChannel: OnlineOrderPaymentChannel;
  paymentStatus: OnlineOrderPaymentStatus;
  pixConfirmedAt?: string;
  orderSource?: OnlineOrderSource;
  requestedByType?: 'customer' | 'waiter';
  tableId?: string;
  tableNumber?: string;
  tableSessionId?: string;
  waiterUid?: string;
  waiterName?: string;
  items: OnlineOrderItem[];
  subtotal: number;
  total: number;
  notes?: string;
  internalNotes?: string;
  cashSessionId?: string;
  saleId?: string;
  acceptedByUid?: string;
  rejectedReason?: string;
  acceptedAt?: string;
  preparingAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  rejectedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicStorefrontProduct = {
  id: string;
  name: string;
  category?: string;
  description?: string;
  salePrice: number;
  originalPrice?: number;
  promoActive?: boolean;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  servingTemperature?: 'none' | 'cold' | 'hot';
  isCombo?: boolean;
  comboItems?: Array<{ productId: string; productName: string; qty: number }>;
  servesCount?: number;
  featured?: boolean;
  imageUrl?: string;
};

export type PublicStorefront = {
  storeName: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  bannerFit?: 'cover' | 'contain';
  bannerPositionY?: number;
  logoFit?: 'cover' | 'contain';
  minOrderAmount?: number;
  isOpen: boolean;
  closedReason?: 'plan' | 'disabled' | 'outside_hours' | 'no_open_cash';
  openingHours?: Array<{ day: number; open: string; close: string; closed?: boolean }>;
  estimatedMinutes: number;
  deliveryFee: number;
  acceptDelivery: boolean;
  acceptPickup: boolean;
  acceptTableOrders?: boolean;
  paymentMethodsOnDelivery: OnlinePayOnDeliveryMethod[];
  acceptOnlinePix?: boolean;
  pixKey?: string;
  pixMerchantName?: string;
  pixMerchantCity?: string;
  whatsapp?: string;
  instagramUrl?: string;
  googleReviewUrl?: string;
  address?: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  products: PublicStorefrontProduct[];
};

export type PlaceOnlineOrderInput = {
  slug: string;
  items: Array<{
    productId: string;
    qty: number;
    unitPrice: number;
    notes?: string;
  }>;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerAddressFields?: {
    cep?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  deliveryType: OnlineOrderDeliveryType;
  tableCode?: string;
  paymentMethod: OnlinePayOnDeliveryMethod;
  paymentChannel?: OnlineOrderPaymentChannel;
  notes?: string;
  origin?: string;
};

export type PublicCustomerLookupResult = {
  found: boolean;
  customer?: {
    name: string;
    phone: string;
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
  };
};

export type PublicOrderTracking = {
  id: string;
  code: string;
  status: OnlineOrderStatus;
  fulfillmentStatus: OnlineOrderFulfillmentStatus;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryType: 'pickup' | 'delivery';
  deliveryFee: number;
  paymentMethod: OnlinePayOnDeliveryMethod;
  paymentChannel?: OnlineOrderPaymentChannel;
  paymentStatus?: OnlineOrderPaymentStatus;
  pixKey?: string;
  pixMerchantName?: string;
  pixMerchantCity?: string;
  items: OnlineOrderItem[];
  subtotal: number;
  total: number;
  notes?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
  storeName?: string;
  whatsapp?: string;
  googleReviewUrl?: string;
};

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

function mapOnlineOrderItem(raw: Record<string, unknown>): OnlineOrderItem {
  return {
    productId: String(raw.productId ?? ''),
    productName: String(raw.productName ?? ''),
    productSku: String(raw.productSku ?? ''),
    unit: String(raw.unit ?? 'un'),
    qty: Number(raw.qty ?? 0),
    unitPrice: Number(raw.unitPrice ?? 0),
    lineTotal: Number(raw.lineTotal ?? 0),
    notes: optStr(raw.notes),
  };
}

function mapStatus(raw: unknown): OnlineOrderStatus {
  if (raw === 'accepted' || raw === 'rejected' || raw === 'cancelled') return raw;
  return 'pending';
}

function mapPaymentMethod(raw: unknown): OnlinePayOnDeliveryMethod {
  if (raw === 'pix' || raw === 'debit_card' || raw === 'credit_card') return raw;
  return 'cash';
}

function mapFulfillmentStatus(
  raw: unknown,
  fallback: OnlineOrderStatus
): OnlineOrderFulfillmentStatus {
  if (
    raw === 'pending' ||
    raw === 'accepted' ||
    raw === 'preparing' ||
    raw === 'out_for_delivery' ||
    raw === 'delivered' ||
    raw === 'rejected' ||
    raw === 'cancelled'
  ) {
    return raw;
  }
  return fallback;
}

export function mapOnlineOrder(id: string, data: Record<string, unknown>): OnlineOrder {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const status = mapStatus(data.status);
  const paymentMethod = mapPaymentMethod(data.paymentMethod);
  const paymentChannel: OnlineOrderPaymentChannel =
    data.paymentChannel === 'online' ? 'online' : 'on_delivery';
  const paymentStatus: OnlineOrderPaymentStatus =
    data.paymentStatus === 'awaiting_confirmation' || data.paymentStatus === 'confirmed'
      ? data.paymentStatus
      : paymentChannel === 'online'
        ? status === 'accepted'
          ? 'confirmed'
          : 'awaiting_confirmation'
        : 'pay_on_delivery';

  return {
    id,
    code: String(data.code ?? ''),
    status,
    fulfillmentStatus: mapFulfillmentStatus(data.fulfillmentStatus, status),
    customerName: String(data.customerName ?? ''),
    customerPhone: String(data.customerPhone ?? ''),
    customerAddress: optStr(data.customerAddress),
    deliveryType:
      data.deliveryType === 'delivery'
        ? 'delivery'
        : data.deliveryType === 'table'
          ? 'table'
          : 'pickup',
    deliveryFee: Number(data.deliveryFee ?? 0),
    paymentMethod,
    paymentChannel,
    paymentStatus,
    pixConfirmedAt: optStr(data.pixConfirmedAt),
    orderSource:
      data.orderSource === 'table_qr' || data.orderSource === 'waiter'
        ? data.orderSource
        : 'online_catalog',
    requestedByType: data.requestedByType === 'waiter' ? 'waiter' : 'customer',
    tableId: optStr(data.tableId),
    tableNumber: optStr(data.tableNumber),
    tableSessionId: optStr(data.tableSessionId),
    waiterUid: optStr(data.waiterUid),
    waiterName: optStr(data.waiterName),
    items: rawItems.map((i) => mapOnlineOrderItem(i as Record<string, unknown>)),
    subtotal: Number(data.subtotal ?? 0),
    total: Number(data.total ?? 0),
    notes: optStr(data.notes),
    internalNotes: optStr(data.internalNotes),
    cashSessionId: optStr(data.cashSessionId),
    saleId: optStr(data.saleId),
    acceptedByUid: optStr(data.acceptedByUid),
    rejectedReason: optStr(data.rejectedReason),
    acceptedAt: optStr(data.acceptedAt),
    preparingAt: optStr(data.preparingAt),
    dispatchedAt: optStr(data.dispatchedAt),
    deliveredAt: optStr(data.deliveredAt),
    rejectedAt: optStr(data.rejectedAt),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export async function listOnlineOrders(enterpriseId: string): Promise<OnlineOrder[]> {
  const col = enterpriseCollection(enterpriseId, 'onlineOrders');
  const snap = await getDocs(query(col, orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => mapOnlineOrder(d.id, d.data() as Record<string, unknown>));
}

export function subscribeOnlineOrders(
  enterpriseId: string,
  cb: (rows: OnlineOrder[]) => void
): Unsubscribe {
  const col = enterpriseCollection(enterpriseId, 'onlineOrders');
  const q = query(col, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => mapOnlineOrder(d.id, d.data() as Record<string, unknown>)));
  });
}

export async function updateOnlineOrderInternalNotes(
  enterpriseId: string,
  orderId: string,
  internalNotes: string
): Promise<void> {
  const ref = doc(enterpriseCollection(enterpriseId, 'onlineOrders'), orderId);
  await updateDoc(ref, {
    internalNotes: internalNotes.trim(),
    updatedAt: new Date().toISOString(),
  });
}

async function call<TReq extends object, TRes>(name: string, data: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq, TRes>(FUNCTIONS, name);
  const result = await fn(data);
  return result.data;
}

export function getPublicStorefrontCf(slug: string): Promise<PublicStorefront> {
  return call<{ slug: string }, PublicStorefront>('getPublicStorefront', { slug });
}

export function placeOnlineOrderCf(
  input: PlaceOnlineOrderInput
): Promise<{ orderId: string; code: string }> {
  return call<PlaceOnlineOrderInput, { orderId: string; code: string }>('placeOnlineOrder', input);
}

export function acceptOnlineOrderCf(
  enterpriseId: string,
  orderId: string
): Promise<{ saleId: string }> {
  return call<{ enterpriseId: string; orderId: string }, { saleId: string }>('acceptOnlineOrder', {
    enterpriseId,
    orderId,
  });
}

export function rejectOnlineOrderCf(
  enterpriseId: string,
  orderId: string,
  reason?: string
): Promise<void> {
  return call<{ enterpriseId: string; orderId: string; reason?: string }, void>(
    'rejectOnlineOrder',
    { enterpriseId, orderId, reason }
  );
}

export function upsertOnlineStoreConfigCf(
  enterpriseId: string,
  config: OnlineStoreConfig
): Promise<void> {
  return call<{ enterpriseId: string; onlineStore: OnlineStoreConfig }, void>(
    'upsertOnlineStoreConfig',
    { enterpriseId, onlineStore: config }
  );
}

export function lookupPublicCustomerByPhoneCf(
  slug: string,
  phone: string
): Promise<PublicCustomerLookupResult> {
  return call<{ slug: string; phone: string }, PublicCustomerLookupResult>(
    'lookupPublicCustomerByPhone',
    { slug, phone }
  );
}

export function listPublicOrdersByPhoneCf(
  slug: string,
  phone: string
): Promise<{ orders: PublicOrderTracking[] }> {
  return call<{ slug: string; phone: string }, { orders: PublicOrderTracking[] }>(
    'listPublicOrdersByPhone',
    { slug, phone }
  );
}

export type PublicTableSessionOrder = {
  id: string;
  code: string;
  status: OnlineOrderStatus;
  fulfillmentStatus: OnlineOrderFulfillmentStatus;
  requestedByType: 'customer' | 'waiter';
  waiterName?: string;
  items: OnlineOrderItem[];
  subtotal: number;
  total: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicTableSessionStatus = {
  table: {
    id: string;
    number: string;
    label?: string;
    area?: string;
    qrCodeSlug: string;
    status: string;
    acceptingOrders?: boolean;
    acceptTableOrders?: boolean;
  };
  session: {
    id: string;
    status: 'open' | 'closed';
    customerName?: string;
    customerPhone?: string;
    waiterName?: string;
    subtotal: number;
    total: number;
    openedAt: string;
  } | null;
  orders: PublicTableSessionOrder[];
};

export function getPublicOrderStatusCf(
  slug: string,
  orderId: string
): Promise<{ order: PublicOrderTracking }> {
  return call<{ slug: string; orderId: string }, { order: PublicOrderTracking }>(
    'getPublicOrderStatus',
    { slug, orderId }
  );
}

export async function getPublicTableSessionStatusCf(
  slug: string,
  tableCode: string,
  customerPhone?: string
): Promise<PublicTableSessionStatus> {
  const res = await call<
    { slug: string; tableCode: string; customerPhone?: string },
    { tableStatus: PublicTableSessionStatus }
  >('getPublicOrderStatus', { slug, tableCode, customerPhone });
  return res.tableStatus;
}

export function updateOnlineOrderStatusCf(
  enterpriseId: string,
  orderId: string,
  fulfillmentStatus: 'accepted' | 'preparing' | 'out_for_delivery' | 'delivered'
): Promise<{ fulfillmentStatus: OnlineOrderFulfillmentStatus }> {
  return call<
    {
      enterpriseId: string;
      orderId: string;
      fulfillmentStatus: 'accepted' | 'preparing' | 'out_for_delivery' | 'delivered';
    },
    { fulfillmentStatus: OnlineOrderFulfillmentStatus }
  >('updateOnlineOrderStatus', { enterpriseId, orderId, fulfillmentStatus });
}

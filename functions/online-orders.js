const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

// ----------------------------------------------------------------------

function db() {
  return getFirestore();
}

function nowIso() {
  return new Date().toISOString();
}

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function normalizeStoreSlug(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function partsInZone(now, timeZone) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(now);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[weekday] ?? now.getUTCDay();
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = timeParts.find((p) => p.type === 'hour')?.value || '00';
  const minute = timeParts.find((p) => p.type === 'minute')?.value || '00';
  return { day, hhmm: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` };
}

function isWithinOpeningHours(hours, now, timeZone = 'America/Sao_Paulo') {
  const list = Array.isArray(hours) ? hours : [];
  const { day, hhmm } = partsInZone(now, timeZone);
  const entry = list.find((h) => Number(h.day) === day);
  if (!entry || entry.closed) return false;
  return hhmm >= String(entry.open || '') && hhmm <= String(entry.close || '');
}

function resolveOnlineStoreOpen(input) {
  if (!input.hasEntitlement) return { isOpen: false, closedReason: 'plan' };
  if (!input.enabled) return { isOpen: false, closedReason: 'disabled' };
  if (!isWithinOpeningHours(input.hours, input.now, input.timeZone)) {
    return { isOpen: false, closedReason: 'outside_hours' };
  }
  if (!input.hasOpenCash) return { isOpen: false, closedReason: 'no_open_cash' };
  return { isOpen: true };
}

function buildOnlineOrderTotals(items, deliveryFee) {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0)
  );
  return { subtotal, total: roundMoney(subtotal + Number(deliveryFee || 0)) };
}

function planHasOnlineOrders(plan) {
  if (!plan) return false;
  const entitlements = Array.isArray(plan.entitlements) ? plan.entitlements : [];
  if (entitlements.includes('online_orders')) return true;
  const code = String(plan.code || '');
  return code === 'pro' || code === 'ultra';
}

async function getOpenCashSession(enterpriseId) {
  const snap = await db().collection(`enterprises/${enterpriseId}/cashSessions`).get();
  const open = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.status === 'open')
    .sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || '')));
  return open[0] || null;
}

async function loadPlanForEnterprise(enterprise) {
  const sub = enterprise.subscription || {};
  if (sub.planId) {
    const snap = await db().doc(`plans/${sub.planId}`).get();
    if (snap.exists) return { id: snap.id, ...snap.data() };
  }
  const code = sub.planCode || 'free';
  const q = await db().collection('plans').where('code', '==', code).limit(1).get();
  if (!q.empty) return { id: q.docs[0].id, ...q.docs[0].data() };
  return { code, entitlements: [] };
}

async function loadStoreContextBySlug(slug) {
  const normalized = normalizeStoreSlug(slug);
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'slug is required');
  }
  const indexSnap = await db().doc(`publicStoreIndex/${normalized}`).get();
  if (!indexSnap.exists) {
    throw new HttpsError('not-found', 'Store not found');
  }
  const enterpriseId = String(indexSnap.data().enterpriseId || '');
  if (!enterpriseId) {
    throw new HttpsError('not-found', 'Store not found');
  }
  const entSnap = await db().doc(`enterprises/${enterpriseId}`).get();
  if (!entSnap.exists) {
    throw new HttpsError('not-found', 'Store not found');
  }
  const enterprise = { id: entSnap.id, ...entSnap.data() };
  const onlineStore = enterprise.onlineStore || {};
  const plan = await loadPlanForEnterprise(enterprise);
  const openCash = await getOpenCashSession(enterpriseId);
  const openState = resolveOnlineStoreOpen({
    hasEntitlement: planHasOnlineOrders(plan),
    enabled: onlineStore.enabled === true,
    hours: onlineStore.openingHours || [],
    now: new Date(),
    hasOpenCash: Boolean(openCash),
    timeZone: 'America/Sao_Paulo',
  });
  return {
    slug: normalized,
    enterpriseId,
    enterprise,
    onlineStore,
    plan,
    openCash,
    ...openState,
  };
}

function assertTenantPosAccess(request, enterpriseId) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  if (request.auth.token.platformAdmin === true) return;
  if (request.auth.token.enterpriseId !== enterpriseId) {
    throw new HttpsError('permission-denied', 'Wrong enterprise');
  }
  const role = request.auth.token.role;
  if (role === 'admin' || role === 'gestor' || role === 'operador') return;
  throw new HttpsError('permission-denied', 'Insufficient role');
}

function assertTenantAdminOrGestor(request, enterpriseId) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  if (request.auth.token.platformAdmin === true) return;
  const ok =
    request.auth.token.enterpriseId === enterpriseId &&
    (request.auth.token.role === 'admin' || request.auth.token.role === 'gestor');
  if (!ok) {
    throw new HttpsError('permission-denied', 'admin or gestor required');
  }
}

function generateOrderCode() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OL-${ymd}-${suffix}`;
}

function generateSaleCode() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VD-${ymd}-${suffix}`;
}

async function pickFifoBatch(enterpriseId, productId, neededQty) {
  const snap = await db()
    .collection(`enterprises/${enterpriseId}/batches`)
    .where('productId', '==', productId)
    .get();
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => b.active !== false && Number(b.remainingQty || 0) > 0)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const batch = rows[0];
  if (!batch) return null;
  if (Number(batch.remainingQty) < neededQty) return batch;
  return batch;
}

exports.getPublicStorefront = onCall(async (request) => {
  const slug = normalizeStoreSlug(request.data?.slug);
  const ctx = await loadStoreContextBySlug(slug);
  const productsSnap = await db().collection(`enterprises/${ctx.enterpriseId}/products`).get();
  const products = productsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.active !== false && p.showOnline === true && p.type === 'finished')
    .map((p) => ({
      id: p.id,
      name: String(p.name || ''),
      category: p.category != null ? String(p.category) : undefined,
      description: p.description != null ? String(p.description) : undefined,
      salePrice: Number(p.salePrice || 0),
      imageUrl: p.imageUrl != null ? String(p.imageUrl) : undefined,
    }));

  const store = ctx.onlineStore || {};
  return {
    storeName: String(ctx.enterprise.tradeName || ctx.enterprise.name || ''),
    isOpen: ctx.isOpen,
    closedReason: ctx.closedReason,
    estimatedMinutes: Number(store.estimatedMinutes || 40),
    deliveryFee: Number(store.defaultDeliveryFee ?? ctx.enterprise.defaultDeliveryFee ?? 0),
    acceptDelivery: store.acceptDelivery !== false,
    acceptPickup: store.acceptPickup !== false,
    paymentMethodsOnDelivery: Array.isArray(store.paymentMethodsOnDelivery)
      ? store.paymentMethodsOnDelivery
      : ['cash', 'pix', 'debit_card', 'credit_card'],
    whatsapp: store.whatsapp != null ? String(store.whatsapp) : undefined,
    products,
  };
});

exports.placeOnlineOrder = onCall(async (request) => {
  const slug = normalizeStoreSlug(request.data?.slug);
  const ctx = await loadStoreContextBySlug(slug);
  if (!ctx.isOpen) {
    throw new HttpsError('failed-precondition', ctx.closedReason || 'store_closed');
  }

  const deliveryType = request.data?.deliveryType === 'delivery' ? 'delivery' : 'pickup';
  const paymentMethod = String(request.data?.paymentMethod || 'cash');
  if (!['cash', 'pix', 'debit_card', 'credit_card'].includes(paymentMethod)) {
    throw new HttpsError('invalid-argument', 'Invalid paymentMethod');
  }

  const customerName = String(request.data?.customerName || '').trim();
  const customerPhone = String(request.data?.customerPhone || '').trim();
  if (!customerName || !customerPhone) {
    throw new HttpsError('invalid-argument', 'customerName and customerPhone required');
  }

  const rawItems = Array.isArray(request.data?.items) ? request.data.items : [];
  if (rawItems.length === 0) {
    throw new HttpsError('invalid-argument', 'items required');
  }

  const store = ctx.onlineStore || {};
  if (deliveryType === 'delivery' && store.acceptDelivery === false) {
    throw new HttpsError('failed-precondition', 'delivery_disabled');
  }
  if (deliveryType === 'pickup' && store.acceptPickup === false) {
    throw new HttpsError('failed-precondition', 'pickup_disabled');
  }

  const deliveryFee =
    deliveryType === 'delivery'
      ? Number(store.defaultDeliveryFee ?? ctx.enterprise.defaultDeliveryFee ?? 0)
      : 0;

  const validatedItems = [];
  for (const line of rawItems) {
    const productId = String(line.productId || '');
    const qty = Number(line.qty || 0);
    if (!productId || !(qty > 0)) {
      throw new HttpsError('invalid-argument', 'Invalid item');
    }
    const prodSnap = await db().doc(`enterprises/${ctx.enterpriseId}/products/${productId}`).get();
    if (!prodSnap.exists) {
      throw new HttpsError('failed-precondition', 'product_missing');
    }
    const product = prodSnap.data() || {};
    if (product.active === false || product.showOnline !== true || product.type !== 'finished') {
      throw new HttpsError('failed-precondition', 'product_unavailable');
    }
    const serverPrice = Number(product.salePrice || 0);
    const clientPrice = Number(line.unitPrice);
    if (Number.isFinite(clientPrice) && Math.abs(clientPrice - serverPrice) > 0.009) {
      throw new HttpsError('failed-precondition', 'price_changed');
    }
    validatedItems.push({
      productId,
      productName: String(product.name || ''),
      productSku: String(product.sku || ''),
      unit: String(product.unit || 'un'),
      qty,
      unitPrice: serverPrice,
      lineTotal: roundMoney(qty * serverPrice),
      notes: line.notes != null ? String(line.notes) : undefined,
    });
  }

  const { subtotal, total } = buildOnlineOrderTotals(validatedItems, deliveryFee);
  const code = generateOrderCode();
  const timestamp = nowIso();
  const ref = db().collection(`enterprises/${ctx.enterpriseId}/onlineOrders`).doc();
  const docData = {
    code,
    status: 'pending',
    customerName,
    customerPhone,
    customerAddress:
      request.data?.customerAddress != null ? String(request.data.customerAddress) : null,
    deliveryType,
    deliveryFee,
    paymentMethod,
    items: validatedItems,
    subtotal,
    total,
    notes: request.data?.notes != null ? String(request.data.notes) : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  Object.keys(docData).forEach((k) => {
    if (docData[k] === null || docData[k] === undefined) delete docData[k];
  });
  await ref.set(docData);
  return { orderId: ref.id, code };
});

exports.upsertOnlineStoreConfig = onCall(async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  if (!enterpriseId) throw new HttpsError('invalid-argument', 'enterpriseId required');
  assertTenantAdminOrGestor(request, enterpriseId);

  const onlineStore = request.data?.onlineStore || {};
  const slug = normalizeStoreSlug(onlineStore.slug);
  if (!slug) throw new HttpsError('invalid-argument', 'slug required');

  const indexRef = db().doc(`publicStoreIndex/${slug}`);
  const indexSnap = await indexRef.get();
  if (indexSnap.exists && String(indexSnap.data().enterpriseId) !== enterpriseId) {
    throw new HttpsError('already-exists', 'Slug already in use');
  }

  const entRef = db().doc(`enterprises/${enterpriseId}`);
  const entSnap = await entRef.get();
  if (!entSnap.exists) throw new HttpsError('not-found', 'Enterprise not found');
  const prevSlug = normalizeStoreSlug(entSnap.data()?.onlineStore?.slug || '');

  const payload = {
    enabled: onlineStore.enabled === true,
    slug,
    openingHours: Array.isArray(onlineStore.openingHours) ? onlineStore.openingHours : [],
    estimatedMinutes: Number(onlineStore.estimatedMinutes || 40),
    acceptDelivery: onlineStore.acceptDelivery !== false,
    acceptPickup: onlineStore.acceptPickup !== false,
    defaultDeliveryFee: Number(onlineStore.defaultDeliveryFee || 0),
    paymentMethodsOnDelivery: Array.isArray(onlineStore.paymentMethodsOnDelivery)
      ? onlineStore.paymentMethodsOnDelivery
      : ['cash', 'pix'],
    whatsapp: onlineStore.whatsapp != null ? String(onlineStore.whatsapp) : null,
  };
  if (payload.whatsapp === null) delete payload.whatsapp;

  const batch = db().batch();
  if (prevSlug && prevSlug !== slug) {
    batch.delete(db().doc(`publicStoreIndex/${prevSlug}`));
  }
  batch.set(indexRef, { enterpriseId, updatedAt: nowIso() }, { merge: true });
  batch.set(
    entRef,
    { onlineStore: payload, updatedAt: nowIso() },
    { merge: true }
  );
  await batch.commit();
});

exports.acceptOnlineOrder = onCall(async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  const orderId = String(request.data?.orderId || '').trim();
  if (!enterpriseId || !orderId) {
    throw new HttpsError('invalid-argument', 'enterpriseId and orderId required');
  }
  assertTenantPosAccess(request, enterpriseId);

  const orderRef = db().doc(`enterprises/${enterpriseId}/onlineOrders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found');
  const order = orderSnap.data() || {};
  if (order.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Order is not pending');
  }

  const openCash = await getOpenCashSession(enterpriseId);
  if (!openCash) {
    throw new HttpsError('failed-precondition', 'no_open_cash');
  }

  const timestamp = nowIso();
  const saleRef = db().collection(`enterprises/${enterpriseId}/sales`).doc();
  const saleCode = generateSaleCode();
  const items = Array.isArray(order.items) ? order.items : [];

  const batch = db().batch();
  const persistedItems = [];

  for (const item of items) {
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice || 0);
    let unitCost = 0;
    let batchId;
    let lotCode;
    let remaining;

    const fifo = await pickFifoBatch(enterpriseId, item.productId, qty);
    if (fifo) {
      batchId = fifo.id;
      lotCode = fifo.lotCode != null ? String(fifo.lotCode) : undefined;
      unitCost = Number(fifo.unitCost ?? fifo.costPrice ?? 0);
      remaining = Math.max(0, Number(fifo.remainingQty || 0) - qty);
      batch.update(db().doc(`enterprises/${enterpriseId}/batches/${fifo.id}`), {
        remainingQty: remaining,
        updatedAt: timestamp,
      });
    } else {
      const prodSnap = await db()
        .doc(`enterprises/${enterpriseId}/products/${item.productId}`)
        .get();
      unitCost = Number(prodSnap.data()?.costPrice || 0);
    }

    const movRef = db().collection(`enterprises/${enterpriseId}/stockMovements`).doc();
    batch.set(movRef, {
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      unit: item.unit,
      batchId: batchId || null,
      lotCode: lotCode || null,
      type: 'OUT',
      qty,
      unitCost,
      reason: `Online order ${order.code}`,
      refId: saleRef.id,
      createdBy: request.auth.uid,
      createdAt: timestamp,
    });

    persistedItems.push({
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      unit: item.unit,
      qty,
      unitPrice,
      unitCost,
      lineTotal: Number(item.lineTotal || roundMoney(qty * unitPrice)),
      ...(batchId ? { batchId } : {}),
      ...(lotCode ? { lotCode } : {}),
    });
  }

  const totalCost = roundMoney(persistedItems.reduce((s, i) => s + i.unitCost * i.qty, 0));
  const total = Number(order.total || 0);

  batch.set(saleRef, {
    code: saleCode,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress || null,
    sellerUid: request.auth.uid,
    sellerEmail: request.auth.token.email || null,
    items: persistedItems,
    subtotal: Number(order.subtotal || 0),
    discountAmount: 0,
    discountPercent: 0,
    total,
    totalCost,
    grossProfit: roundMoney(total - totalCost),
    payments: [{ method: order.paymentMethod || 'cash', amount: total }],
    paidAmount: total,
    changeAmount: 0,
    deliveryType: order.deliveryType || 'pickup',
    deliveryAddress: order.customerAddress || null,
    deliveryFee: Number(order.deliveryFee || 0),
    notes: order.notes || null,
    channel: 'online',
    onlineOrderId: orderId,
    cashSessionId: openCash.id,
    status: 'completed',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  batch.update(orderRef, {
    status: 'accepted',
    saleId: saleRef.id,
    cashSessionId: openCash.id,
    acceptedByUid: request.auth.uid,
    updatedAt: timestamp,
  });

  await batch.commit();
  return { saleId: saleRef.id };
});

exports.rejectOnlineOrder = onCall(async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  const orderId = String(request.data?.orderId || '').trim();
  if (!enterpriseId || !orderId) {
    throw new HttpsError('invalid-argument', 'enterpriseId and orderId required');
  }
  assertTenantPosAccess(request, enterpriseId);

  const orderRef = db().doc(`enterprises/${enterpriseId}/onlineOrders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found');
  if (orderSnap.data()?.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Order is not pending');
  }

  const update = {
    status: 'rejected',
    updatedAt: nowIso(),
  };
  if (request.data?.reason != null) {
    update.rejectedReason = String(request.data.reason);
  }
  await orderRef.update(update);
});

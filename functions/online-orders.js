const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

const {
  formatCurrencyBrl,
  formatOrderItemsText,
  dispatchEnterpriseWhatsappEvent,
} = require('./whatsapp/whatsapp-service');

// ----------------------------------------------------------------------

let _firestore;

function db() {
  if (!_firestore) {
    _firestore = getFirestore();
    try {
      _firestore.settings({ ignoreUndefinedProperties: true });
    } catch {
      // already initialized
    }
  }
  return _firestore;
}

function nowIso() {
  return new Date().toISOString();
}

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function normalizeAreaTextServer(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFirstName(value) {
  const withoutTable = String(value ?? '').replace(/^mesa\s+\S+\s*[·•-]\s*/i, '').trim();
  const clean = normalizeAreaTextServer(withoutTable);
  return clean.split(' ')[0] || '';
}

function calculateHaversineKmServer(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function sanitizeDeliveryArea(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const mode = raw.mode === 'radius' || raw.mode === 'neighborhood' ? raw.mode : 'fixed';
  const radiusTiers = Array.isArray(raw.radiusTiers)
    ? raw.radiusTiers
        .filter((t) => t && typeof t === 'object')
        .slice(0, 20)
        .map((t, idx) => ({
          id: String(t.id || `tier-${idx + 1}`),
          maxKm: Math.max(0.1, Number(t.maxKm || 0)),
          fee: Math.max(0, roundMoney(Number(t.fee || 0))),
          estimatedMinutes: Math.max(1, Math.round(Number(t.estimatedMinutes || 35))),
          active: t.active !== false,
          color: t.color ? String(t.color).slice(0, 24) : undefined,
        }))
    : [];
  const neighborhoods = Array.isArray(raw.neighborhoods)
    ? raw.neighborhoods
        .filter((n) => n && typeof n === 'object' && String(n.name || '').trim() !== '')
        .slice(0, 200)
        .map((n, idx) => ({
          id: String(n.id || `nb-${idx + 1}`),
          name: String(n.name || '').trim().slice(0, 120),
          city: n.city ? String(n.city).trim().slice(0, 120) : undefined,
          fee: Math.max(0, roundMoney(Number(n.fee || 0))),
          estimatedMinutes: Math.max(1, Math.round(Number(n.estimatedMinutes || 35))),
          active: n.active !== false,
        }))
    : [];
  const out = {
    mode,
    distanceFactor:
      typeof raw.distanceFactor === 'number' && Number.isFinite(raw.distanceFactor) && raw.distanceFactor >= 1
        ? raw.distanceFactor
        : 1.25,
    radiusTiers,
    neighborhoods,
    blockOutsideArea: raw.blockOutsideArea !== false,
  };
  if (typeof raw.originLat === 'number' && Number.isFinite(raw.originLat)) {
    out.originLat = raw.originLat;
  }
  if (typeof raw.originLng === 'number' && Number.isFinite(raw.originLng)) {
    out.originLng = raw.originLng;
  }
  if (raw.originLabel) {
    out.originLabel = String(raw.originLabel).trim().slice(0, 240);
  }
  return out;
}

function sanitizeLoyaltyConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      enabled: false,
      stampsGoal: 10,
      reaisPerPoint: 10,
      minOrderValue: 0,
      rewardType: 'discount_fixed',
      rewardValue: 0,
    };
  }
  const allowedTypes = ['discount_fixed', 'discount_percent', 'free_product'];
  const rewardType = allowedTypes.includes(raw.rewardType) ? raw.rewardType : 'discount_fixed';
  const stampsGoal = Math.min(20, Math.max(2, Math.round(Number(raw.stampsGoal) || 10)));
  const reaisPerPoint = Math.max(1, Number(raw.reaisPerPoint) || 10);
  const minOrderValue = Math.max(0, roundMoney(Number(raw.minOrderValue) || 0));
  const rewardValue = Math.max(0, roundMoney(Number(raw.rewardValue) || 0));
  const rewardDescription =
    raw.rewardDescription != null ? String(raw.rewardDescription).trim().slice(0, 240) : '';
  const out = {
    enabled: raw.enabled === true,
    stampsGoal,
    reaisPerPoint,
    minOrderValue,
    rewardType,
    rewardValue,
  };
  if (rewardDescription) {
    out.rewardDescription = rewardDescription;
  }
  return out;
}

function resolveDeliveryQuoteServer(area, fallbackFee, addrFields) {
  const safeFallback = Math.max(0, roundMoney(Number(fallbackFee || 0)));
  if (!area || area.mode === 'fixed') {
    return { deliverable: true, fee: safeFallback, distanceKm: undefined };
  }
  if (area.mode === 'radius') {
    const hasOrigin =
      typeof area.originLat === 'number' &&
      Number.isFinite(area.originLat) &&
      typeof area.originLng === 'number' &&
      Number.isFinite(area.originLng);
    if (!hasOrigin) {
      return { deliverable: !area.blockOutsideArea, fee: safeFallback, reason: 'origin_not_configured' };
    }
    const activeTiers = (area.radiusTiers || [])
      .filter((t) => t.active !== false && Number(t.maxKm) > 0)
      .sort((a, b) => Number(a.maxKm) - Number(b.maxKm));
    if (activeTiers.length === 0) {
      return { deliverable: true, fee: safeFallback };
    }
    const lat = Number(addrFields?.lat);
    const lng = Number(addrFields?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return {
        deliverable: !area.blockOutsideArea,
        fee: safeFallback,
        reason: 'address_coords_missing',
      };
    }
    const factor =
      typeof area.distanceFactor === 'number' && area.distanceFactor >= 1 ? area.distanceFactor : 1.25;
    const distanceKm = Math.round(calculateHaversineKmServer(area.originLat, area.originLng, lat, lng) * factor * 100) / 100;
    const matched = activeTiers.find((t) => distanceKm <= Number(t.maxKm));
    if (matched) {
      return { deliverable: true, fee: roundMoney(matched.fee), distanceKm };
    }
    return {
      deliverable: !area.blockOutsideArea,
      fee: roundMoney(activeTiers[activeTiers.length - 1].fee),
      distanceKm,
      reason: 'outside_radius',
    };
  }
  // mode === 'neighborhood'
  const activeRules = (area.neighborhoods || []).filter(
    (n) => n.active !== false && normalizeAreaTextServer(n.name).length > 0
  );
  if (activeRules.length === 0) {
    return { deliverable: true, fee: safeFallback };
  }
  const targetNb = normalizeAreaTextServer(addrFields?.neighborhood);
  const targetCity = normalizeAreaTextServer(addrFields?.city);
  if (!targetNb) {
    return { deliverable: !area.blockOutsideArea, fee: safeFallback, reason: 'neighborhood_not_served' };
  }
  const matchedRule = activeRules.find((rule) => {
    const rName = normalizeAreaTextServer(rule.name);
    const rCity = normalizeAreaTextServer(rule.city);
    const nameMatch = rName === targetNb || targetNb.includes(rName) || rName.includes(targetNb);
    if (!nameMatch) return false;
    if (rCity && targetCity) return rCity === targetCity;
    return true;
  });
  if (matchedRule) {
    return { deliverable: true, fee: roundMoney(matchedRule.fee) };
  }
  return { deliverable: !area.blockOutsideArea, fee: safeFallback, reason: 'neighborhood_not_served' };
}

function computeEffectiveProductPrice(product) {
  const basePrice = Math.max(0, roundMoney(Number(product?.salePrice || 0)));
  const rawDiscount = Math.max(0, Number(product?.discountValue || 0));
  if (product?.promoActive !== true || rawDiscount <= 0 || basePrice <= 0) {
    return { basePrice, effectivePrice: basePrice };
  }
  const type = product?.discountType === 'fixed' ? 'fixed' : 'percent';
  const discountAmount =
    type === 'percent'
      ? roundMoney((basePrice * Math.min(100, rawDiscount)) / 100)
      : roundMoney(Math.min(basePrice, rawDiscount));
  return {
    basePrice,
    effectivePrice: Math.max(0, roundMoney(basePrice - discountAmount)),
  };
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
    .filter(
      (p) =>
        p.active !== false &&
        p.showOnline === true &&
        (p.type === 'finished' || p.type !== 'raw' || Number(p.salePrice || 0) > 0)
    )
    .map((p) => {
      const { basePrice, effectivePrice } = computeEffectiveProductPrice(p);
      return {
        id: p.id,
        name: String(p.name || ''),
        category: p.category != null ? String(p.category) : undefined,
        description: p.description != null ? String(p.description) : undefined,
        salePrice: effectivePrice,
        originalPrice: basePrice,
        promoActive: p.promoActive === true,
        discountType: p.discountType === 'fixed' ? 'fixed' : p.discountType === 'percent' ? 'percent' : undefined,
        discountValue: typeof p.discountValue === 'number' ? Number(p.discountValue) : undefined,
        servingTemperature:
          p.servingTemperature === 'cold' || p.servingTemperature === 'hot'
            ? p.servingTemperature
            : undefined,
        isCombo: p.isCombo === true,
        comboItems: Array.isArray(p.comboItems) ? p.comboItems : undefined,
        servesCount: typeof p.servesCount === 'number' ? Number(p.servesCount) : undefined,
        featured: p.featured === true,
        imageUrl: p.imageUrl != null ? String(p.imageUrl) : undefined,
      };
    });

  const store = ctx.onlineStore || {};
  return {
    storeName: String(ctx.enterprise.tradeName || ctx.enterprise.name || ''),
    description: store.description != null ? String(store.description) : undefined,
    logoUrl: store.logoUrl != null ? String(store.logoUrl) : (ctx.enterprise.logoUrl || undefined),
    bannerUrl: store.bannerUrl != null ? String(store.bannerUrl) : undefined,
    bannerFit: store.bannerFit === 'contain' ? 'contain' : 'cover',
    bannerPositionY:
      typeof store.bannerPositionY === 'number' ? Number(store.bannerPositionY) : 50,
    logoFit: store.logoFit === 'contain' ? 'contain' : 'cover',
    minOrderAmount: Number(store.minOrderAmount || 0),
    isOpen: ctx.isOpen,
    closedReason: ctx.closedReason,
    openingHours: Array.isArray(store.openingHours) ? store.openingHours : [],
    estimatedMinutes: Number(store.estimatedMinutes || 40),
    deliveryFee: Number(store.defaultDeliveryFee ?? ctx.enterprise.defaultDeliveryFee ?? 0),
    deliveryArea: sanitizeDeliveryArea(store.deliveryArea),
    loyalty: sanitizeLoyaltyConfig(store.loyalty),
    acceptDelivery: store.acceptDelivery !== false,
    acceptPickup: store.acceptPickup !== false,
    acceptTableOrders: store.acceptTableOrders !== false,
    paymentMethodsOnDelivery: Array.isArray(store.paymentMethodsOnDelivery)
      ? store.paymentMethodsOnDelivery
      : ['cash', 'pix', 'debit_card', 'credit_card'],
    acceptOnlinePix: store.acceptOnlinePix !== false && Boolean(store.pixKey || store.acceptOnlinePix),
    pixKey: store.pixKey != null ? String(store.pixKey) : undefined,
    pixMerchantName:
      store.pixMerchantName != null
        ? String(store.pixMerchantName)
        : String(ctx.enterprise.tradeName || ctx.enterprise.name || ''),
    pixMerchantCity:
      store.pixMerchantCity != null
        ? String(store.pixMerchantCity)
        : String(ctx.enterprise.city || 'BRASIL'),
    whatsapp: store.whatsapp != null ? String(store.whatsapp) : undefined,
    instagramUrl: store.instagramUrl != null ? String(store.instagramUrl) : undefined,
    googleReviewUrl: store.googleReviewUrl != null ? String(store.googleReviewUrl) : undefined,
    address: {
      street: String(ctx.enterprise.address || ''),
      number: String(ctx.enterprise.addressNumber || ctx.enterprise.number || ''),
      complement: String(ctx.enterprise.complement || ''),
      neighborhood: String(ctx.enterprise.neighborhood || ''),
      city: String(ctx.enterprise.city || ''),
      state: String(ctx.enterprise.state || ''),
      zipCode: String(ctx.enterprise.zipCode || ''),
    },
    products,
  };
});

const LOW_CPU_CALLABLE_OPTS = { maxInstances: 2, memory: '256MiB', concurrency: 1 };

exports.placeOnlineOrder = onCall(LOW_CPU_CALLABLE_OPTS, async (request) => {
  const slug = normalizeStoreSlug(request.data?.slug);
  const ctx = await loadStoreContextBySlug(slug);
  if (!ctx.isOpen) {
    throw new HttpsError('failed-precondition', ctx.closedReason || 'store_closed');
  }

  const rawDeliveryType = request.data?.deliveryType;
  const deliveryType =
    rawDeliveryType === 'delivery'
      ? 'delivery'
      : rawDeliveryType === 'table'
        ? 'table'
        : 'pickup';
  const paymentMethod = String(request.data?.paymentMethod || 'cash');
  if (!['cash', 'pix', 'debit_card', 'credit_card'].includes(paymentMethod)) {
    throw new HttpsError('invalid-argument', 'Invalid paymentMethod');
  }
  const paymentChannel =
    deliveryType !== 'table' && (request.data?.paymentChannel === 'online' || paymentMethod === 'pix')
      ? 'online'
      : 'on_delivery';
  const paymentStatus =
    paymentChannel === 'online' ? 'awaiting_confirmation' : 'pay_on_delivery';

  const customerName = String(request.data?.customerName || '').trim();
  const customerPhone = String(request.data?.customerPhone || '').trim();
  if (!customerName || (deliveryType !== 'table' && !customerPhone)) {
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
  if (deliveryType === 'table' && store.acceptTableOrders === false) {
    throw new HttpsError('failed-precondition', 'table_orders_disabled');
  }

  const rawAddrFieldsForQuote =
    request.data?.customerAddressFields && typeof request.data.customerAddressFields === 'object'
      ? request.data.customerAddressFields
      : null;

  if (deliveryType === 'delivery') {
    const reqStreet = String(rawAddrFieldsForQuote?.street || '').trim();
    const reqNumber = String(rawAddrFieldsForQuote?.number || '').trim();
    const reqNeighborhood = String(rawAddrFieldsForQuote?.neighborhood || '').trim();
    const reqCity = String(rawAddrFieldsForQuote?.city || '').trim();
    if (!reqStreet || !reqNumber || !reqNeighborhood || !reqCity) {
      throw new HttpsError(
        'invalid-argument',
        'Informe rua, número, bairro e cidade completos para entrega.'
      );
    }
  }

  const baseDeliveryFee = Number(store.defaultDeliveryFee ?? ctx.enterprise.defaultDeliveryFee ?? 0);
  const deliveryQuote =
    deliveryType === 'delivery'
      ? resolveDeliveryQuoteServer(store.deliveryArea, baseDeliveryFee, rawAddrFieldsForQuote)
      : { deliverable: true, fee: 0, distanceKm: undefined };

  if (deliveryType === 'delivery' && !deliveryQuote.deliverable) {
    throw new HttpsError('failed-precondition', 'out_of_delivery_area');
  }

  const deliveryFee = deliveryType === 'delivery' ? Number(deliveryQuote.fee || 0) : 0;

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
    if (
      product.active === false ||
      product.showOnline !== true ||
      !(Number(product.salePrice || 0) > 0)
    ) {
      throw new HttpsError('failed-precondition', 'product_unavailable');
    }
    const { effectivePrice: serverPrice } = computeEffectiveProductPrice(product);
    const clientPrice = Number(line.unitPrice);
    if (Number.isFinite(clientPrice) && Math.abs(clientPrice - serverPrice) > 0.009) {
      throw new HttpsError('failed-precondition', 'price_changed');
    }
    const itemObj = {
      productId,
      productName: String(product.name || ''),
      productSku: String(product.sku || ''),
      unit: String(product.unit || 'un'),
      qty,
      unitPrice: serverPrice,
      lineTotal: roundMoney(qty * serverPrice),
    };
    if (line.notes != null && String(line.notes).trim() !== '') {
      itemObj.notes = String(line.notes).trim();
    }
    validatedItems.push(itemObj);
  }

  const { subtotal, total } = buildOnlineOrderTotals(validatedItems, deliveryFee);
  const code = generateOrderCode();
  const timestamp = nowIso();
  const ref = db().collection(`enterprises/${ctx.enterpriseId}/onlineOrders`).doc();
  const rawAddrFields = request.data?.customerAddressFields;
  const parsedLat = Number(rawAddrFields?.lat);
  const parsedLng = Number(rawAddrFields?.lng);
  const customerAddressFields =
    rawAddrFields && typeof rawAddrFields === 'object'
      ? {
          cep: rawAddrFields.cep ? String(rawAddrFields.cep) : '',
          street: rawAddrFields.street ? String(rawAddrFields.street) : '',
          number: rawAddrFields.number ? String(rawAddrFields.number) : '',
          complement: rawAddrFields.complement ? String(rawAddrFields.complement) : '',
          neighborhood: rawAddrFields.neighborhood ? String(rawAddrFields.neighborhood) : '',
          city: rawAddrFields.city ? String(rawAddrFields.city) : '',
          state: rawAddrFields.state ? String(rawAddrFields.state) : '',
          ...(Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
            ? { lat: parsedLat, lng: parsedLng }
            : {}),
        }
      : null;

  let tableContext = null;
  if (deliveryType === 'table') {
    const rawTableCode = normalizeStoreSlug(request.data?.tableCode || '');
    const tablesSnap = await db()
      .collection(`enterprises/${ctx.enterpriseId}/tables`)
      .where('active', '==', true)
      .get();
    const matchedTableDoc = tablesSnap.docs.find((d) => {
      const td = d.data() || {};
      return (
        normalizeStoreSlug(td.qrCodeSlug || '') === rawTableCode ||
        normalizeStoreSlug(`mesa-${td.number || ''}`) === rawTableCode ||
        normalizeStoreSlug(td.number || '') === rawTableCode
      );
    });
    if (matchedTableDoc) {
      tableContext = { id: matchedTableDoc.id, ...(matchedTableDoc.data() || {}) };
      if (tableContext.acceptingOrders === false) {
        throw new HttpsError('failed-precondition', 'table_disabled');
      }
    }
  }

  let tableSessionId = null;
  let linkedCustomerName = customerName;
  let linkedCustomerPhone = customerPhone;
  if (tableContext) {
    const openSessionsSnap = await db()
      .collection(`enterprises/${ctx.enterpriseId}/tableSessions`)
      .where('tableId', '==', tableContext.id)
      .get();

    const openSessions = openSessionsSnap.docs
      .map((d) => ({ id: d.id, ref: d.ref, ...(d.data() || {}) }))
      .filter((s) => s.status === 'open');

    const incomingDigits = phoneDigits(customerPhone);
    const matchedSession = openSessions.find((s) => {
      if (incomingDigits.length >= 10 && s.customerPhone) {
        return phonesMatch(s.customerPhone, customerPhone);
      }
      return (
        String(s.customerName || '').trim().toLowerCase() ===
        String(customerName || '').trim().toLowerCase()
      );
    });

    if (matchedSession) {
      tableSessionId = matchedSession.id;
      linkedCustomerName = String(matchedSession.customerName || customerName);
      linkedCustomerPhone = String(matchedSession.customerPhone || customerPhone);
      const nextSub = roundMoney(Number(matchedSession.subtotal || 0) + subtotal);
      await matchedSession.ref.update({
        orderIds: [...(Array.isArray(matchedSession.orderIds) ? matchedSession.orderIds : []), ref.id],
        subtotal: nextSub,
        total: nextSub,
        customerName: linkedCustomerName,
        customerPhone: linkedCustomerPhone,
        updatedAt: timestamp,
      });
    } else {
      const newSessRef = db().collection(`enterprises/${ctx.enterpriseId}/tableSessions`).doc();
      tableSessionId = newSessRef.id;
      await newSessRef.set({
        tableId: tableContext.id,
        tableNumber: String(tableContext.number || ''),
        status: 'open',
        openedByType: 'customer',
        customerName: linkedCustomerName,
        customerPhone: linkedCustomerPhone,
        orderIds: [ref.id],
        subtotal,
        total,
        openedAt: timestamp,
        updatedAt: timestamp,
      });
    }

    await db().doc(`enterprises/${ctx.enterpriseId}/tables/${tableContext.id}`).update({
      status: 'occupied',
      activeSessionId: tableContext.activeSessionId || tableSessionId,
      customerName: tableContext.customerName || linkedCustomerName,
      customerPhone: tableContext.customerPhone || linkedCustomerPhone,
      updatedAt: timestamp,
    });
  }

  const isTableQrOrder = deliveryType === 'table';
  const docData = {
    code,
    status: isTableQrOrder ? 'accepted' : 'pending',
    fulfillmentStatus: isTableQrOrder ? 'preparing' : 'pending',
    customerName: tableContext
      ? `Mesa ${tableContext.number} · ${linkedCustomerName}`
      : customerName,
    customerPhone: linkedCustomerPhone,
    customerPhoneDigits: String(linkedCustomerPhone).replace(/\D/g, ''),
    customerAddress:
      request.data?.customerAddress != null ? String(request.data.customerAddress) : null,
    customerAddressFields,
    deliveryType,
    deliveryFee,
    paymentMethod,
    paymentChannel,
    paymentStatus,
    orderSource: isTableQrOrder ? 'table_qr' : 'online_catalog',
    requestedByType: 'customer',
    tableId: tableContext ? tableContext.id : null,
    tableNumber: tableContext ? String(tableContext.number || '') : null,
    tableSessionId,
    items: validatedItems,
    subtotal,
    total,
    notes: request.data?.notes != null ? String(request.data.notes) : null,
    ...(isTableQrOrder ? { acceptedAt: timestamp, preparingAt: timestamp } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  Object.keys(docData).forEach((k) => {
    if (docData[k] === null || docData[k] === undefined) delete docData[k];
  });
  await ref.set(docData);

  // Disparo automático não-bloqueante via WhatsApp (Plano Ultra ativo)
  const PUBLIC_APP_ORIGIN = 'https://app.ds3i.com.br';
  const storeName = String(ctx.enterprise.tradeName || ctx.enterprise.name || slug);
  const rawOrigin =
    typeof request.data?.origin === 'string' && /^https?:\/\//i.test(request.data.origin)
      ? request.data.origin.replace(/\/+$/, '')
      : '';
  const clientOrigin =
    rawOrigin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(rawOrigin)
      ? rawOrigin
      : PUBLIC_APP_ORIGIN;
  const trackLink = `${clientOrigin}/p/${slug}/order/${ref.id}`;
  const menuLink = `${clientOrigin}/p/${slug}`;
  const adminOrdersLink = `${PUBLIC_APP_ORIGIN}/dashboard/pos/online-orders`;
  const modeLabel = deliveryType === 'delivery' ? 'Entrega' : 'Retirada no balcão';
  const itemsText = formatOrderItemsText(validatedItems);

  await Promise.all([
    dispatchEnterpriseWhatsappEvent({
      enterpriseId: ctx.enterpriseId,
      enterprise: ctx.enterprise,
      event: 'orderReceived',
      recipientPhone: customerPhone,
      orderId: ref.id,
      title: `Pedido ${code} recebido`,
      footer: storeName,
      buttons: [
        { type: 'url', displayText: 'Acompanhar pedido', url: trackLink },
        { type: 'url', displayText: 'Veja nosso cardápio', url: menuLink },
      ],
      vars: {
        cliente: customerName,
        codigo: code,
        loja: storeName,
        itens: itemsText,
        total: formatCurrencyBrl(total),
        modalidade: modeLabel,
        link: trackLink,
      },
    }),
    dispatchEnterpriseWhatsappEvent({
      enterpriseId: ctx.enterpriseId,
      enterprise: ctx.enterprise,
      event: 'storeOwnerNewOrder',
      recipientPhone:
        ctx.enterprise.whatsappIntegration?.ownerAlertPhone || ctx.onlineStore?.whatsapp || '',
      orderId: ref.id,
      title: `Novo pedido ${code}`,
      footer: storeName,
      buttons: [{ type: 'url', displayText: 'Abrir painel de pedidos', url: adminOrdersLink }],
      vars: {
        cliente: customerName,
        telefone: customerPhone,
        codigo: code,
        loja: storeName,
        itens: itemsText,
        total: formatCurrencyBrl(total),
        modalidade: modeLabel,
        link: trackLink,
      },
    }),
  ]);

  return { orderId: ref.id, code };
});

exports.upsertOnlineStoreConfig = onCall(LOW_CPU_CALLABLE_OPTS, async (request) => {
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
    acceptTableOrders:
      onlineStore.acceptTableOrders !== undefined
        ? onlineStore.acceptTableOrders !== false
        : entSnap.data()?.onlineStore?.acceptTableOrders !== false,
    defaultDeliveryFee: Number(onlineStore.defaultDeliveryFee || 0),
    minOrderAmount: Number(onlineStore.minOrderAmount || 0),
    paymentMethodsOnDelivery: Array.isArray(onlineStore.paymentMethodsOnDelivery)
      ? onlineStore.paymentMethodsOnDelivery
      : ['cash', 'pix'],
    acceptOnlinePix: onlineStore.acceptOnlinePix !== false,
    pixKey: onlineStore.pixKey != null ? String(onlineStore.pixKey).trim() : null,
    pixMerchantName:
      onlineStore.pixMerchantName != null ? String(onlineStore.pixMerchantName).trim() : null,
    pixMerchantCity:
      onlineStore.pixMerchantCity != null ? String(onlineStore.pixMerchantCity).trim() : null,
    whatsapp: onlineStore.whatsapp != null ? String(onlineStore.whatsapp) : null,
    description: onlineStore.description != null ? String(onlineStore.description).trim() : null,
    instagramUrl: onlineStore.instagramUrl != null ? String(onlineStore.instagramUrl) : null,
    googleReviewUrl:
      onlineStore.googleReviewUrl != null ? String(onlineStore.googleReviewUrl) : null,
    logoUrl: onlineStore.logoUrl != null ? String(onlineStore.logoUrl) : null,
    bannerUrl: onlineStore.bannerUrl != null ? String(onlineStore.bannerUrl) : null,
    bannerFit: onlineStore.bannerFit === 'contain' ? 'contain' : 'cover',
    bannerPositionY:
      typeof onlineStore.bannerPositionY === 'number'
        ? Math.min(100, Math.max(0, Math.round(onlineStore.bannerPositionY)))
        : 50,
    logoFit: onlineStore.logoFit === 'contain' ? 'contain' : 'cover',
    deliveryArea: sanitizeDeliveryArea(onlineStore.deliveryArea),
    loyalty: sanitizeLoyaltyConfig(onlineStore.loyalty),
  };
  [
    'pixKey',
    'pixMerchantName',
    'pixMerchantCity',
    'whatsapp',
    'description',
    'instagramUrl',
    'googleReviewUrl',
    'logoUrl',
    'bannerUrl',
  ].forEach((k) => {
    if (payload[k] === null || payload[k] === undefined || payload[k] === '') {
      delete payload[k];
    }
  });

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

  const acceptUpdate = {
    status: 'accepted',
    fulfillmentStatus: 'preparing',
    saleId: saleRef.id,
    cashSessionId: openCash.id,
    acceptedByUid: request.auth.uid,
    acceptedAt: timestamp,
    preparingAt: timestamp,
    updatedAt: timestamp,
  };
  if (order.paymentChannel === 'online' || order.paymentStatus === 'awaiting_confirmation') {
    acceptUpdate.paymentStatus = 'confirmed';
    acceptUpdate.pixConfirmedAt = timestamp;
    acceptUpdate.pixConfirmedByUid = request.auth.uid;
  }
  batch.update(orderRef, acceptUpdate);

  await batch.commit();

  // Notificação automática WhatsApp: Pedido Aceito (Plano Ultra ativo)
  const entSnap = await db().doc(`enterprises/${enterpriseId}`).get();
  if (entSnap.exists) {
    const enterprise = { id: entSnap.id, ...entSnap.data() };
    if (enterprise.nfceEnabled === true) {
      try {
        const nfceService = require('./fiscal/nfce-service');
        await nfceService.issueSaleNfceForEnterprise(db(), {
          enterpriseId,
          saleId: saleRef.id,
        });
      } catch (nfceErr) {
        console.error('acceptOnlineOrder NFC-e', nfceErr?.message || nfceErr);
      }
    }
    const store = enterprise.onlineStore || {};
    const storeSlug = store.slug || '';
    const storeName = String(enterprise.tradeName || enterprise.name || '');
    const trackLink = storeSlug
      ? `https://app.ds3i.com.br/p/${storeSlug}/order/${orderId}`
      : '';
    const menuLink = storeSlug ? `https://app.ds3i.com.br/p/${storeSlug}` : '';
    const acceptedButtons = [];
    if (trackLink) {
      acceptedButtons.push({ type: 'url', displayText: 'Acompanhar pedido', url: trackLink });
    }
    if (menuLink) {
      acceptedButtons.push({ type: 'url', displayText: 'Veja nosso cardápio', url: menuLink });
    }
    await dispatchEnterpriseWhatsappEvent({
      enterpriseId,
      enterprise,
      event: 'orderAccepted',
      recipientPhone: order.customerPhone,
      orderId,
      saleId: saleRef.id,
      title: `Pedido ${order.code || orderId} confirmado`,
      footer: storeName,
      buttons: acceptedButtons,
      vars: {
        cliente: order.customerName || 'Cliente',
        codigo: order.code || orderId,
        loja: storeName,
        tempo: Number(store.estimatedMinutes || 40),
        link: trackLink,
      },
    });
  }

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
  const orderData = orderSnap.data() || {};
  if (orderData.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Order is not pending');
  }

  const rejectedTs = nowIso();
  const update = {
    status: 'rejected',
    fulfillmentStatus: 'rejected',
    rejectedAt: rejectedTs,
    updatedAt: rejectedTs,
  };
  if (request.data?.reason != null) {
    update.rejectedReason = String(request.data.reason);
  }
  await orderRef.update(update);

  // Notificação automática WhatsApp: Pedido Recusado (Plano Ultra ativo)
  const entSnap = await db().doc(`enterprises/${enterpriseId}`).get();
  if (entSnap.exists) {
    const enterprise = { id: entSnap.id, ...entSnap.data() };
    const storeName = String(enterprise.tradeName || enterprise.name || '');
    await dispatchEnterpriseWhatsappEvent({
      enterpriseId,
      enterprise,
      event: 'orderRejected',
      recipientPhone: orderData.customerPhone,
      orderId,
      vars: {
        cliente: orderData.customerName || 'Cliente',
        codigo: orderData.code || orderId,
        loja: storeName,
        motivo: update.rejectedReason ? `\n\n*Motivo:* ${update.rejectedReason}` : '',
      },
    });
  }
});

function phoneDigits(val) {
  return String(val || '').replace(/\D/g, '');
}

function phonesMatch(a, b) {
  const da = phoneDigits(a);
  const dbVal = phoneDigits(b);
  if (da.length < 10 || dbVal.length < 10) return false;
  if (da === dbVal) return true;
  // Match ignoring country code 55 prefix
  const tailA = da.slice(-11);
  const tailB = dbVal.slice(-11);
  if (tailA === tailB) return true;
  return da.slice(-10) === dbVal.slice(-10);
}

async function resolveEnterpriseBySlug(rawSlug) {
  const slug = normalizeStoreSlug(rawSlug);
  if (!slug) throw new HttpsError('invalid-argument', 'slug required');
  const indexSnap = await db().doc(`publicStoreIndex/${slug}`).get();
  if (!indexSnap.exists) throw new HttpsError('not-found', 'Store not found');
  const enterpriseId = String(indexSnap.data()?.enterpriseId || '');
  if (!enterpriseId) throw new HttpsError('not-found', 'Store not found');
  const entSnap = await db().doc(`enterprises/${enterpriseId}`).get();
  if (!entSnap.exists) throw new HttpsError('not-found', 'Enterprise not found');
  return { enterpriseId, enterprise: entSnap.data() || {} };
}

function mapPublicOrderSummary(id, data, enterprise) {
  const status = String(data.status || 'pending');
  // Aceite operacional já envia à cozinha: legado `accepted` → `preparing` no tracker público.
  let fulfillmentStatus = String(
    data.fulfillmentStatus || (status === 'accepted' ? 'preparing' : status)
  );
  if (fulfillmentStatus === 'accepted') {
    fulfillmentStatus = 'preparing';
  }
  const store = enterprise.onlineStore || {};
  return {
    id,
    code: String(data.code || ''),
    status,
    fulfillmentStatus,
    customerName: String(data.customerName || ''),
    customerPhone: String(data.customerPhone || ''),
    customerAddress: data.customerAddress != null ? String(data.customerAddress) : undefined,
    deliveryType:
      data.deliveryType === 'delivery' || data.deliveryType === 'table'
        ? data.deliveryType
        : 'pickup',
    deliveryFee: Number(data.deliveryFee || 0),
    paymentMethod: String(data.paymentMethod || 'cash'),
    paymentChannel: data.paymentChannel === 'online' ? 'online' : 'on_delivery',
    paymentStatus: String(
      data.paymentStatus || (data.paymentChannel === 'online' ? 'awaiting_confirmation' : 'pay_on_delivery')
    ),
    pixKey: store.pixKey != null ? String(store.pixKey) : undefined,
    pixMerchantName:
      store.pixMerchantName != null
        ? String(store.pixMerchantName)
        : String(enterprise.tradeName || enterprise.name || ''),
    pixMerchantCity:
      store.pixMerchantCity != null
        ? String(store.pixMerchantCity)
        : String(enterprise.city || 'BRASIL'),
    items: Array.isArray(data.items) ? data.items : [],
    subtotal: Number(data.subtotal || 0),
    total: Number(data.total || 0),
    notes: data.notes != null ? String(data.notes) : undefined,
    rejectedReason: data.rejectedReason != null ? String(data.rejectedReason) : undefined,
    createdAt: String(data.createdAt || ''),
    updatedAt: String(data.updatedAt || ''),
    storeName: String(enterprise.tradeName || enterprise.name || ''),
    whatsapp: store.whatsapp != null ? String(store.whatsapp) : undefined,
    googleReviewUrl: store.googleReviewUrl != null ? String(store.googleReviewUrl) : undefined,
  };
}

exports.lookupPublicCustomerByPhone = onCall(async (request) => {
  const { enterpriseId } = await resolveEnterpriseBySlug(request.data?.slug);
  const digits = phoneDigits(request.data?.phone);
  if (digits.length < 10) {
    return { found: false };
  }

  // 1. Check ERP customers collection
  const customersSnap = await db()
    .collection(`enterprises/${enterpriseId}/customers`)
    .where('active', '==', true)
    .get();

  const matchedCustomer = customersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((c) => phonesMatch(c.phone || c.whatsapp, digits));

  if (matchedCustomer) {
    return {
      found: true,
      customer: {
        name: String(matchedCustomer.name || ''),
        phone: String(matchedCustomer.phone || matchedCustomer.whatsapp || ''),
        cep: String(matchedCustomer.zipCode || matchedCustomer.cep || ''),
        street: String(matchedCustomer.address || matchedCustomer.street || ''),
        number: String(matchedCustomer.addressNumber || matchedCustomer.number || ''),
        complement: String(matchedCustomer.complement || ''),
        neighborhood: String(matchedCustomer.neighborhood || ''),
        city: String(matchedCustomer.city || ''),
        state: String(matchedCustomer.state || ''),
      },
    };
  }

  // 2. Fallback: check most recent online order from this phone
  const ordersSnap = await db()
    .collection(`enterprises/${enterpriseId}/onlineOrders`)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const matchedOrder = ordersSnap.docs
    .map((d) => d.data() || {})
    .find((o) => phonesMatch(o.customerPhoneDigits || o.customerPhone, digits));

  if (matchedOrder) {
    const addr = matchedOrder.customerAddressFields || {};
    return {
      found: true,
      customer: {
        name: String(matchedOrder.customerName || ''),
        phone: String(matchedOrder.customerPhone || ''),
        cep: String(addr.cep || ''),
        street: String(addr.street || ''),
        number: String(addr.number || ''),
        complement: String(addr.complement || ''),
        neighborhood: String(addr.neighborhood || ''),
        city: String(addr.city || ''),
        state: String(addr.state || ''),
      },
    };
  }

  return { found: false };
});

exports.listPublicOrdersByPhone = onCall(LOW_CPU_CALLABLE_OPTS, async (request) => {
  const { enterpriseId, enterprise } = await resolveEnterpriseBySlug(request.data?.slug);
  const digits = phoneDigits(request.data?.phone);
  if (digits.length < 10) {
    throw new HttpsError('invalid-argument', 'Informe um telefone válido com DDD');
  }
  const requestedFirstName = normalizeFirstName(request.data?.firstName || '');

  const snap = await db()
    .collection(`enterprises/${enterpriseId}/onlineOrders`)
    .orderBy('createdAt', 'desc')
    .limit(150)
    .get();

  const matchedDocs = snap.docs.filter((d) => {
    const data = d.data() || {};
    if (!phonesMatch(data.customerPhoneDigits || data.customerPhone, digits)) {
      return false;
    }
    if (requestedFirstName) {
      const orderFirstName = normalizeFirstName(data.customerName || '');
      if (!orderFirstName) return false;
      return orderFirstName === requestedFirstName;
    }
    return true;
  });

  const latestOrders = matchedDocs
    .slice(0, 5)
    .map((d) => mapPublicOrderSummary(d.id, d.data() || {}, enterprise));

  const matchedCustomerName = latestOrders[0]?.customerName || undefined;

  return { orders: latestOrders, matchedCustomerName };
});

async function loadPublicTableStatus(enterpriseId, enterprise, rawTableCodeInput, rawCustomerPhone) {
  const rawTableCode = normalizeStoreSlug(rawTableCodeInput || '');
  if (!rawTableCode) {
    throw new HttpsError('invalid-argument', 'tableCode required');
  }

  const tablesSnap = await db()
    .collection(`enterprises/${enterpriseId}/tables`)
    .where('active', '==', true)
    .get();

  const matchedTableDoc = tablesSnap.docs.find((d) => {
    const td = d.data() || {};
    return (
      normalizeStoreSlug(td.qrCodeSlug || '') === rawTableCode ||
      normalizeStoreSlug(`mesa-${td.number || ''}`) === rawTableCode ||
      normalizeStoreSlug(td.number || '') === rawTableCode
    );
  });

  if (!matchedTableDoc) {
    throw new HttpsError('not-found', 'Table not found');
  }

  const tableData = matchedTableDoc.data() || {};
  const store = enterprise?.onlineStore || {};
  const tableInfo = {
    id: matchedTableDoc.id,
    number: String(tableData.number || ''),
    label: tableData.label ? String(tableData.label) : undefined,
    area: tableData.area ? String(tableData.area) : undefined,
    qrCodeSlug: String(tableData.qrCodeSlug || rawTableCode),
    status: String(tableData.status || 'available'),
    acceptingOrders: tableData.acceptingOrders !== false,
    acceptTableOrders: store.acceptTableOrders !== false,
  };

  const callerDigits = phoneDigits(rawCustomerPhone || '');
  if (callerDigits.length < 10) {
    return { table: tableInfo, session: null, orders: [] };
  }

  const openSessionsSnap = await db()
    .collection(`enterprises/${enterpriseId}/tableSessions`)
    .where('tableId', '==', matchedTableDoc.id)
    .get();

  const matchedSessDoc = openSessionsSnap.docs.find((d) => {
    const s = d.data() || {};
    return s.status === 'open' && phonesMatch(s.customerPhone, rawCustomerPhone);
  });

  if (!matchedSessDoc) {
    return { table: tableInfo, session: null, orders: [] };
  }

  const sess = matchedSessDoc.data() || {};
  const ordersSnap = await db()
    .collection(`enterprises/${enterpriseId}/onlineOrders`)
    .where('tableSessionId', '==', matchedSessDoc.id)
    .get();

  const orders = ordersSnap.docs
    .map((d) => {
      const o = d.data() || {};
      return {
        id: d.id,
        code: String(o.code || ''),
        status: String(o.status || 'accepted'),
        fulfillmentStatus: String(o.fulfillmentStatus || 'preparing'),
        requestedByType: o.requestedByType === 'waiter' ? 'waiter' : 'customer',
        waiterName: o.waiterName ? String(o.waiterName) : undefined,
        items: Array.isArray(o.items) ? o.items : [],
        subtotal: Number(o.subtotal || 0),
        total: Number(o.total || 0),
        notes: o.notes ? String(o.notes) : undefined,
        createdAt: String(o.createdAt || ''),
        updatedAt: String(o.updatedAt || ''),
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const computedTotal = roundMoney(
    orders.length > 0 ? orders.reduce((acc, o) => acc + o.total, 0) : Number(sess.total || 0)
  );

  return {
    table: tableInfo,
    session: {
      id: matchedSessDoc.id,
      status: 'open',
      customerName: sess.customerName ? String(sess.customerName) : undefined,
      customerPhone: sess.customerPhone ? String(sess.customerPhone) : undefined,
      waiterName: sess.waiterName ? String(sess.waiterName) : undefined,
      subtotal: computedTotal,
      total: computedTotal,
      openedAt: String(sess.openedAt || ''),
    },
    orders,
  };
}

exports.getPublicOrderStatus = onCall(async (request) => {
  const { enterpriseId, enterprise } = await resolveEnterpriseBySlug(request.data?.slug);

  if (request.data?.tableCode) {
    const tableStatus = await loadPublicTableStatus(
      enterpriseId,
      enterprise,
      request.data.tableCode,
      request.data.customerPhone
    );
    return { tableStatus };
  }

  const orderId = String(request.data?.orderId || '').trim();
  if (!orderId) throw new HttpsError('invalid-argument', 'orderId or tableCode required');

  const snap = await db().doc(`enterprises/${enterpriseId}/onlineOrders/${orderId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Order not found');

  return { order: mapPublicOrderSummary(snap.id, snap.data() || {}, enterprise) };
});

const VALID_FULFILLMENT_STATUSES = new Set([
  'accepted',
  'preparing',
  'out_for_delivery',
  'delivered',
]);

exports.updateOnlineOrderStatus = onCall(async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  const orderId = String(request.data?.orderId || '').trim();
  const fulfillmentStatus = String(request.data?.fulfillmentStatus || '').trim();

  if (!enterpriseId || !orderId || !VALID_FULFILLMENT_STATUSES.has(fulfillmentStatus)) {
    throw new HttpsError('invalid-argument', 'Invalid enterpriseId, orderId, or fulfillmentStatus');
  }
  assertTenantPosAccess(request, enterpriseId);

  const orderRef = db().doc(`enterprises/${enterpriseId}/onlineOrders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new HttpsError('not-found', 'Order not found');
  const orderData = orderSnap.data() || {};
  if (orderData.status !== 'accepted') {
    throw new HttpsError('failed-precondition', 'Only accepted orders can progress');
  }

  const stageTimestamp = nowIso();
  const stageFieldMap = {
    accepted: 'acceptedAt',
    preparing: 'preparingAt',
    out_for_delivery: 'dispatchedAt',
    delivered: 'deliveredAt',
  };
  const stageField = stageFieldMap[fulfillmentStatus];
  const statusUpdate = {
    fulfillmentStatus,
    updatedAt: stageTimestamp,
  };
  if (stageField && !orderData[stageField]) {
    statusUpdate[stageField] = stageTimestamp;
  }

  await orderRef.update(statusUpdate);

  // Notificação automática WhatsApp de avanço de etapa (Plano Ultra ativo)
  const eventMap = {
    preparing: 'orderPreparing',
    out_for_delivery: 'orderOutForDelivery',
    delivered: 'orderDelivered',
  };
  const waEvent = eventMap[fulfillmentStatus];
  if (waEvent && orderData.customerPhone) {
    const entSnap = await db().doc(`enterprises/${enterpriseId}`).get();
    if (entSnap.exists) {
      const enterprise = { id: entSnap.id, ...entSnap.data() };
      const store = enterprise.onlineStore || {};
      const storeName = String(enterprise.tradeName || enterprise.name || '');
      const statusEntrega =
        orderData.deliveryType === 'delivery'
          ? 'Seu pedido *saiu para entrega*! Fique atento ao entregador.'
          : 'Seu pedido está *pronto para retirada no balcão*!';
      const avaliacao = store.googleReviewUrl
        ? `\n\n⭐ Gostou? Avalie nossa loja:\n${store.googleReviewUrl}`
        : '';
      const storeSlug = String(store.slug || '').trim();
      const trackLink = storeSlug ? `https://app.ds3i.com.br/p/${storeSlug}/order/${orderId}` : '';
      const menuLink = storeSlug ? `https://app.ds3i.com.br/p/${storeSlug}` : '';
      const stageButtons = [];
      if (fulfillmentStatus === 'delivered') {
        if (store.googleReviewUrl && /^https?:\/\//i.test(String(store.googleReviewUrl))) {
          stageButtons.push({
            type: 'url',
            displayText: 'Avaliar nossa loja',
            url: String(store.googleReviewUrl).trim(),
          });
        }
        if (menuLink) {
          stageButtons.push({
            type: 'url',
            displayText: 'Veja nosso cardápio',
            url: menuLink,
          });
        }
      } else if (trackLink) {
        stageButtons.push({
          type: 'url',
          displayText: 'Acompanhar pedido',
          url: trackLink,
        });
      }

      await dispatchEnterpriseWhatsappEvent({
        enterpriseId,
        enterprise,
        event: waEvent,
        recipientPhone: orderData.customerPhone,
        orderId,
        title: `Pedido ${orderData.code || orderId}`,
        footer: storeName,
        buttons: stageButtons,
        vars: {
          cliente: orderData.customerName || 'Cliente',
          codigo: orderData.code || orderId,
          loja: storeName,
          statusEntrega,
          avaliacao,
          link: trackLink,
        },
      });
    }
  }

  return { fulfillmentStatus };
});

function escapeHtmlAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildFallbackStoreDescription(storeName, enterprise, store, categories) {
  const modes = [];
  if (store.acceptDelivery !== false) modes.push('Delivery');
  if (store.acceptPickup !== false) modes.push('Retirada no balcão');
  const cityPart = [enterprise.city, enterprise.state].filter(Boolean).join(' - ');
  const catPart = categories.length ? ` Confira: ${categories.slice(0, 4).join(', ')}.` : '';
  return `Faça seu pedido online em ${storeName}${cityPart ? ` (${cityPart})` : ''}.${
    modes.length ? ` ${modes.join(' e ')}.` : ''
  }${catPart}`.trim();
}

exports.publicStoreShareMeta = onRequest({ cors: true }, async (req, res) => {
  try {
    const pathMatch = String(req.path || '').match(/\/p\/([^/?#]+)/);
    const rawSlug = req.query.slug || (pathMatch ? pathMatch[1] : '');
    const slug = normalizeStoreSlug(rawSlug);
    if (!slug) {
      res.status(400).send('Missing store slug');
      return;
    }

    const indexSnap = await db().doc(`publicStoreIndex/${slug}`).get();
    if (!indexSnap.exists) {
      res.status(404).send('Store not found');
      return;
    }

    const enterpriseId = String(indexSnap.data()?.enterpriseId || '');
    const entSnap = await db().doc(`enterprises/${enterpriseId}`).get();
    if (!entSnap.exists) {
      res.status(404).send('Enterprise not found');
      return;
    }

    const enterprise = entSnap.data() || {};
    const store = enterprise.onlineStore || {};
    const storeName = String(enterprise.tradeName || enterprise.name || slug);

    const productsSnap = await db().collection(`enterprises/${enterpriseId}/products`).get();
    const products = productsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter(
        (p) =>
          p.active !== false &&
          p.showOnline === true &&
          (p.type === 'finished' || p.type !== 'raw' || Number(p.salePrice || 0) > 0)
      );

    const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    const description =
      (store.description && String(store.description).trim()) ||
      buildFallbackStoreDescription(storeName, enterprise, store, categories);

    const ogImage = store.bannerUrl || store.logoUrl || enterprise.logoUrl || '';
    const targetOrigin =
      typeof req.query.target === 'string' && /^https?:\/\//i.test(req.query.target)
        ? req.query.target.replace(/\/+$/, '')
        : '';
    const canonicalUrl = targetOrigin ? `${targetOrigin}/p/${slug}` : `https://${req.hostname}/p/${slug}`;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'FoodEstablishment',
      name: storeName,
      description,
      url: canonicalUrl,
      ...(ogImage ? { image: ogImage } : {}),
      ...(store.logoUrl ? { logo: store.logoUrl } : {}),
      ...(store.whatsapp ? { telephone: String(store.whatsapp) } : {}),
      ...(enterprise.address || enterprise.city
        ? {
            address: {
              '@type': 'PostalAddress',
              streetAddress: [enterprise.address, enterprise.addressNumber || enterprise.number]
                .filter(Boolean)
                .join(', '),
              addressLocality: enterprise.city || '',
              addressRegion: enterprise.state || '',
              postalCode: enterprise.zipCode || '',
              addressCountry: 'BR',
            },
          }
        : {}),
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: `Cardápio ${storeName}`,
        itemListElement: products.slice(0, 50).map((p) => ({
          '@type': 'Offer',
          priceCurrency: 'BRL',
          price: Number(p.salePrice || 0).toFixed(2),
          availability: 'https://schema.org/InStock',
          itemOffered: {
            '@type': 'Product',
            name: String(p.name || ''),
            ...(p.description ? { description: String(p.description) } : {}),
            ...(p.imageUrl ? { image: String(p.imageUrl) } : {}),
          },
        })),
      },
    };

    const title = `${storeName} — Cardápio Online e Delivery`;
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtmlAttr(title)}</title>
  <meta name="description" content="${escapeHtmlAttr(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:site_name" content="${escapeHtmlAttr(storeName)}" />
  <meta property="og:title" content="${escapeHtmlAttr(title)}" />
  <meta property="og:description" content="${escapeHtmlAttr(description)}" />
  <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />
  ${
    ogImage
      ? `<meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />
  <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapeHtmlAttr(storeName)}" />`
      : ''
  }
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtmlAttr(title)}" />
  <meta name="twitter:description" content="${escapeHtmlAttr(description)}" />
  ${ogImage ? `<meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}" />` : ''}
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${
    targetOrigin
      ? `<meta http-equiv="refresh" content="0;url=${escapeHtmlAttr(canonicalUrl)}" />
  <script>window.location.replace(${JSON.stringify(canonicalUrl)});</script>`
      : ''
  }
</head>
<body>
  <h1>${escapeHtmlAttr(storeName)}</h1>
  <p>${escapeHtmlAttr(description)}</p>
  <p><a href="${escapeHtmlAttr(canonicalUrl)}">Abrir cardápio online</a></p>
</body>
</html>`;

    res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.status(200).type('text/html; charset=utf-8').send(html);
  } catch (err) {
    console.error('publicStoreShareMeta error:', err);
    res.status(500).send('Internal error');
  }
});

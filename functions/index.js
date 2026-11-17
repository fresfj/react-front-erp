const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const {
  buildFreeSubscription,
  shouldDowngradeAfterGrace,
  mapAsaasPaymentEventToStatus,
} = require('./billing/subscription-domain');
const { asaasRequest } = require('./billing/asaas-client');

initializeApp();

const auth = getAuth();
const db = getFirestore();

const TENANT_ROLES = new Set(['admin', 'gestor', 'operador']);
const PLAN_CODES = new Set(['free', 'pro', 'ultra']);

function assertPlatformAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  if (request.auth.token.platformAdmin !== true) {
    throw new HttpsError('permission-denied', 'platformAdmin claim required');
  }
}

function assertTenantAdminOnly(request, enterpriseId) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const ok =
    request.auth.token.enterpriseId === enterpriseId &&
    request.auth.token.role === 'admin';
  if (!ok) {
    throw new HttpsError('permission-denied', 'Enterprise admin role required');
  }
}

async function ensureFreePlan() {
  const snap = await db.collection('plans').where('code', '==', 'free').limit(1).get();
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  }
  const ref = db.collection('plans').doc();
  const now = nowIso();
  const data = {
    code: 'free',
    name: 'Free',
    description: 'Plano inicial',
    priceMonthly: 0,
    currency: 'BRL',
    features: ['1 admin', '1 colaborador', 'Até 10 produtos'],
    sortOrder: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(data);
  return { id: ref.id, ...data };
}

async function loadAsaasConfig() {
  const [settingsSnap, secretSnap] = await Promise.all([
    db.doc('platformSettings/billing').get(),
    db.doc('platformSecrets/asaas').get(),
  ]);
  const settings = settingsSnap.data() || {};
  const secret = secretSnap.data() || {};
  return {
    graceDays: Number(settings.graceDays ?? 7),
    asaasEnv: settings.asaasEnv === 'production' ? 'production' : 'sandbox',
    apiKey: secret.apiKey ? String(secret.apiKey) : '',
    webhookToken: secret.webhookToken ? String(secret.webhookToken) : '',
  };
}

function assertEnterpriseAdminOrPlatformAdmin(request, enterpriseId) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const isPlat = request.auth.token.platformAdmin === true;
  const isTenantAdmin =
    request.auth.token.enterpriseId === enterpriseId &&
    (request.auth.token.role === 'admin' || request.auth.token.role === 'gestor');

  if (!isPlat && !isTenantAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Enterprise admin or platformAdmin permission required'
    );
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-');
}

function pickEnterpriseAddressFields(data) {
  const out = {};
  const keys = [
    'document',
    'tradeName',
    'phone',
    'zipCode',
    'address',
    'addressNumber',
    'complement',
    'neighborhood',
    'city',
    'state',
  ];
  for (const key of keys) {
    if (data?.[key] === undefined) continue;
    const raw = data[key];
    if (raw === null || raw === '') {
      out[key] = null;
      continue;
    }
    const str = String(raw).trim();
    if (key === 'document' || key === 'zipCode' || key === 'phone') {
      out[key] = str.replace(/\D/g, '') || null;
    } else {
      out[key] = str || null;
    }
  }
  return out;
}

/**
 * createEnterprise({ id, name, adminEmail?, document?, address fields... })
 */
exports.createEnterprise = onCall(async (request) => {
  assertPlatformAdmin(request);

  const id = sanitizeId(request.data?.id);
  const name = String(request.data?.name || '').trim();
  const adminEmail = request.data?.adminEmail
    ? String(request.data.adminEmail).trim().toLowerCase()
    : '';

  if (!id || !name) {
    throw new HttpsError('invalid-argument', 'id and name are required');
  }

  const documentDigits = String(request.data?.document || '').replace(/\D/g, '');
  if (documentDigits.length !== 14) {
    throw new HttpsError('invalid-argument', 'document (CNPJ) with 14 digits is required');
  }

  const ref = db.doc(`enterprises/${id}`);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpsError('already-exists', `Enterprise ${id} already exists`);
  }

  const freePlan = await ensureFreePlan();
  const createdAt = nowIso();
  const payload = {
    name,
    active: true,
    adminEmail: adminEmail || null,
    ...pickEnterpriseAddressFields(request.data),
    document: documentDigits,
    subscription: buildFreeSubscription(freePlan.id, createdAt),
    createdAt,
    updatedAt: createdAt,
    createdBy: request.auth.uid,
  };

  await ref.set(payload);
  return { id, ...payload };
});

/**
 * updateEnterprise({ id, name?, active?, adminEmail?, document?, address fields... })
 */
exports.updateEnterprise = onCall(async (request) => {
  assertPlatformAdmin(request);

  const id = sanitizeId(request.data?.id);
  if (!id) {
    throw new HttpsError('invalid-argument', 'id is required');
  }

  const ref = db.doc(`enterprises/${id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Enterprise ${id} not found`);
  }

  const patch = { updatedAt: nowIso(), ...pickEnterpriseAddressFields(request.data) };
  if (request.data?.name !== undefined) {
    const name = String(request.data.name).trim();
    if (!name) throw new HttpsError('invalid-argument', 'name cannot be empty');
    patch.name = name;
  }
  if (request.data?.active !== undefined) {
    patch.active = Boolean(request.data.active);
  }
  if (request.data?.adminEmail !== undefined) {
    const email = String(request.data.adminEmail || '').trim().toLowerCase();
    patch.adminEmail = email || null;
  }
  if (request.data?.document !== undefined) {
    const documentDigits = String(request.data.document || '').replace(/\D/g, '');
    if (documentDigits && documentDigits.length !== 14) {
      throw new HttpsError('invalid-argument', 'document (CNPJ) must have 14 digits');
    }
    patch.document = documentDigits || null;
  }

  await ref.set(patch, { merge: true });
  return { id, ...snap.data(), ...patch };
});

/**
 * inviteMember({ email, enterpriseId, role, tempPassword?, displayName?, permissions? })
 * getOrCreate Auth user + setCustomUserClaims + members/{uid}
 */
exports.inviteMember = onCall(async (request) => {
  const email = String(request.data?.email || '')
    .trim()
    .toLowerCase();
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  const role = String(request.data?.role || '').trim();
  const displayName = request.data?.displayName ? String(request.data.displayName).trim() : '';
  const permissions = Array.isArray(request.data?.permissions)
    ? request.data.permissions.map((p) => String(p))
    : undefined;
  const tempPassword = request.data?.tempPassword
    ? String(request.data.tempPassword)
    : undefined;

  assertEnterpriseAdminOrPlatformAdmin(request, enterpriseId);

  if (!email || !enterpriseId || !TENANT_ROLES.has(role)) {
    throw new HttpsError(
      'invalid-argument',
      'email, enterpriseId and role (admin|gestor|operador) are required'
    );
  }

  const enterpriseSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  if (!enterpriseSnap.exists) {
    throw new HttpsError('not-found', `Enterprise ${enterpriseId} not found`);
  }

  const DEFAULT_OPERATOR_PERMISSIONS = [
    'pos',
    'customers',
    'cash_close',
    'batches_read',
  ];

  let user;
  let created = false;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw new HttpsError('internal', error.message || 'Auth lookup failed');
    }
    const password =
      tempPassword && tempPassword.length >= 6
        ? tempPassword
        : `Tmp-${Math.random().toString(36).slice(2, 10)}A1`;
    user = await auth.createUser({
      email,
      password,
      displayName: displayName || undefined,
      emailVerified: true,
      disabled: false,
    });
    created = true;
  }

  if (displayName) {
    if (!created && user.displayName !== displayName) {
      await auth.updateUser(user.uid, { displayName });
      user = await auth.getUser(user.uid);
    }
  }

  const existingClaims = user.customClaims || {};
  const nextClaims = {
    ...existingClaims,
    enterpriseId,
    role,
  };
  await auth.setCustomUserClaims(user.uid, nextClaims);

  const memberPayload = {
    email,
    role,
    displayName: displayName || user.displayName || '',
    invitedBy: request.auth.uid,
    invitedAt: nowIso(),
    updatedAt: nowIso(),
    active: true,
  };

  if (role === 'operador') {
    memberPayload.permissions =
      permissions && permissions.length > 0
        ? permissions
        : DEFAULT_OPERATOR_PERMISSIONS;
  } else if (permissions && permissions.length > 0) {
    memberPayload.permissions = permissions;
  }

  await db.doc(`enterprises/${enterpriseId}/members/${user.uid}`).set(
    memberPayload,
    { merge: true }
  );

  if (!enterpriseSnap.data()?.adminEmail && role === 'admin') {
    await db.doc(`enterprises/${enterpriseId}`).set(
      { adminEmail: email, adminUid: user.uid, updatedAt: nowIso() },
      { merge: true }
    );
  }

  return {
    uid: user.uid,
    email,
    enterpriseId,
    role,
    created,
    claims: nextClaims,
  };
});

/**
 * setMemberClaims({ uid, enterpriseId, role, permissions? })
 */
exports.setMemberClaims = onCall(async (request) => {
  const uid = String(request.data?.uid || '').trim();
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  const role = String(request.data?.role || '').trim();
  const permissions = Array.isArray(request.data?.permissions)
    ? request.data.permissions.map((p) => String(p))
    : undefined;

  assertEnterpriseAdminOrPlatformAdmin(request, enterpriseId);

  if (!uid || !enterpriseId || !TENANT_ROLES.has(role)) {
    throw new HttpsError(
      'invalid-argument',
      'uid, enterpriseId and role (admin|gestor|operador) are required'
    );
  }

  const user = await auth.getUser(uid);
  const existingClaims = user.customClaims || {};
  const nextClaims = {
    ...existingClaims,
    enterpriseId,
    role,
  };
  await auth.setCustomUserClaims(uid, nextClaims);

  const patch = {
    email: user.email || '',
    role,
    updatedAt: nowIso(),
    claimsSetBy: request.auth.uid,
  };
  if (permissions) {
    patch.permissions = permissions;
  }

  await db.doc(`enterprises/${enterpriseId}/members/${uid}`).set(patch, { merge: true });

  return { uid, enterpriseId, role, claims: nextClaims };
});

/**
 * listEnterprises() — platform admin helper (also readable via rules)
 */
exports.listEnterprises = onCall(async (request) => {
  assertPlatformAdmin(request);
  const snap = await db.collection('enterprises').orderBy('name').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
});

/**
 * listEnterpriseMembers({ enterpriseId })
 */
exports.listEnterpriseMembers = onCall(async (request) => {
  assertPlatformAdmin(request);
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  if (!enterpriseId) {
    throw new HttpsError('invalid-argument', 'enterpriseId is required');
  }
  const snap = await db.collection(`enterprises/${enterpriseId}/members`).get();
  return snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
});

// Keep FieldValue import used if needed later
void FieldValue;

/**
 * validateSaleDiscount({ enterpriseId, subtotal, discountAmount })
 * Backend enforcement of operator discount limit (max 5% for operador).
 */
exports.validateSaleDiscount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const role = request.auth.token.role;
  const subtotal = Math.max(0, Number(request.data?.subtotal) || 0);
  const discountAmount = Math.max(0, Number(request.data?.discountAmount) || 0);
  const discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

  const maxAllowed = role === 'admin' || role === 'gestor' ? 100 : 5;
  if (discountPercent > maxAllowed + 0.0001) {
    throw new HttpsError(
      'permission-denied',
      `Discount of ${discountPercent.toFixed(2)}% exceeds role limit (${maxAllowed}%)`
    );
  }

  return {
    allowed: true,
    discountPercent: Math.round(discountPercent * 100) / 100,
    maxAllowed,
  };
});

// ----------------------------------------------------------------------
// Billing-A: plans + Asaas
// ----------------------------------------------------------------------

exports.saveBillingSettings = onCall(async (request) => {
  assertPlatformAdmin(request);
  const graceDays = Number(request.data?.graceDays);
  const asaasEnv = request.data?.asaasEnv === 'production' ? 'production' : 'sandbox';
  if (!Number.isFinite(graceDays) || graceDays < 0 || graceDays > 90) {
    throw new HttpsError('invalid-argument', 'graceDays must be 0..90');
  }

  const secretRef = db.doc('platformSecrets/asaas');
  const secretSnap = await secretRef.get();
  const secretPatch = { updatedAt: nowIso() };
  if (typeof request.data?.asaasApiKey === 'string' && request.data.asaasApiKey.trim()) {
    secretPatch.apiKey = request.data.asaasApiKey.trim();
  }
  if (
    typeof request.data?.asaasWebhookToken === 'string' &&
    request.data.asaasWebhookToken.trim()
  ) {
    secretPatch.webhookToken = request.data.asaasWebhookToken.trim();
  }
  if (secretPatch.apiKey || secretPatch.webhookToken) {
    await secretRef.set(secretPatch, { merge: true });
  }

  const mergedSecret = { ...(secretSnap.data() || {}), ...secretPatch };
  const publicDoc = {
    graceDays,
    asaasEnv,
    asaasApiKeyConfigured: Boolean(mergedSecret.apiKey),
    asaasWebhookTokenConfigured: Boolean(mergedSecret.webhookToken),
    updatedAt: nowIso(),
    updatedByUid: request.auth.uid,
  };
  await db.doc('platformSettings/billing').set(publicDoc, { merge: true });
  return publicDoc;
});

exports.getPublicBillingConfig = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const s = (await db.doc('platformSettings/billing').get()).data() || {};
  return { graceDays: Number(s.graceDays ?? 7) };
});

exports.upsertPlan = onCall(async (request) => {
  assertPlatformAdmin(request);
  const code = String(request.data?.code || '').trim();
  const name = String(request.data?.name || '').trim();
  const priceMonthly = Number(request.data?.priceMonthly);
  const sortOrder = Number(request.data?.sortOrder ?? 0);
  const active = request.data?.active !== false;
  const description =
    request.data?.description != null ? String(request.data.description) : '';
  const features = Array.isArray(request.data?.features)
    ? request.data.features.map((f) => String(f))
    : [];

  if (!PLAN_CODES.has(code)) {
    throw new HttpsError('invalid-argument', 'code must be free|pro|ultra');
  }
  if (!name) {
    throw new HttpsError('invalid-argument', 'name is required');
  }
  if (!Number.isFinite(priceMonthly) || priceMonthly < 0) {
    throw new HttpsError('invalid-argument', 'priceMonthly must be >= 0');
  }

  const id = request.data?.id ? String(request.data.id).trim() : '';
  const dup = await db
    .collection('plans')
    .where('code', '==', code)
    .where('active', '==', true)
    .get();
  const conflict = dup.docs.find((d) => d.id !== id);
  if (conflict && active) {
    throw new HttpsError(
      'already-exists',
      `Active plan with code ${code} already exists`
    );
  }

  const now = nowIso();
  const ref = id ? db.doc(`plans/${id}`) : db.collection('plans').doc();
  const existing = id ? await ref.get() : null;
  const data = {
    code,
    name,
    description,
    priceMonthly,
    currency: 'BRL',
    features,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    active,
    updatedAt: now,
    createdAt: existing?.exists ? existing.data().createdAt || now : now,
  };
  await ref.set(data, { merge: true });
  return { id: ref.id, ...data };
});

exports.deactivatePlan = onCall(async (request) => {
  assertPlatformAdmin(request);
  const planId = String(request.data?.planId || '').trim();
  if (!planId) {
    throw new HttpsError('invalid-argument', 'planId is required');
  }
  const ref = db.doc(`plans/${planId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Plan ${planId} not found`);
  }
  if (snap.data()?.code === 'free') {
    throw new HttpsError('failed-precondition', 'Cannot deactivate Free plan');
  }
  await ref.set({ active: false, updatedAt: nowIso() }, { merge: true });
});

exports.startSubscription = onCall(async (request) => {
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  const planId = String(request.data?.planId || '').trim();
  const paymentMethod = String(request.data?.paymentMethod || '').trim();
  const creditCardToken =
    typeof request.data?.creditCardToken === 'string'
      ? request.data.creditCardToken.trim()
      : '';

  assertTenantAdminOnly(request, enterpriseId);

  if (!enterpriseId || !planId) {
    throw new HttpsError('invalid-argument', 'enterpriseId and planId are required');
  }
  if (!['pix', 'boleto', 'credit_card'].includes(paymentMethod)) {
    throw new HttpsError('invalid-argument', 'paymentMethod must be pix|boleto|credit_card');
  }
  if (paymentMethod === 'credit_card' && !creditCardToken) {
    throw new HttpsError('invalid-argument', 'creditCardToken is required for credit_card');
  }

  const asaas = await loadAsaasConfig();
  if (!asaas.apiKey) {
    throw new HttpsError('failed-precondition', 'Asaas API key is not configured');
  }

  const planSnap = await db.doc(`plans/${planId}`).get();
  if (!planSnap.exists || planSnap.data()?.active === false) {
    throw new HttpsError('not-found', 'Plan not found or inactive');
  }
  const plan = { id: planSnap.id, ...planSnap.data() };
  if (plan.code === 'free' || !(Number(plan.priceMonthly) > 0)) {
    throw new HttpsError('failed-precondition', 'Paid plan required');
  }

  const entRef = db.doc(`enterprises/${enterpriseId}`);
  const entSnap = await entRef.get();
  if (!entSnap.exists) {
    throw new HttpsError('not-found', `Enterprise ${enterpriseId} not found`);
  }
  const ent = entSnap.data() || {};
  const prevSub = ent.subscription || {};

  if (prevSub.status === 'past_due') {
    throw new HttpsError(
      'failed-precondition',
      'Settle the open invoice before upgrading while past_due'
    );
  }

  let customerId = prevSub.asaasCustomerId || null;
  try {
    if (!customerId) {
      const customer = await asaasRequest({
        apiKey: asaas.apiKey,
        env: asaas.asaasEnv,
        method: 'POST',
        path: '/customers',
        body: {
          name: ent.name || enterpriseId,
          email: ent.adminEmail || request.auth.token.email || undefined,
          cpfCnpj: ent.document || undefined,
          externalReference: enterpriseId,
        },
      });
      customerId = customer.id;
    }

    const billingType =
      paymentMethod === 'pix'
        ? 'PIX'
        : paymentMethod === 'boleto'
          ? 'BOLETO'
          : 'CREDIT_CARD';

    const subBody = {
      customer: customerId,
      billingType,
      value: Number(plan.priceMonthly),
      nextDueDate: new Date().toISOString().slice(0, 10),
      cycle: 'MONTHLY',
      description: `ERP ${plan.name}`,
      externalReference: enterpriseId,
    };
    if (paymentMethod === 'credit_card') {
      subBody.creditCardToken = creditCardToken;
    }

    const asaasSub = await asaasRequest({
      apiKey: asaas.apiKey,
      env: asaas.asaasEnv,
      method: 'POST',
      path: '/subscriptions',
      body: subBody,
    });

    const now = nowIso();
    const subscription = {
      planId: plan.id,
      planCode: plan.code,
      status: 'incomplete',
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: asaasSub.nextDueDate
        ? `${asaasSub.nextDueDate}T23:59:59.000Z`
        : null,
      cancelAtPeriodEnd: false,
      pastDueSince: null,
      asaasCustomerId: customerId,
      asaasSubscriptionId: asaasSub.id || null,
      paymentMethod,
      updatedAt: now,
    };
    await entRef.set({ subscription, updatedAt: now }, { merge: true });

    let paymentUrl = null;
    try {
      const payments = await asaasRequest({
        apiKey: asaas.apiKey,
        env: asaas.asaasEnv,
        method: 'GET',
        path: `/payments?subscription=${asaasSub.id}&limit=1`,
      });
      const first = payments?.data?.[0];
      paymentUrl = first?.invoiceUrl || first?.bankSlipUrl || first?.transactionReceiptUrl || null;
    } catch (e) {
      console.warn('list payments after subscribe failed', e.message);
    }

    return { subscription, paymentUrl };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('startSubscription Asaas error', error);
    const now = nowIso();
    await entRef.set(
      {
        subscription: {
          ...(prevSub || {}),
          planId: plan.id,
          planCode: plan.code,
          status: 'incomplete',
          asaasCustomerId: customerId,
          paymentMethod,
          updatedAt: now,
        },
        updatedAt: now,
      },
      { merge: true }
    );
    throw new HttpsError('internal', error.message || 'Asaas subscription failed');
  }
});

exports.cancelSubscriptionAtPeriodEnd = onCall(async (request) => {
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  assertTenantAdminOnly(request, enterpriseId);

  const entRef = db.doc(`enterprises/${enterpriseId}`);
  const entSnap = await entRef.get();
  if (!entSnap.exists) {
    throw new HttpsError('not-found', `Enterprise ${enterpriseId} not found`);
  }
  const sub = entSnap.data()?.subscription || {};
  if (!sub.asaasSubscriptionId || sub.planCode === 'free') {
    throw new HttpsError('failed-precondition', 'No paid subscription to cancel');
  }

  const asaas = await loadAsaasConfig();
  if (!asaas.apiKey) {
    throw new HttpsError('failed-precondition', 'Asaas API key is not configured');
  }

  try {
    await asaasRequest({
      apiKey: asaas.apiKey,
      env: asaas.asaasEnv,
      method: 'PUT',
      path: `/subscriptions/${sub.asaasSubscriptionId}`,
      body: { status: 'INACTIVE' },
    });
  } catch (error) {
    console.warn('Asaas cancel update failed, flagging local only', error.message);
  }

  const now = nowIso();
  const next = {
    ...sub,
    cancelAtPeriodEnd: true,
    updatedAt: now,
  };
  await entRef.set({ subscription: next, updatedAt: now }, { merge: true });
  return next;
});

exports.asaasWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  const secretSnap = await db.doc('platformSecrets/asaas').get();
  const expected = secretSnap.data()?.webhookToken;
  const provided = req.get('asaas-access-token') || req.query.token;
  if (!expected || provided !== expected) {
    res.status(401).send('Unauthorized');
    return;
  }

  const event = String(req.body?.event || '');
  const payment = req.body?.payment || {};
  const asaasPaymentId = String(payment.id || '');
  const customerId = String(payment.customer || '');
  if (!asaasPaymentId) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  const q = await db
    .collection('enterprises')
    .where('subscription.asaasCustomerId', '==', customerId)
    .limit(1)
    .get();
  if (q.empty) {
    res.status(200).json({ ok: true, unmatched: true });
    return;
  }

  const entRef = q.docs[0].ref;
  const entId = q.docs[0].id;
  const invRef = entRef.collection('subscriptionInvoices').doc(asaasPaymentId);
  const existingInv = await invRef.get();
  const now = nowIso();
  const invPayload = {
    asaasPaymentId,
    status: String(payment.status || ''),
    value: Number(payment.value || 0),
    dueDate: String(payment.dueDate || ''),
    paidAt: payment.paymentDate ? String(payment.paymentDate) : null,
    invoiceUrl: payment.invoiceUrl || payment.bankSlipUrl || null,
    billingType: String(payment.billingType || ''),
    updatedAt: now,
    ...(existingInv.exists ? {} : { createdAt: now }),
  };
  await invRef.set(invPayload, { merge: true });

  const status = mapAsaasPaymentEventToStatus(event);
  if (status) {
    const patch = {
      'subscription.status': status,
      'subscription.updatedAt': now,
    };
    if (status === 'active') {
      patch['subscription.pastDueSince'] = null;
    }
    if (status === 'past_due') {
      const cur = q.docs[0].data()?.subscription?.pastDueSince;
      if (!cur) patch['subscription.pastDueSince'] = now;
    }
    await entRef.update(patch);
  }

  if (event === 'PAYMENT_DELETED' || event === 'SUBSCRIPTION_DELETED') {
    const freePlan = await ensureFreePlan();
    const cur = q.docs[0].data()?.subscription || {};
    if (cur.cancelAtPeriodEnd || event === 'SUBSCRIPTION_DELETED') {
      const freeSub = buildFreeSubscription(freePlan.id, now);
      freeSub.asaasCustomerId = cur.asaasCustomerId || null;
      await entRef.update({ subscription: freeSub });
    }
  }

  res.status(200).json({ ok: true, enterpriseId: entId });
});

exports.enforceSubscriptionGrace = onSchedule('every 24 hours', async () => {
  const settings = (await db.doc('platformSettings/billing').get()).data() || {};
  const graceDays = Number(settings.graceDays ?? 7);
  const freePlan = await ensureFreePlan();
  const snap = await db
    .collection('enterprises')
    .where('subscription.status', '==', 'past_due')
    .get();
  const secret = (await db.doc('platformSecrets/asaas').get()).data() || {};
  const asaasEnv = settings.asaasEnv === 'production' ? 'production' : 'sandbox';

  for (const docSnap of snap.docs) {
    const sub = docSnap.data().subscription || {};
    if (!shouldDowngradeAfterGrace(sub.pastDueSince, graceDays, new Date())) continue;
    if (sub.asaasSubscriptionId && secret.apiKey) {
      try {
        await asaasRequest({
          apiKey: secret.apiKey,
          env: asaasEnv,
          method: 'DELETE',
          path: `/subscriptions/${sub.asaasSubscriptionId}`,
        });
      } catch (e) {
        console.error('cancel asaas failed', docSnap.id, e.message);
      }
    }
    const freeSub = buildFreeSubscription(freePlan.id, nowIso());
    freeSub.asaasCustomerId = sub.asaasCustomerId || null;
    await docSnap.ref.update({ subscription: freeSub });
  }
});


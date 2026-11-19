const { setGlobalOptions } = require('firebase-functions/v2');
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');

setGlobalOptions({ maxInstances: 3, memory: '256MiB', concurrency: 80 });
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
const {
  syncInvoiceToPayable,
  syncEnterpriseSubscriptionPayables,
} = require('./billing/subscription-payables');

initializeApp();

const onlineOrders = require('./online-orders');
const whatsappService = require('./whatsapp/whatsapp-service');
const userSwitch = require('./auth/user-switch');

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
    const data = docSnap.data() || {};
    // Keep Free Starter naming/price consistent for every tenant seed
    if (data.name !== 'Free Starter' || Number(data.priceMonthly) !== 0 || data.active === false) {
      await docSnap.ref.set(
        {
          name: 'Free Starter',
          priceMonthly: 0,
          currency: 'BRL',
          active: true,
          updatedAt: nowIso(),
        },
        { merge: true }
      );
      return {
        id: docSnap.id,
        ...data,
        name: 'Free Starter',
        priceMonthly: 0,
        currency: 'BRL',
        active: true,
      };
    }
    return { id: docSnap.id, ...data };
  }
  const ref = db.collection('plans').doc();
  const now = nowIso();
  const data = {
    code: 'free',
    name: 'Free Starter',
    description: 'Plano inicial gratuito da empresa',
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

function addMonthsIso(fromIso, months) {
  const d = new Date(fromIso || Date.now());
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
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
 * selfRegisterEnterprise({ name, document, phone, tradeName?, address... })
 * Self-serve: usuário Auth autenticado (sem enterpriseId) cria empresa no plano Free
 * e vira admin master da conta.
 */
exports.selfRegisterEnterprise = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  if (request.auth.token.enterpriseId) {
    throw new HttpsError(
      'failed-precondition',
      'Este usuário já está vinculado a uma empresa'
    );
  }

  const name = String(request.data?.name || '').trim();
  const tradeName = request.data?.tradeName ? String(request.data.tradeName).trim() : '';
  const displayName = request.data?.displayName
    ? String(request.data.displayName).trim()
    : '';
  const documentDigits = String(request.data?.document || '').replace(/\D/g, '');
  const phoneDigits = String(request.data?.phone || '').replace(/\D/g, '');
  const email = String(request.auth.token.email || '')
    .trim()
    .toLowerCase();

  if (!name) {
    throw new HttpsError('invalid-argument', 'Razão social é obrigatória');
  }
  if (documentDigits.length !== 14) {
    throw new HttpsError('invalid-argument', 'CNPJ com 14 dígitos é obrigatório');
  }
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    throw new HttpsError('invalid-argument', 'WhatsApp/telefone com DDD é obrigatório');
  }
  if (!email) {
    throw new HttpsError('invalid-argument', 'E-mail da conta Auth é obrigatório');
  }

  const dup = await db
    .collection('enterprises')
    .where('document', '==', documentDigits)
    .limit(1)
    .get();
  if (!dup.empty) {
    throw new HttpsError('already-exists', 'Já existe uma empresa com este CNPJ');
  }

  let id = sanitizeId(request.data?.id || tradeName || name);
  if (!id || id.length < 3) {
    id = `emp-${documentDigits.slice(0, 8)}`;
  }

  let ref = db.doc(`enterprises/${id}`);
  let existing = await ref.get();
  if (existing.exists) {
    id = `${id}-${documentDigits.slice(-4)}`;
    ref = db.doc(`enterprises/${id}`);
    existing = await ref.get();
    if (existing.exists) {
      throw new HttpsError('already-exists', `Identificador ${id} já existe. Escolha outro nome.`);
    }
  }

  const freePlan = await ensureFreePlan();
  const createdAt = nowIso();
  const uid = request.auth.uid;
  const payload = {
    name,
    active: true,
    adminEmail: email,
    adminUid: uid,
    ...pickEnterpriseAddressFields({
      ...request.data,
      document: documentDigits,
      phone: phoneDigits,
      tradeName: tradeName || null,
    }),
    document: documentDigits,
    phone: phoneDigits,
    subscription: buildFreeSubscription(freePlan.id, createdAt),
    createdAt,
    updatedAt: createdAt,
    createdBy: uid,
  };

  await ref.set(payload);

  const existingClaims = (await auth.getUser(uid)).customClaims || {};
  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    enterpriseId: id,
    role: 'admin',
  });

  await db.doc(`enterprises/${id}/members/${uid}`).set(
    {
      email,
      role: 'admin',
      displayName: displayName || request.auth.token.name || email.split('@')[0],
      invitedBy: uid,
      invitedAt: createdAt,
      updatedAt: createdAt,
      active: true,
    },
    { merge: true }
  );

  await auth.updateUser(uid, {
    emailVerified: true,
    ...(displayName ? { displayName } : {}),
  });

  return {
    id,
    enterpriseId: id,
    role: 'admin',
    planCode: 'free',
    ...payload,
  };
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

  let passwordReset = false;
  // Se o Auth user já existia, tempPassword era ignorado → auth/wrong-password no login.
  // Admin pode redefinir a senha ao (re)convidar com tempPassword.
  if (!created && tempPassword && tempPassword.length >= 6) {
    await auth.updateUser(user.uid, {
      password: tempPassword,
      disabled: false,
      ...(displayName ? { displayName } : {}),
    });
    passwordReset = true;
    user = await auth.getUser(user.uid);
  } else if (displayName) {
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
    passwordReset,
    claims: nextClaims,
  };
});

/**
 * deleteMember({ enterpriseId, uid, deleteAuthUser? })
 * Remove members/{uid}, limpa claims do tenant e (default) apaga o usuário no Auth
 * para permitir recriar o acesso do zero.
 */
exports.deleteMember = onCall(async (request) => {
  const uid = String(request.data?.uid || '').trim();
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  const deleteAuthUser = request.data?.deleteAuthUser !== false;

  assertEnterpriseAdminOrPlatformAdmin(request, enterpriseId);

  if (!uid || !enterpriseId) {
    throw new HttpsError('invalid-argument', 'uid and enterpriseId are required');
  }

  if (request.auth.uid === uid) {
    throw new HttpsError('failed-precondition', 'Não é permitido excluir o próprio acesso');
  }

  const memberRef = db.doc(`enterprises/${enterpriseId}/members/${uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError('not-found', 'Membro não encontrado nesta empresa');
  }

  await memberRef.delete();

  let authDeleted = false;
  try {
    const user = await auth.getUser(uid);
    const existingClaims = user.customClaims || {};
    if (deleteAuthUser) {
      await auth.deleteUser(uid);
      authDeleted = true;
    } else {
      const nextClaims = { ...existingClaims };
      if (nextClaims.enterpriseId === enterpriseId) {
        delete nextClaims.enterpriseId;
        delete nextClaims.role;
      }
      await auth.setCustomUserClaims(uid, nextClaims);
    }
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw new HttpsError('internal', error.message || 'Falha ao atualizar Auth');
    }
  }

  const enterpriseSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  if (enterpriseSnap.exists && enterpriseSnap.data()?.adminUid === uid) {
    await db.doc(`enterprises/${enterpriseId}`).set(
      { adminUid: null, adminEmail: null, updatedAt: nowIso() },
      { merge: true }
    );
  }

  return { uid, enterpriseId, deleted: true, authDeleted };
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
  const entitlements = Array.isArray(request.data?.entitlements)
    ? request.data.entitlements.map((e) => String(e))
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
    entitlements,
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

exports.tokenizeBillingCard = onCall(async (request) => {
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  const creditCardRaw = request.data?.creditCard;
  const remoteIp = String(request.data?.remoteIp || request.rawRequest?.ip || '127.0.0.1');

  assertTenantAdminOnly(request, enterpriseId);

  if (!enterpriseId || !creditCardRaw || typeof creditCardRaw !== 'object') {
    throw new HttpsError('invalid-argument', 'enterpriseId and creditCard are required');
  }

  const creditCard = {
    holderName: String(creditCardRaw.holderName || '').trim(),
    number: String(creditCardRaw.number || '').replace(/\s+/g, ''),
    expiryMonth: String(creditCardRaw.expiryMonth || '').padStart(2, '0'),
    expiryYear: String(creditCardRaw.expiryYear || '').trim(),
    ccv: String(creditCardRaw.ccv || '').trim(),
  };

  if (
    !creditCard.holderName ||
    !creditCard.number ||
    !creditCard.expiryMonth ||
    !creditCard.expiryYear ||
    !creditCard.ccv
  ) {
    throw new HttpsError('invalid-argument', 'creditCard fields are required');
  }

  const asaas = await loadAsaasConfig();
  if (!asaas.apiKey) {
    throw new HttpsError('failed-precondition', 'Asaas API key is not configured');
  }

  const entRef = db.doc(`enterprises/${enterpriseId}`);
  const entSnap = await entRef.get();
  if (!entSnap.exists) {
    throw new HttpsError('not-found', `Enterprise ${enterpriseId} not found`);
  }
  const ent = entSnap.data() || {};
  const prevSub = ent.subscription || {};

  let customerId = prevSub.asaasCustomerId || null;
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

  const addr =
    request.data?.billingAddress && typeof request.data.billingAddress === 'object'
      ? request.data.billingAddress
      : {};
  const resolvedPostalCode =
    String(addr.zipCode || ent.zipCode || '').replace(/\D/g, '') || '00000000';
  const resolvedAddressNumber = String(addr.addressNumber || ent.addressNumber || 'S/N');
  const resolvedComplement = addr.complement || ent.complement || null;
  const rawPhoneDigits = String(addr.phone || ent.phone || '').replace(/\D/g, '');
  const resolvedPhone =
    (rawPhoneDigits.length === 12 || rawPhoneDigits.length === 13) &&
    rawPhoneDigits.startsWith('55')
      ? rawPhoneDigits.slice(2)
      : rawPhoneDigits || '11999999999';

  try {
    const tokRes = await asaasRequest({
      apiKey: asaas.apiKey,
      env: asaas.asaasEnv,
      method: 'POST',
      path: '/creditCard/tokenizeCreditCard',
      body: {
        customer: customerId,
        creditCard,
        creditCardHolderInfo: {
          name: creditCard.holderName || addr.name || ent.name || 'Titular',
          email: ent.adminEmail || request.auth.token.email || 'noreply@example.com',
          cpfCnpj: String(ent.document || '').replace(/\D/g, '') || undefined,
          postalCode: resolvedPostalCode,
          addressNumber: resolvedAddressNumber,
          addressComplement: resolvedComplement,
          phone: resolvedPhone,
          mobilePhone: resolvedPhone,
        },
        remoteIp,
      },
    });

    return {
      creditCardToken: String(tokRes.creditCardToken || ''),
      cardBrand: tokRes.creditCardBrand ? String(tokRes.creditCardBrand) : undefined,
      last4: tokRes.creditCardNumber ? String(tokRes.creditCardNumber) : undefined,
    };
  } catch (error) {
    const isClientErr = Number(error?.status) >= 400 && Number(error?.status) < 500;
    throw new HttpsError(
      isClientErr ? 'invalid-argument' : 'internal',
      error.message || 'Card tokenization failed'
    );
  }
});

exports.startSubscription = onCall(async (request) => {
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  const planId = String(request.data?.planId || '').trim();
  const paymentMethod = String(request.data?.paymentMethod || '').trim();
  const creditCardToken =
    typeof request.data?.creditCardToken === 'string'
      ? request.data.creditCardToken.trim()
      : '';
  const creditCardRaw = request.data?.creditCard;
  const remoteIp = String(request.data?.remoteIp || request.rawRequest?.ip || '127.0.0.1');

  assertTenantAdminOnly(request, enterpriseId);

  if (!enterpriseId || !planId) {
    throw new HttpsError('invalid-argument', 'enterpriseId and planId are required');
  }
  if (!['pix', 'credit_card'].includes(paymentMethod)) {
    throw new HttpsError('invalid-argument', 'paymentMethod must be pix|credit_card');
  }

  let creditCard = null;
  if (paymentMethod === 'credit_card') {
    if (creditCardToken) {
      // token path OK
    } else if (creditCardRaw && typeof creditCardRaw === 'object') {
      creditCard = {
        holderName: String(creditCardRaw.holderName || '').trim(),
        number: String(creditCardRaw.number || '').replace(/\s+/g, ''),
        expiryMonth: String(creditCardRaw.expiryMonth || '').padStart(2, '0'),
        expiryYear: String(creditCardRaw.expiryYear || '').trim(),
        ccv: String(creditCardRaw.ccv || '').trim(),
      };
      if (
        !creditCard.holderName ||
        !creditCard.number ||
        !creditCard.expiryMonth ||
        !creditCard.expiryYear ||
        !creditCard.ccv
      ) {
        throw new HttpsError('invalid-argument', 'creditCard fields are required');
      }
    } else {
      throw new HttpsError(
        'invalid-argument',
        'creditCard or creditCardToken is required for credit_card'
      );
    }
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

    const now = nowIso();
    const dueDate = now.slice(0, 10);
    let paymentUrl = null;
    let asaasPaymentId = null;
    let paymentStatus = null;
    let returnedCardToken = creditCardToken || null;
    let pix = null;
    let subscription;

    // Cartão: assinatura recorrente. PIX: cobrança avulsa 1 mês + QR.
    if (paymentMethod === 'credit_card') {
      const subBody = {
        customer: customerId,
        billingType: 'CREDIT_CARD',
        value: Number(plan.priceMonthly),
        nextDueDate: dueDate,
        cycle: 'MONTHLY',
        description: `ERP ${plan.name}`,
        externalReference: enterpriseId,
        remoteIp,
      };
      if (creditCardToken) {
        subBody.creditCardToken = creditCardToken;
      } else {
        const addr =
          request.data?.billingAddress && typeof request.data.billingAddress === 'object'
            ? request.data.billingAddress
            : {};
        const resolvedPostalCode =
          String(addr.zipCode || ent.zipCode || '').replace(/\D/g, '') || '00000000';
        const resolvedAddressNumber = String(addr.addressNumber || ent.addressNumber || 'S/N');
        const resolvedComplement = addr.complement || ent.complement || null;
        const rawPhoneDigits = String(addr.phone || ent.phone || '').replace(/\D/g, '');
        const resolvedPhone =
          (rawPhoneDigits.length === 12 || rawPhoneDigits.length === 13) &&
          rawPhoneDigits.startsWith('55')
            ? rawPhoneDigits.slice(2)
            : rawPhoneDigits || '11999999999';
        subBody.creditCard = creditCard;
        subBody.creditCardHolderInfo = {
          name: creditCard.holderName || addr.name || ent.name || 'Titular',
          email: ent.adminEmail || request.auth.token.email || 'noreply@example.com',
          cpfCnpj: String(ent.document || '').replace(/\D/g, '') || undefined,
          postalCode: resolvedPostalCode,
          addressNumber: resolvedAddressNumber,
          addressComplement: resolvedComplement,
          phone: resolvedPhone,
          mobilePhone: resolvedPhone,
        };
      }

      // Asaas: enviar creditCard + creditCardHolderInfo (ou creditCardToken).
      // Resposta devolve creditCardToken para cobranças futuras — nunca exigir token na 1ª vez.
      const asaasSub = await asaasRequest({
        apiKey: asaas.apiKey,
        env: asaas.asaasEnv,
        method: 'POST',
        path: '/subscriptions',
        body: subBody,
      });

      returnedCardToken =
        asaasSub?.creditCard?.creditCardToken != null
          ? String(asaasSub.creditCard.creditCardToken)
          : asaasSub?.creditCardToken != null
            ? String(asaasSub.creditCardToken)
            : creditCardToken || null;

      let cardPaymentConfirmed = false;
      try {
        const payments = await asaasRequest({
          apiKey: asaas.apiKey,
          env: asaas.asaasEnv,
          method: 'GET',
          path: `/payments?subscription=${asaasSub.id}&limit=1`,
        });
        const first = payments?.data?.[0];
        asaasPaymentId = first?.id ? String(first.id) : null;
        paymentStatus = first?.status ? String(first.status) : null;
        paymentUrl =
          first?.invoiceUrl || first?.bankSlipUrl || first?.transactionReceiptUrl || null;
        if (
          asaasPaymentId &&
          ['CONFIRMED', 'RECEIVED'].includes(String(first?.status || '').toUpperCase())
        ) {
          cardPaymentConfirmed = true;
        }
        if (asaasPaymentId) {
          const invRef = entRef.collection('subscriptionInvoices').doc(asaasPaymentId);
          const cardInvPayload = {
            asaasPaymentId,
            status: paymentStatus || 'PENDING',
            value: Number(first?.value || plan.priceMonthly),
            dueDate: String(first?.dueDate || dueDate),
            paidAt: cardPaymentConfirmed ? now : null,
            invoiceUrl: paymentUrl,
            billingType: 'CREDIT_CARD',
            createdAt: now,
            updatedAt: now,
          };
          await invRef.set(cardInvPayload, { merge: true });
          try {
            await syncInvoiceToPayable({
              db,
              enterpriseId,
              planName: plan.name,
              planCode: plan.code,
              billingMode: 'recurring',
              invoice: cardInvPayload,
            });
          } catch (payErr) {
            console.warn('syncInvoiceToPayable (card) skipped:', payErr.message);
          }
        }
      } catch (e) {
        console.warn('list payments after subscribe failed', e.message);
      }

      const freePlan = await ensureFreePlan();
      const prevActivePlanId =
        prevSub.status === 'active' && prevSub.planId ? prevSub.planId : freePlan.id;
      const prevActivePlanCode =
        prevSub.status === 'active' && prevSub.planCode ? prevSub.planCode : 'free';

      subscription = {
        planId: cardPaymentConfirmed ? plan.id : prevActivePlanId,
        planCode: cardPaymentConfirmed ? plan.code : prevActivePlanCode,
        pendingPlanId: cardPaymentConfirmed ? null : plan.id,
        pendingPlanCode: cardPaymentConfirmed ? null : plan.code,
        status: cardPaymentConfirmed ? 'active' : 'incomplete',
        billingCycle: 'monthly',
        billingMode: 'recurring',
        currentPeriodStart: now,
        currentPeriodEnd: asaasSub.nextDueDate
          ? `${asaasSub.nextDueDate}T23:59:59.000Z`
          : addMonthsIso(now, 1),
        cancelAtPeriodEnd: false,
        pastDueSince: null,
        asaasCustomerId: customerId,
        asaasSubscriptionId: asaasSub.id || null,
        asaasCreditCardToken: returnedCardToken,
        paymentMethod,
        updatedAt: now,
      };
    } else {
      const payment = await asaasRequest({
        apiKey: asaas.apiKey,
        env: asaas.asaasEnv,
        method: 'POST',
        path: '/payments',
        body: {
          customer: customerId,
          billingType: 'PIX',
          value: Number(plan.priceMonthly),
          dueDate,
          description: `ERP ${plan.name} — 1 mês`,
          externalReference: enterpriseId,
        },
      });

      asaasPaymentId = String(payment.id);
      paymentStatus = String(payment.status || 'PENDING');
      paymentUrl =
        payment.invoiceUrl ||
        payment.bankSlipUrl ||
        payment.transactionReceiptUrl ||
        null;

      try {
        const qr = await asaasRequest({
          apiKey: asaas.apiKey,
          env: asaas.asaasEnv,
          method: 'GET',
          path: `/payments/${asaasPaymentId}/pixQrCode`,
        });
        pix = {
          encodedImage: String(qr.encodedImage || ''),
          payload: String(qr.payload || ''),
          expirationDate: qr.expirationDate ? String(qr.expirationDate) : null,
        };
      } catch (e) {
        console.warn('pixQrCode first attempt failed, trying EVP key creation:', e.message);
        try {
          await asaasRequest({
            apiKey: asaas.apiKey,
            env: asaas.asaasEnv,
            method: 'POST',
            path: '/pix/addressKeys',
            body: { type: 'EVP' },
          });
          const qrRetry = await asaasRequest({
            apiKey: asaas.apiKey,
            env: asaas.asaasEnv,
            method: 'GET',
            path: `/payments/${asaasPaymentId}/pixQrCode`,
          });
          pix = {
            encodedImage: String(qrRetry.encodedImage || ''),
            payload: String(qrRetry.payload || ''),
            expirationDate: qrRetry.expirationDate ? String(qrRetry.expirationDate) : null,
          };
        } catch (retryErr) {
          console.warn('pixQrCode retry failed:', retryErr.message);
        }
      }

      const invRef = entRef.collection('subscriptionInvoices').doc(asaasPaymentId);
      const pixInvPayload = {
        asaasPaymentId,
        status: paymentStatus,
        value: Number(payment.value || plan.priceMonthly),
        dueDate: String(payment.dueDate || dueDate),
        paidAt: null,
        invoiceUrl: paymentUrl,
        billingType: 'PIX',
        createdAt: now,
        updatedAt: now,
      };
      await invRef.set(pixInvPayload, { merge: true });
      try {
        await syncInvoiceToPayable({
          db,
          enterpriseId,
          planName: plan.name,
          planCode: plan.code,
          billingMode: 'one_time',
          invoice: pixInvPayload,
        });
      } catch (payErr) {
        console.warn('syncInvoiceToPayable (pix) skipped:', payErr.message);
      }

      const freePlan = await ensureFreePlan();
      const prevActivePlanId =
        prevSub.status === 'active' && prevSub.planId ? prevSub.planId : freePlan.id;
      const prevActivePlanCode =
        prevSub.status === 'active' && prevSub.planCode ? prevSub.planCode : 'free';

      subscription = {
        planId: prevActivePlanId,
        planCode: prevActivePlanCode,
        pendingPlanId: plan.id,
        pendingPlanCode: plan.code,
        status: prevSub.status === 'active' ? 'active' : 'incomplete',
        billingCycle: 'monthly',
        billingMode: 'one_time',
        currentPeriodStart: prevSub.currentPeriodStart || now,
        currentPeriodEnd: prevSub.currentPeriodEnd || addMonthsIso(now, 1),
        cancelAtPeriodEnd: false,
        pastDueSince: null,
        asaasCustomerId: customerId,
        asaasSubscriptionId: null,
        paymentMethod: 'pix',
        updatedAt: now,
      };
    }

    await entRef.set({ subscription, updatedAt: now }, { merge: true });
    return {
      subscription,
      paymentUrl,
      asaasPaymentId,
      paymentStatus,
      creditCardToken: returnedCardToken,
      pix,
    };
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
    const isClientErr = Number(error?.status) >= 400 && Number(error?.status) < 500;
    throw new HttpsError(
      isClientErr ? 'invalid-argument' : 'internal',
      error.message || 'Asaas subscription failed'
    );
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
  if (sub.planCode === 'free') {
    throw new HttpsError('failed-precondition', 'No paid subscription to cancel');
  }

  if (sub.asaasSubscriptionId) {
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

  // Sincroniza fatura da assinatura no Contas a Pagar da empresa
  try {
    const entSub = q.docs[0].data()?.subscription || {};
    const targetPlanId = entSub.pendingPlanId || entSub.planId;
    let planName = entSub.pendingPlanCode || entSub.planCode || 'Assinatura';
    const planCode = entSub.pendingPlanCode || entSub.planCode || '';
    if (targetPlanId) {
      const planSnap = await db.doc(`plans/${targetPlanId}`).get();
      if (planSnap.exists && planSnap.data()?.name) {
        planName = String(planSnap.data().name);
      }
    }
    if (String(planCode).toLowerCase() !== 'free') {
      await syncInvoiceToPayable({
        db,
        enterpriseId: entId,
        planName,
        planCode,
        billingMode: entSub.billingMode || (entSub.asaasSubscriptionId ? 'recurring' : 'one_time'),
        invoice: invPayload,
      });
    }
  } catch (payErr) {
    console.warn('asaasWebhook syncInvoiceToPayable skipped:', payErr.message);
  }

  const status = mapAsaasPaymentEventToStatus(event);
  if (status) {
    const curSub = q.docs[0].data()?.subscription || {};
    const patch = {
      'subscription.status': status,
      'subscription.updatedAt': now,
    };
    if (status === 'active') {
      patch['subscription.pastDueSince'] = null;
      if (curSub.pendingPlanId) {
        patch['subscription.planId'] = curSub.pendingPlanId;
        patch['subscription.pendingPlanId'] = null;
      }
      if (curSub.pendingPlanCode) {
        patch['subscription.planCode'] = curSub.pendingPlanCode;
        patch['subscription.pendingPlanCode'] = null;
      }
      // PIX/boleto: paid month starts now and ends in +1 month
      if (curSub.billingMode === 'one_time' || !curSub.asaasSubscriptionId) {
        patch['subscription.currentPeriodStart'] = now;
        patch['subscription.currentPeriodEnd'] = addMonthsIso(now, 1);
        patch['subscription.billingMode'] = 'one_time';
      }
    }
    if (status === 'past_due') {
      const cur = curSub.pastDueSince;
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
  const secret = (await db.doc('platformSecrets/asaas').get()).data() || {};
  const asaasEnv = settings.asaasEnv === 'production' ? 'production' : 'sandbox';
  const now = new Date();

  async function downgrade(docSnap, sub) {
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

  const pastDueSnap = await db
    .collection('enterprises')
    .where('subscription.status', '==', 'past_due')
    .get();
  for (const docSnap of pastDueSnap.docs) {
    const sub = docSnap.data().subscription || {};
    if (!shouldDowngradeAfterGrace(sub.pastDueSince, graceDays, now)) continue;
    await downgrade(docSnap, sub);
  }

  // PIX/boleto one-time: after period end → Free (must pay again)
  const activeSnap = await db
    .collection('enterprises')
    .where('subscription.status', '==', 'active')
    .get();
  for (const docSnap of activeSnap.docs) {
    const sub = docSnap.data().subscription || {};
    const isOneTime =
      sub.billingMode === 'one_time' ||
      sub.paymentMethod === 'pix' ||
      sub.paymentMethod === 'boleto';
    if (!isOneTime || sub.planCode === 'free') continue;
    if (!sub.currentPeriodEnd) continue;
    if (Date.parse(sub.currentPeriodEnd) > now.getTime()) continue;
    await downgrade(docSnap, sub);
  }

  // cancelAtPeriodEnd after period (card or one-time)
  for (const docSnap of activeSnap.docs) {
    const sub = docSnap.data().subscription || {};
    if (!sub.cancelAtPeriodEnd || !sub.currentPeriodEnd) continue;
    if (Date.parse(sub.currentPeriodEnd) > now.getTime()) continue;
    await downgrade(docSnap, sub);
  }

  // Garante o lançamento mensal recorrente em Contas a Pagar para todas as empresas com plano pago ativo
  const allTrackable = [...activeSnap.docs, ...pastDueSnap.docs];
  for (const docSnap of allTrackable) {
    try {
      await syncEnterpriseSubscriptionPayables({
        db,
        enterpriseId: docSnap.id,
        enterpriseData: docSnap.data(),
        now,
      });
    } catch (syncErr) {
      console.warn('enforceSubscriptionGrace sync payables failed:', docSnap.id, syncErr.message);
    }
  }
});

const localActionHandlers = {};

localActionHandlers.syncSubscriptionPayables = async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const requestedEnterpriseId = String(request.data?.enterpriseId || '').trim();
  const isPlatformAdmin = request.auth.token.platformAdmin === true;

  if (requestedEnterpriseId) {
    if (!isPlatformAdmin) {
      const sameEnt = request.auth.token.enterpriseId === requestedEnterpriseId;
      const role = request.auth.token.role;
      if (!sameEnt || (role !== 'admin' && role !== 'gestor')) {
        throw new HttpsError('permission-denied', 'Admin or gestor required');
      }
    }
    const result = await syncEnterpriseSubscriptionPayables({
      db,
      enterpriseId: requestedEnterpriseId,
    });
    return { results: [result] };
  }

  if (!isPlatformAdmin) {
    throw new HttpsError('permission-denied', 'platformAdmin claim required to sync all enterprises');
  }

  const snap = await db.collection('enterprises').get();
  const results = [];
  for (const docSnap of snap.docs) {
    const res = await syncEnterpriseSubscriptionPayables({
      db,
      enterpriseId: docSnap.id,
      enterpriseData: docSnap.data(),
    });
    results.push(res);
  }
  return { totalEnterprises: snap.size, results };
};

localActionHandlers.listAccessibleWorkspaces = async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const uid = request.auth.uid;
  const isPlatformAdmin = request.auth.token.platformAdmin === true;
  const currentEnterpriseId =
    typeof request.auth.token.enterpriseId === 'string' ? request.auth.token.enterpriseId : '';
  const currentRole =
    typeof request.auth.token.role === 'string' ? request.auth.token.role : 'operador';

  const plansSnap = await db.collection('plans').get();
  const planById = new Map();
  const planByCode = new Map();
  for (const p of plansSnap.docs) {
    const data = p.data() || {};
    planById.set(p.id, data);
    if (data.code) planByCode.set(String(data.code).toLowerCase(), data);
  }

  function formatWorkspace(entId, entData, role) {
    const sub = entData?.subscription || {};
    const planObj =
      (sub.planId && planById.get(sub.planId)) ||
      (sub.planCode && planByCode.get(String(sub.planCode).toLowerCase())) ||
      null;
    const planCode = String(planObj?.code || sub.planCode || 'free').toLowerCase();
    const planLabel = String(
      planObj?.name ||
        (planCode === 'ultra' ? 'Ultra' : planCode === 'pro' ? 'Pro' : 'Free')
    );
    const logo =
      entData?.onlineStore?.logoUrl ||
      entData?.logoUrl ||
      '';
    return {
      id: entId,
      name: String(entData?.tradeName || entData?.name || entId),
      logo: String(logo),
      plan: planLabel,
      planCode,
      role: String(role || 'operador'),
    };
  }

  if (isPlatformAdmin) {
    const entSnap = await db.collection('enterprises').get();
    const workspaces = entSnap.docs
      .filter((d) => d.data()?.active !== false)
      .map((d) => formatWorkspace(d.id, d.data(), 'admin'))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return { workspaces };
  }

  const enterpriseRoles = new Map();
  if (currentEnterpriseId) {
    enterpriseRoles.set(currentEnterpriseId, currentRole);
  }

  // Also inspect multi-enterprise memberships if user belongs to multiple branches
  try {
    const userSnap = await db.doc(`users/${uid}`).get();
    const memberships = userSnap.exists ? userSnap.data()?.memberships : null;
    if (Array.isArray(memberships)) {
      for (const m of memberships) {
        if (m && m.enterpriseId && m.active !== false) {
          enterpriseRoles.set(String(m.enterpriseId), String(m.role || 'operador'));
        }
      }
    }
  } catch {
    // ignore optional memberships array
  }

  const workspaces = [];
  for (const [entId, role] of enterpriseRoles.entries()) {
    const entSnap = await db.doc(`enterprises/${entId}`).get();
    if (!entSnap.exists || entSnap.data()?.active === false) continue;
    const memSnap = await db.doc(`enterprises/${entId}/members/${uid}`).get();
    if (memSnap.exists && memSnap.data()?.active === false) continue;
    const resolvedRole = memSnap.exists && memSnap.data()?.role ? memSnap.data().role : role;
    workspaces.push(formatWorkspace(entId, entSnap.data(), resolvedRole));
  }

  workspaces.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { workspaces };
};

localActionHandlers.switchActiveEnterprise = async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const uid = request.auth.uid;
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  if (!enterpriseId) {
    throw new HttpsError('invalid-argument', 'enterpriseId required');
  }

  const isPlatformAdmin = request.auth.token.platformAdmin === true;
  const entSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  if (!entSnap.exists || entSnap.data()?.active === false) {
    throw new HttpsError('not-found', 'Empresa não encontrada ou inativa.');
  }

  const memSnap = await db.doc(`enterprises/${enterpriseId}/members/${uid}`).get();
  let targetRole = 'admin';

  if (isPlatformAdmin) {
    if (memSnap.exists && TENANT_ROLES.has(memSnap.data()?.role)) {
      targetRole = memSnap.data().role;
    }
  } else {
    if (!memSnap.exists || memSnap.data()?.active === false) {
      throw new HttpsError('permission-denied', 'Sem acesso a esta empresa.');
    }
    const memberRole = memSnap.data()?.role;
    targetRole = TENANT_ROLES.has(memberRole) ? memberRole : 'operador';
  }

  const userRecord = await auth.getUser(uid);
  const existingClaims = userRecord.customClaims || {};
  const nextClaims = {
    ...existingClaims,
    enterpriseId,
    role: targetRole,
    ...(isPlatformAdmin ? { platformAdmin: true } : {}),
  };
  await auth.setCustomUserClaims(uid, nextClaims);

  return {
    switched: true,
    enterpriseId,
    role: targetRole,
  };
};

exports.getPublicStorefront = onlineOrders.getPublicStorefront;
exports.placeOnlineOrder = onlineOrders.placeOnlineOrder;
exports.acceptOnlineOrder = onlineOrders.acceptOnlineOrder;
exports.rejectOnlineOrder = onlineOrders.rejectOnlineOrder;
exports.upsertOnlineStoreConfig = onlineOrders.upsertOnlineStoreConfig;
exports.lookupPublicCustomerByPhone = onlineOrders.lookupPublicCustomerByPhone;
exports.listPublicOrdersByPhone = onlineOrders.listPublicOrdersByPhone;
exports.getPublicOrderStatus = onlineOrders.getPublicOrderStatus;
exports.updateOnlineOrderStatus = onlineOrders.updateOnlineOrderStatus;
exports.publicStoreShareMeta = onlineOrders.publicStoreShareMeta;

// Consolidated low-cost Cloud Function router (17 actions -> 1 single Cloud Run container)
const ERP_ACTION_HANDLERS = {
  ...whatsappService.handlers,
  ...userSwitch.handlers,
  ...localActionHandlers,
};

exports.erpActions = onCall({ maxInstances: 2, memory: '256MiB', concurrency: 80 }, async (request) => {
  const action = String(request.data?.action || '').trim();
  const handler = ERP_ACTION_HANDLERS[action];
  if (!handler) {
    throw new HttpsError('invalid-argument', `Ação desconhecida: ${action}`);
  }
  return handler(request);
});


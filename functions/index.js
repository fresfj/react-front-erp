const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();

const auth = getAuth();
const db = getFirestore();

const TENANT_ROLES = new Set(['admin', 'gestor', 'operador']);

function assertPlatformAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  if (request.auth.token.platformAdmin !== true) {
    throw new HttpsError('permission-denied', 'platformAdmin claim required');
  }
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

  const payload = {
    name,
    active: true,
    adminEmail: adminEmail || null,
    ...pickEnterpriseAddressFields(request.data),
    document: documentDigits,
    createdAt: nowIso(),
    updatedAt: nowIso(),
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


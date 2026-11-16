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

function nowIso() {
  return new Date().toISOString();
}

function sanitizeId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-');
}

/**
 * createEnterprise({ id, name, adminEmail? })
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

  const ref = db.doc(`enterprises/${id}`);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpsError('already-exists', `Enterprise ${id} already exists`);
  }

  const payload = {
    name,
    active: true,
    adminEmail: adminEmail || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: request.auth.uid,
  };

  await ref.set(payload);
  return { id, ...payload };
});

/**
 * updateEnterprise({ id, name?, active?, adminEmail? })
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

  const patch = { updatedAt: nowIso() };
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

  await ref.set(patch, { merge: true });
  return { id, ...snap.data(), ...patch };
});

/**
 * inviteMember({ email, enterpriseId, role, tempPassword? })
 * getOrCreate Auth user + setCustomUserClaims + members/{uid}
 */
exports.inviteMember = onCall(async (request) => {
  assertPlatformAdmin(request);

  const email = String(request.data?.email || '')
    .trim()
    .toLowerCase();
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  const role = String(request.data?.role || '').trim();
  const tempPassword = request.data?.tempPassword
    ? String(request.data.tempPassword)
    : undefined;

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
      emailVerified: true,
      disabled: false,
    });
    created = true;
  }

  const existingClaims = user.customClaims || {};
  const nextClaims = {
    ...existingClaims,
    enterpriseId,
    role,
  };
  await auth.setCustomUserClaims(user.uid, nextClaims);

  await db.doc(`enterprises/${enterpriseId}/members/${user.uid}`).set(
    {
      email,
      role,
      displayName: user.displayName || '',
      invitedBy: request.auth.uid,
      invitedAt: nowIso(),
      updatedAt: nowIso(),
    },
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
 * setMemberClaims({ uid, enterpriseId, role })
 */
exports.setMemberClaims = onCall(async (request) => {
  assertPlatformAdmin(request);

  const uid = String(request.data?.uid || '').trim();
  const enterpriseId = sanitizeId(request.data?.enterpriseId);
  const role = String(request.data?.role || '').trim();

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

  await db.doc(`enterprises/${enterpriseId}/members/${uid}`).set(
    {
      email: user.email || '',
      role,
      updatedAt: nowIso(),
      claimsSetBy: request.auth.uid,
    },
    { merge: true }
  );

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

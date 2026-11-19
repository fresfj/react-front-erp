const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const handlers = {};

// ----------------------------------------------------------------------

const PIN_REGEX = /^\d{4,6}$/;
const RETURN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

function nowIso() {
  return new Date().toISOString();
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), String(salt), 32).toString('hex');
}

function verifyPin(pin, salt, expectedHex) {
  if (!salt || !expectedHex) return false;
  const computed = Buffer.from(hashPin(pin, salt), 'hex');
  const expected = Buffer.from(String(expectedHex), 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

// ----------------------------------------------------------------------

handlers.listSwitchableMembers = async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const db = getFirestore();
  const callerUid = request.auth.uid;
  const isPlatformAdmin = request.auth.token.platformAdmin === true;
  const callerRole = String(request.auth.token.role || '');
  const enterpriseId = String(
    request.data?.enterpriseId || request.auth.token.enterpriseId || ''
  ).trim();

  if (!enterpriseId) {
    return { members: [], canDirectSwitch: false };
  }

  if (!isPlatformAdmin && request.auth.token.enterpriseId !== enterpriseId) {
    throw new HttpsError('permission-denied', 'Wrong enterprise');
  }

  const snap = await db.collection(`enterprises/${enterpriseId}/members`).get();
  const members = [];

  for (const docSnap of snap.docs) {
    if (docSnap.id === callerUid) continue;
    const data = docSnap.data() || {};
    if (data.active === false) continue;
    members.push({
      uid: docSnap.id,
      displayName: String(data.displayName || data.email || 'Colaborador'),
      email: String(data.email || ''),
      photoURL: String(data.photoURL || ''),
      role: String(data.role || 'operador'),
      hasQuickPin: data.hasQuickPin === true,
    });
  }

  members.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));

  return {
    members,
    canDirectSwitch: isPlatformAdmin || callerRole === 'admin',
  };
};

// ----------------------------------------------------------------------

handlers.setMemberQuickPin = async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const db = getFirestore();
  const callerUid = request.auth.uid;
  const isPlatformAdmin = request.auth.token.platformAdmin === true;
  const callerRole = String(request.auth.token.role || '');
  const enterpriseId = String(
    request.data?.enterpriseId || request.auth.token.enterpriseId || ''
  ).trim();
  const targetUid = String(request.data?.targetUid || callerUid).trim();
  const pin = String(request.data?.pin || '').trim();

  if (!PIN_REGEX.test(pin)) {
    throw new HttpsError('invalid-argument', 'O PIN deve conter entre 4 e 6 dígitos numéricos.');
  }

  const isSelf = targetUid === callerUid;
  const canManageOthers =
    isPlatformAdmin ||
    (callerRole === 'admin' && enterpriseId && request.auth.token.enterpriseId === enterpriseId);

  if (!isSelf && !canManageOthers) {
    throw new HttpsError('permission-denied', 'Sem permissão para alterar o PIN deste usuário.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const pinHash = hashPin(pin, salt);
  const ts = nowIso();

  await db.doc(`userSwitchSecrets/${targetUid}`).set(
    {
      pinSalt: salt,
      pinHash,
      enterpriseId: enterpriseId || null,
      failedAttempts: 0,
      lockedUntil: null,
      updatedBy: callerUid,
      updatedAt: ts,
    },
    { merge: true }
  );

  if (enterpriseId) {
    const memberRef = db.doc(`enterprises/${enterpriseId}/members/${targetUid}`);
    const memberSnap = await memberRef.get();
    if (memberSnap.exists) {
      await memberRef.set({ hasQuickPin: true, updatedAt: ts }, { merge: true });
    }
  }

  return { saved: true, targetUid };
};

// ----------------------------------------------------------------------

handlers.switchUserSession = async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  const db = getFirestore();
  const auth = getAuth();
  const callerUid = request.auth.uid;
  const isPlatformAdmin = request.auth.token.platformAdmin === true;
  const callerRole = String(request.auth.token.role || '');
  const enterpriseId = String(
    request.data?.enterpriseId || request.auth.token.enterpriseId || ''
  ).trim();
  const targetUid = String(request.data?.targetUid || '').trim();
  const pin = String(request.data?.pin || '').trim();

  if (!enterpriseId || !targetUid) {
    throw new HttpsError('invalid-argument', 'enterpriseId and targetUid required');
  }
  if (targetUid === callerUid) {
    throw new HttpsError('invalid-argument', 'Você já está conectado neste usuário.');
  }
  if (!isPlatformAdmin && request.auth.token.enterpriseId !== enterpriseId) {
    throw new HttpsError('permission-denied', 'Wrong enterprise');
  }

  const targetMemberSnap = await db
    .doc(`enterprises/${enterpriseId}/members/${targetUid}`)
    .get();
  if (!targetMemberSnap.exists || targetMemberSnap.data()?.active === false) {
    throw new HttpsError('not-found', 'Colaborador não encontrado ou inativo nesta empresa.');
  }

  const targetAuthUser = await auth.getUser(targetUid);
  const targetIsPlatformAdmin = targetAuthUser.customClaims?.platformAdmin === true;

  // Never allow non-platformAdmin to switch into a platformAdmin account
  if (targetIsPlatformAdmin && !isPlatformAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Não é permitido alternar para uma conta de Administrador da Plataforma.'
    );
  }

  const canDirectSwitch = isPlatformAdmin || callerRole === 'admin';
  let switchMode = 'direct';

  if (!canDirectSwitch) {
    switchMode = 'pin';
    if (!PIN_REGEX.test(pin)) {
      throw new HttpsError('invalid-argument', 'Informe o PIN de 4 a 6 dígitos do colaborador.');
    }

    const secretRef = db.doc(`userSwitchSecrets/${targetUid}`);
    const secretSnap = await secretRef.get();
    if (!secretSnap.exists) {
      throw new HttpsError(
        'failed-precondition',
        'Este colaborador ainda não configurou um PIN de troca rápida.'
      );
    }

    const secret = secretSnap.data() || {};
    if (secret.lockedUntil && Date.parse(String(secret.lockedUntil)) > Date.now()) {
      throw new HttpsError(
        'resource-exhausted',
        'Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente.'
      );
    }

    const valid = verifyPin(pin, secret.pinSalt, secret.pinHash);
    if (!valid) {
      const nextAttempts = Number(secret.failedAttempts || 0) + 1;
      const patch = {
        failedAttempts: nextAttempts,
        updatedAt: nowIso(),
      };
      if (nextAttempts >= MAX_PIN_ATTEMPTS) {
        patch.lockedUntil = new Date(Date.now() + PIN_LOCKOUT_MS).toISOString();
        patch.failedAttempts = 0;
      }
      await secretRef.set(patch, { merge: true });
      throw new HttpsError('permission-denied', 'PIN incorreto.');
    }

    await secretRef.set(
      { failedAttempts: 0, lockedUntil: null, updatedAt: nowIso() },
      { merge: true }
    );
  }

  let customToken;
  try {
    customToken = await auth.createCustomToken(targetUid);
  } catch (err) {
    console.error('createCustomToken failed:', err);
    throw new HttpsError(
      'internal',
      `Erro ao gerar token de troca de usuário: ${err.message}`
    );
  }

  const ts = nowIso();
  let returnSessionId = null;

  if (switchMode === 'direct') {
    const returnRef = db.collection('userSwitchReturnSessions').doc();
    returnSessionId = returnRef.id;
    await returnRef.set({
      originalUid: callerUid,
      targetUid,
      enterpriseId,
      used: false,
      createdAt: ts,
      expiresAt: new Date(Date.now() + RETURN_SESSION_TTL_MS).toISOString(),
    });
  }

  try {
    await db.collection(`enterprises/${enterpriseId}/switchAuditLogs`).add({
      fromUid: callerUid,
      toUid: targetUid,
      mode: switchMode,
      createdAt: ts,
    });
  } catch (auditErr) {
    console.warn('switchAuditLogs write skipped:', auditErr.message);
  }

  const targetData = targetMemberSnap.data() || {};
  return {
    customToken,
    returnSessionId,
    targetUser: {
      uid: targetUid,
      displayName: String(targetData.displayName || targetAuthUser.displayName || targetAuthUser.email || ''),
      email: String(targetData.email || targetAuthUser.email || ''),
      role: String(targetData.role || targetAuthUser.customClaims?.role || 'operador'),
    },
  };
};

// ----------------------------------------------------------------------

handlers.returnFromUserSwitch = async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const db = getFirestore();
  const auth = getAuth();
  const returnSessionId = String(request.data?.returnSessionId || '').trim();
  if (!returnSessionId) {
    throw new HttpsError('invalid-argument', 'returnSessionId required');
  }

  const ref = db.doc(`userSwitchReturnSessions/${returnSessionId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Sessão de retorno não encontrada.');
  }

  const data = snap.data() || {};
  if (data.used === true) {
    throw new HttpsError('failed-precondition', 'Sessão de retorno já utilizada.');
  }
  if (data.targetUid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'Sessão de retorno inválida para este usuário.');
  }
  if (!data.expiresAt || Date.parse(String(data.expiresAt)) <= Date.now()) {
    throw new HttpsError('deadline-exceeded', 'Sessão de retorno expirada. Faça login novamente.');
  }

  const customToken = await auth.createCustomToken(String(data.originalUid));
  await ref.set({ used: true, returnedAt: nowIso() }, { merge: true });

  return {
    customToken,
    originalUid: String(data.originalUid),
  };
};

module.exports = { handlers };

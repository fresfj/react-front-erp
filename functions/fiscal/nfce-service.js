const { canEmitNfce, nextNfceStatus } = require('./nfce-domain');
const { createFiscalIssuer, createMockFiscalIssuer } = require('./fiscal-issuer');

function nowIso() {
  return new Date().toISOString();
}

function secretsRef(db, enterpriseId) {
  return db.doc(`enterprises/${enterpriseId}/secrets/fiscal`);
}

function saleRef(db, enterpriseId, saleId) {
  return db.doc(`enterprises/${enterpriseId}/sales/${saleId}`);
}

function enterpriseRef(db, enterpriseId) {
  return db.doc(`enterprises/${enterpriseId}`);
}

async function loadFiscalSecrets(db, enterpriseId) {
  const snap = await secretsRef(db, enterpriseId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (!data.apiToken) return null;
  return {
    provider: data.provider || 'focus',
    apiToken: String(data.apiToken),
    cscId: data.cscId ? String(data.cscId) : '',
    cscToken: data.cscToken ? String(data.cscToken) : '',
  };
}

function resolveIssuer(enterprise, secrets) {
  if (process.env.NFCE_ISSUER === 'mock') {
    return createMockFiscalIssuer();
  }
  const provider = enterprise.fiscalIssuerProvider || secrets?.provider || 'focus';
  return createFiscalIssuer(provider);
}

async function loadProductsForSale(db, enterpriseId, sale) {
  const ids = [...new Set((sale.items || []).map((i) => i.productId).filter(Boolean))];
  const products = [];
  await Promise.all(
    ids.map(async (id) => {
      const snap = await db.doc(`enterprises/${enterpriseId}/products/${id}`).get();
      if (!snap.exists) {
        products.push({ id, productId: id });
        return;
      }
      products.push({ id, productId: id, ...snap.data() });
    })
  );
  return products;
}

function enterpriseSnapshot(enterprise, hasIssuerCredentials) {
  return {
    nfceEnabled: enterprise.nfceEnabled === true,
    taxRegime: enterprise.taxRegime || null,
    nfceSeries: enterprise.nfceSeries || null,
    nfceEnvironment:
      enterprise.nfceEnvironment === 'production' ? 'production' : 'homologation',
    hasIssuerCredentials,
  };
}

function productSnapshots(products) {
  return products.map((p) => ({
    ncm: p.ncm,
    origin: typeof p.origin === 'number' ? p.origin : p.origin != null ? Number(p.origin) : null,
    cstOrCsosn: p.cstOrCsosn,
  }));
}

async function saveEnterpriseFiscalSecrets(db, { enterpriseId, provider, apiToken, cscId, cscToken, uid }) {
  const now = nowIso();
  const payload = {
    provider: provider || 'focus',
    updatedAt: now,
    updatedByUid: uid,
  };
  if (apiToken) payload.apiToken = String(apiToken);
  if (cscId !== undefined) payload.cscId = String(cscId || '');
  if (cscToken) payload.cscToken = String(cscToken);

  const ref = secretsRef(db, enterpriseId);
  const existing = await ref.get();
  if (!existing.exists && !apiToken) {
    const err = new Error('apiToken is required on first save');
    err.code = 'invalid-argument';
    throw err;
  }

  await ref.set(payload, { merge: true });
  await enterpriseRef(db, enterpriseId).set(
    {
      hasFiscalSecrets: true,
      fiscalIssuerProvider: payload.provider,
      ...(cscId !== undefined ? { nfceCscId: String(cscId || '') } : {}),
      updatedAt: now,
    },
    { merge: true }
  );

  return { ok: true, hasFiscalSecrets: true };
}

async function enqueueSaleNfce(db, { enterpriseId, saleId }) {
  const ref = saleRef(db, enterpriseId, saleId);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Sale not found');
    err.code = 'not-found';
    throw err;
  }
  const sale = snap.data() || {};
  const current = sale.nfceStatus || 'none';
  const next = nextNfceStatus(current === 'authorized' ? 'authorized' : current === 'cancelled' ? 'cancelled' : current === 'error' ? 'error' : current === 'pending' ? 'pending' : 'none', 'enqueue');
  if (current === 'authorized' || current === 'cancelled') {
    return { saleId, nfceStatus: current, skipped: true };
  }
  const now = nowIso();
  await ref.set(
    {
      nfceStatus: next,
      nfceLastError: null,
      updatedAt: now,
    },
    { merge: true }
  );
  return { saleId, nfceStatus: next, skipped: false };
}

async function issueSaleNfceForEnterprise(db, { enterpriseId, saleId, issuerFactory }) {
  const entSnap = await enterpriseRef(db, enterpriseId).get();
  if (!entSnap.exists) {
    const err = new Error('Enterprise not found');
    err.code = 'not-found';
    throw err;
  }
  const enterprise = { id: enterpriseId, ...entSnap.data() };
  const secrets = await loadFiscalSecrets(db, enterpriseId);
  const hasCreds = Boolean(secrets?.apiToken) || process.env.NFCE_ISSUER === 'mock';

  const ref = saleRef(db, enterpriseId, saleId);
  const saleSnap = await ref.get();
  if (!saleSnap.exists) {
    const err = new Error('Sale not found');
    err.code = 'not-found';
    throw err;
  }
  const sale = { id: saleId, ...saleSnap.data() };
  const products = await loadProductsForSale(db, enterpriseId, sale);

  const gate = canEmitNfce(enterpriseSnapshot(enterprise, hasCreds), productSnapshots(products));
  if (!gate.ok) {
    await ref.set(
      {
        nfceStatus: 'error',
        nfceLastError: `${gate.code}: ${gate.message}`,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    const err = new Error(gate.message);
    err.code = gate.code;
    throw err;
  }

  const attempts = Number(sale.nfceAttempts || 0) + 1;
  await ref.set(
    {
      nfceStatus: 'pending',
      nfceAttempts: attempts,
      nfceLastError: null,
      updatedAt: nowIso(),
    },
    { merge: true }
  );

  const factory = issuerFactory || (() => resolveIssuer(enterprise, secrets));
  const issuer = factory();

  try {
    const result = await issuer.issue({
      enterpriseId,
      saleId,
      sale,
      products,
      enterprise,
      secrets: secrets || { apiToken: 'mock', cscId: '', cscToken: '' },
      environment: enterprise.nfceEnvironment === 'production' ? 'production' : 'homologation',
    });

    const now = nowIso();
    await ref.set(
      {
        nfceStatus: 'authorized',
        nfceNumber: result.nfceNumber,
        nfceKey: result.nfceKey,
        nfceProtocol: result.nfceProtocol,
        nfceIssuedAt: result.nfceIssuedAt || now,
        nfceDanfeUrl: result.nfceDanfeUrl || null,
        nfceQrCodeUrl: result.nfceQrCodeUrl || null,
        nfceLastError: null,
        updatedAt: now,
      },
      { merge: true }
    );

    return {
      nfceNumber: result.nfceNumber,
      nfceKey: result.nfceKey,
      nfceProtocol: result.nfceProtocol,
      nfceIssuedAt: result.nfceIssuedAt || now,
      nfceDanfeUrl: result.nfceDanfeUrl,
      nfceQrCodeUrl: result.nfceQrCodeUrl,
    };
  } catch (error) {
    const message = error?.message || String(error);
    await ref.set(
      {
        nfceStatus: 'error',
        nfceLastError: message.slice(0, 500),
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    throw error;
  }
}

async function cancelSaleNfceForEnterprise(db, { enterpriseId, saleId, justification, issuerFactory }) {
  const entSnap = await enterpriseRef(db, enterpriseId).get();
  const enterprise = { id: enterpriseId, ...(entSnap.data() || {}) };
  const secrets = await loadFiscalSecrets(db, enterpriseId);
  const ref = saleRef(db, enterpriseId, saleId);
  const saleSnap = await ref.get();
  if (!saleSnap.exists) {
    const err = new Error('Sale not found');
    err.code = 'not-found';
    throw err;
  }
  const sale = saleSnap.data() || {};
  if (sale.nfceStatus !== 'authorized') {
    const err = new Error('Only authorized NFC-e can be cancelled');
    err.code = 'failed-precondition';
    throw err;
  }

  const factory = issuerFactory || (() => resolveIssuer(enterprise, secrets));
  const issuer = factory();
  await issuer.cancel({
    saleId,
    secrets: secrets || { apiToken: 'mock' },
    environment: enterprise.nfceEnvironment === 'production' ? 'production' : 'homologation',
    justification,
  });

  await ref.set(
    {
      nfceStatus: 'cancelled',
      updatedAt: nowIso(),
    },
    { merge: true }
  );
  return { saleId, nfceStatus: 'cancelled' };
}

async function processPendingNfceBatch(db, { enterpriseId, limit = 10 }) {
  const col = db.collection(`enterprises/${enterpriseId}/sales`);
  const snap = await col.where('nfceStatus', 'in', ['pending', 'error']).limit(limit).get();
  const results = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (Number(data.nfceAttempts || 0) >= 5) {
      results.push({ saleId: docSnap.id, skipped: true, reason: 'max_attempts' });
      continue;
    }
    try {
      const out = await issueSaleNfceForEnterprise(db, {
        enterpriseId,
        saleId: docSnap.id,
      });
      results.push({ saleId: docSnap.id, ok: true, ...out });
    } catch (error) {
      results.push({ saleId: docSnap.id, ok: false, error: error.message });
    }
  }
  return results;
}

module.exports = {
  saveEnterpriseFiscalSecrets,
  enqueueSaleNfce,
  issueSaleNfceForEnterprise,
  cancelSaleNfceForEnterprise,
  processPendingNfceBatch,
  loadFiscalSecrets,
};

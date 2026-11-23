const { canEmitNfce, nextNfceStatus } = require('./nfce-domain');
const { assertA1NotExpired, redactFiscalLog } = require('./cert-audit');
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
  const provider = data.provider || 'focus';
  const hasFocus = Boolean(data.apiToken);
  const hasSefaz = Boolean(data.a1PfxBase64 && data.a1Password);
  if (provider === 'sefaz-direct') {
    if (!hasSefaz) return null;
  } else if (!hasFocus && !hasSefaz) {
    return null;
  }
  return {
    provider,
    apiToken: data.apiToken ? String(data.apiToken) : '',
    cscId: data.cscId ? String(data.cscId) : '',
    cscToken: data.cscToken ? String(data.cscToken) : '',
    a1PfxBase64: data.a1PfxBase64 ? String(data.a1PfxBase64) : undefined,
    a1Password: data.a1Password ? String(data.a1Password) : undefined,
    a1ExpiresAt: data.a1ExpiresAt ? String(data.a1ExpiresAt) : undefined,
    a1Thumbprint: data.a1Thumbprint ? String(data.a1Thumbprint) : undefined,
  };
}

function resolveIssuer(enterprise, secrets) {
  if (process.env.NFCE_ISSUER === 'mock') {
    return createMockFiscalIssuer();
  }
  const provider = enterprise.fiscalIssuerProvider || secrets?.provider || 'focus';
  return createFiscalIssuer(provider);
}

function hasIssuerCredentialsFor(enterprise, secrets) {
  if (process.env.NFCE_ISSUER === 'mock') return true;
  const provider = enterprise.fiscalIssuerProvider || secrets?.provider || 'focus';
  if (provider === 'sefaz-direct') {
    return Boolean(secrets?.a1PfxBase64 && secrets?.a1Password && secrets?.cscId && secrets?.cscToken);
  }
  return Boolean(secrets?.apiToken);
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

const MAX_PFX_BYTES = 2 * 1024 * 1024;

function estimateDecodedBytes(b64) {
  return Math.floor(String(b64 || '').replace(/\s/g, '').length * 0.75);
}

async function saveEnterpriseFiscalSecrets(db, { enterpriseId, provider, apiToken, cscId, cscToken, uid }) {
  const now = nowIso();
  const resolvedProvider = provider || 'focus';
  const payload = {
    provider: resolvedProvider,
    updatedAt: now,
    updatedByUid: uid,
  };
  if (apiToken) payload.apiToken = String(apiToken);
  if (cscId !== undefined) payload.cscId = String(cscId || '');
  if (cscToken) payload.cscToken = String(cscToken);

  const ref = secretsRef(db, enterpriseId);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() || {} : {};
  if (!existing.exists && resolvedProvider !== 'sefaz-direct' && !apiToken) {
    const err = new Error('apiToken is required on first save');
    err.code = 'invalid-argument';
    throw err;
  }

  await ref.set(payload, { merge: true });
  const hasFiscalSecrets = Boolean(
    apiToken || existingData.apiToken || existingData.a1PfxBase64 || payload.a1PfxBase64
  );
  await enterpriseRef(db, enterpriseId).set(
    {
      ...(hasFiscalSecrets ? { hasFiscalSecrets: true } : {}),
      fiscalIssuerProvider: payload.provider,
      ...(cscId !== undefined ? { nfceCscId: String(cscId || '') } : {}),
      updatedAt: now,
    },
    { merge: true }
  );

  return { ok: true, hasFiscalSecrets };
}

/**
 * Store per-tenant A1 PFX in secrets/fiscal. Never return password or pfx.
 */
async function uploadEnterpriseFiscalCert(
  db,
  { enterpriseId, pfxBase64, password, cscId, cscToken, uid, provider }
) {
  if (!pfxBase64 || !password) {
    const err = new Error('pfxBase64 and password are required');
    err.code = 'invalid-argument';
    throw err;
  }
  if (estimateDecodedBytes(pfxBase64) > MAX_PFX_BYTES) {
    const err = new Error('PFX exceeds 2MB limit');
    err.code = 'invalid-argument';
    throw err;
  }

  const { loadPfx } = require('./a1-signer');
  let loaded;
  try {
    loaded = loadPfx({ pfxBase64: String(pfxBase64), password: String(password) });
  } catch (error) {
    const err = new Error(error?.message || 'Invalid A1 certificate or password');
    err.code = error?.code || 'invalid-argument';
    throw err;
  }

  const now = nowIso();
  const resolvedProvider = provider || 'sefaz-direct';
  const payload = {
    provider: resolvedProvider,
    a1PfxBase64: String(pfxBase64).replace(/\s/g, ''),
    a1Password: String(password),
    a1Thumbprint: loaded.thumbprint,
    a1ExpiresAt: loaded.a1ExpiresAt || null,
    updatedAt: now,
    updatedByUid: uid,
  };
  if (cscId !== undefined) payload.cscId = String(cscId || '');
  if (cscToken) payload.cscToken = String(cscToken);

  await secretsRef(db, enterpriseId).set(payload, { merge: true });
  await enterpriseRef(db, enterpriseId).set(
    {
      hasFiscalSecrets: true,
      fiscalIssuerProvider: resolvedProvider,
      a1Thumbprint: loaded.thumbprint,
      a1ExpiresAt: loaded.a1ExpiresAt || null,
      ...(cscId !== undefined ? { nfceCscId: String(cscId || '') } : {}),
      updatedAt: now,
    },
    { merge: true }
  );

  return {
    ok: true,
    a1Thumbprint: loaded.thumbprint,
    a1ExpiresAt: loaded.a1ExpiresAt || null,
  };
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
  const hasCreds = hasIssuerCredentialsFor(enterprise, secrets);

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
  const provider = enterprise.fiscalIssuerProvider || secrets?.provider || 'focus';

  try {
    if (provider === 'sefaz-direct') {
      assertA1NotExpired(secrets || { a1ExpiresAt: enterprise.a1ExpiresAt });
    }

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
    const message = redactFiscalLog(error?.message || String(error));
    const codePrefix = error?.code === 'cert_expired' ? 'missing_fiscal_config: ' : '';
    await ref.set(
      {
        nfceStatus: 'error',
        nfceLastError: `${codePrefix}${String(message)}`.slice(0, 500),
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
  const entSnap = await enterpriseRef(db, enterpriseId).get();
  const enterprise = entSnap.exists ? entSnap.data() || {} : {};
  const { isCertExpired } = require('./cert-audit');
  if (
    enterprise.fiscalIssuerProvider === 'sefaz-direct' &&
    isCertExpired(enterprise.a1ExpiresAt)
  ) {
    return [{ skipped: true, reason: 'cert_expired', enterpriseId }];
  }

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
      results.push({
        saleId: docSnap.id,
        ok: false,
        error: redactFiscalLog(error.message),
        code: error.code,
      });
    }
  }
  return results;
}

module.exports = {
  saveEnterpriseFiscalSecrets,
  uploadEnterpriseFiscalCert,
  enqueueSaleNfce,
  issueSaleNfceForEnterprise,
  cancelSaleNfceForEnterprise,
  processPendingNfceBatch,
  loadFiscalSecrets,
  hasIssuerCredentialsFor,
};

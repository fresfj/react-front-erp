# NFC-e SEFAZ-Direct (SaaS Multi-Tenant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional `fiscalIssuerProvider: 'sefaz-direct'` so each tenant can emit NFC-e via A1 + SEFAZ UF WebServices, while **Focus remains the default** and fully working path.

**Architecture:** Extend `createFiscalIssuer` with a SEFAZ-direct adapter. Per-tenant A1 (base64 `.pfx` + password) and CSC live in `enterprises/{enterpriseId}/secrets/fiscal` (client-denied). Cloud Functions build XML modelo 65, sign with node-forge/xml-crypto (or equivalent), POST to UF endpoint from a versioned UF map. Account UI: opt-in provider + cert upload via callable (never download cert to browser). Pilot = resolve UF from `enterprise.state`; only UFs listed in the map are enabled.

**Tech Stack:** Cloud Functions v2 (Node), existing `functions/fiscal/*`, Firestore secrets, Secret Manager optional later, Vitest for pure XML helpers, React account fiscal form, i18n pt/en/es.

**Spec:** `docs/superpowers/specs/2026-11-23-nfce-sefaz-direct-vs-focus-decision.md` (scenario A)  
**Depends on:** NFC-e Focus slice already on `main` (`FiscalIssuer`, `nfce-service`, account fiscal, product fiscal fields).

## Global Constraints

- Auth remains Firebase (`CONFIG.auth.method = 'firebase'`).
- Focus stays default; never remove Focus adapter in this plan.
- Client **never** reads A1 bytes or password (`secrets/**` deny all client).
- Cert upload only via authenticated callable; admin/gestor/platformAdmin only.
- Field names in Firestore: English.
- UI default language `pt`; add `en`/`es` for new strings.
- ESLint zero-warnings + `tsc --noEmit` on every touched `.ts`/`.tsx` task.
- Out of scope: NF-e 55, NFS-e, contingency tpEmis 9, PlugNotas/NuvemFiscal adapters.
- Before coding WS URLs: confirm against the official SEFAZ portal for each UF in the map (homolog + prod). Wrong URL = plan bug.
- `yarn check:amplify --skip-build` before deploy-affecting push if deps/`amplify.yml` untouched; full check if adding native deps that affect frontend engines (prefer CF-only deps).

---

## File map

| File | Responsibility |
|------|----------------|
| `functions/fiscal/uf-endpoints.js` | Map `UF → { homologation, production }` NFC-e authorization URLs |
| `functions/fiscal/nfce-xml.js` | Build NFC-e XML string from sale/enterprise/products/CSC |
| `functions/fiscal/nfce-xml.test.js` | Node test (or Vitest if wired) for XML fragments / QR payload inputs |
| `functions/fiscal/a1-signer.js` | Load PFX, sign XML (XMLDSig) |
| `functions/fiscal/sefaz-client.js` | SOAP/HTTP call to SEFAZ + parse retorno |
| `functions/fiscal/fiscal-issuer.js` | Wire `createFiscalIssuer('sefaz-direct')` |
| `functions/fiscal/nfce-service.js` | Load cert fields from secrets; resolve issuer |
| `functions/index.js` | `uploadEnterpriseFiscalCert`, extend save secrets |
| `firestore.rules` | Confirm `secrets/**` still deny (no change if already deny) |
| `src/api/firestore/nfce.ts` | Client wrapper for cert upload callable |
| `src/sections/account/account-fiscal-form.tsx` | Enable `sefaz-direct` + cert file + password fields |
| `src/api/firestore/platform.ts` | Allow `fiscalIssuerProvider: 'sefaz-direct'` |
| `src/locales/langs/{pt,en,es}/common.json` | Cert / SEFAZ-direct strings |
| `docs/agents/antigravity-erp-handoff.md` | Ops notes (UF map, cert rotation) |

---

### Task 1: UF endpoint map + provider enum unlock

**Files:**
- Create: `functions/fiscal/uf-endpoints.js`
- Modify: `functions/fiscal/fiscal-issuer.js` (accept `sefaz-direct` without throwing `provider_not_implemented` once adapter exists — stub throws `sefaz_direct_not_ready` until Task 4)
- Modify: `src/api/firestore/platform.ts` / account form provider select (enable menu item in Task 6; types in this task)

**Interfaces:**
- Produces:

```js
/** @type {Record<string, { homologation: string, production: string, notes?: string }>} */
const NFCE_UF_ENDPOINTS = {
  // Implementer MUST paste verified URLs from official SEFAZ docs for each key.
  // Start with at least one UF used by first pilot tenant (from enterprise.state).
  // Example shape only — replace host/path with official values before merge:
  // PA: { homologation: 'https://...', production: 'https://...' },
};

function resolveNfceEndpoint(uf, environment) {
  const key = String(uf || '').trim().toUpperCase();
  const row = NFCE_UF_ENDPOINTS[key];
  if (!row) {
    const err = new Error(`UF not enabled for SEFAZ-direct: ${key}`);
    err.code = 'uf_not_supported';
    throw err;
  }
  const env = environment === 'production' ? 'production' : 'homologation';
  return { uf: key, url: row[env], environment: env };
}

module.exports = { NFCE_UF_ENDPOINTS, resolveNfceEndpoint };
```

- [ ] **Step 1:** Research official NFC-e authorization WebService URLs for the pilot UF(s). Document source URL + consult date as comment above each map entry.

- [ ] **Step 2:** Implement `uf-endpoints.js` with **at least one** real UF (prefer the state of the first SaaS pilot customer). Empty map is not allowed to merge.

- [ ] **Step 3:** Unit smoke:

```bash
node -e "const { resolveNfceEndpoint, NFCE_UF_ENDPOINTS } = require('./functions/fiscal/uf-endpoints'); const uf=Object.keys(NFCE_UF_ENDPOINTS)[0]; const r=resolveNfceEndpoint(uf,'homologation'); if(!r.url.startsWith('http')) process.exit(1); console.log('ok', r.uf, r.url); try { resolveNfceEndpoint('XX','homologation'); process.exit(2);} catch(e){ if(e.code!=='uf_not_supported') process.exit(3); console.log('guard_ok'); }"
```

Expected: `ok <UF> https...` and `guard_ok`

- [ ] **Step 4:** Commit

```bash
git add functions/fiscal/uf-endpoints.js
git commit -m "$(cat <<'EOF'
feat(fiscal): add NFC-e SEFAZ UF endpoint map for sefaz-direct

EOF
)"
```

---

### Task 2: Pure NFC-e XML builder (TDD)

**Files:**
- Create: `functions/fiscal/nfce-xml.js`
- Create: `functions/fiscal/nfce-xml.test.cjs` (run with `node --test`)

**Interfaces:**
- Produces:

```js
/**
 * @param {object} input
 * @param {object} input.enterprise - name, document (CNPJ), address fields, state, nfceSeries, city IBGE if available
 * @param {object} input.sale
 * @param {object[]} input.products - fiscal snapshots + names
 * @param {{ cscId: string, cscToken: string }} input.csc
 * @param {'homologation'|'production'} input.environment
 * @returns {{ xml: string, qrCodePayload: string, ide: object }}
 */
function buildNfceXml(input) {}

function buildInfNFeId(/* cUF, aamm, cnpj, mod, serie, nNF, tpEmis, cNF */) {}
```

Minimal XML must include: `ide` (mod=65), `emit`, `det[]` with NCM/origem/CSOSN|CST, `total`, `pag`, `infNFeSupl` QR placeholders as required by current NT for the pilot UF. Homologation must set `tpAmb=2`.

- [ ] **Step 1: Write failing test** (`node --test`)

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildNfceXml } = require('./nfce-xml');

describe('buildNfceXml', () => {
  it('sets modelo 65 and tpAmb 2 in homologation', () => {
    const { xml } = buildNfceXml({
      environment: 'homologation',
      enterprise: {
        name: 'EMPRESA TESTE',
        document: '00000000000000',
        state: 'PA',
        nfceSeries: '1',
        city: 'Belem',
        address: 'Rua A',
        addressNumber: '1',
        neighborhood: 'Centro',
        zipCode: '66000000',
      },
      sale: {
        id: 'sale1',
        total: 10,
        subtotal: 10,
        discount: 0,
        createdAt: '2026-11-23T12:00:00.000Z',
        items: [
          {
            productId: 'p1',
            productName: 'Acai',
            qty: 1,
            unitPrice: 10,
          },
        ],
        payments: [{ method: 'pix', amount: 10 }],
      },
      products: [
        {
          id: 'p1',
          ncm: '21069090',
          origin: 0,
          cstOrCsosn: '102',
          cfopSaleDefault: '5102',
          unit: 'UN',
        },
      ],
      csc: { cscId: '1', cscToken: 'TEST' },
    });
    assert.match(xml, /<mod>65<\/mod>/);
    assert.match(xml, /<tpAmb>2<\/tpAmb>/);
    assert.match(xml, /21069090/);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
node --test functions/fiscal/nfce-xml.test.cjs
```

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `buildNfceXml`** minimal valid structure for tests; expand fields as SEFAZ schema requires for the pilot UF (consult current XSD/NT).

- [ ] **Step 4: Run GREEN** — same command, exit 0

- [ ] **Step 5: Commit**

```bash
git add functions/fiscal/nfce-xml.js functions/fiscal/nfce-xml.test.cjs
git commit -m "$(cat <<'EOF'
feat(fiscal): add NFC-e XML builder for SEFAZ-direct

EOF
)"
```

---

### Task 3: A1 signer + SEFAZ client

**Files:**
- Create: `functions/fiscal/a1-signer.js`
- Create: `functions/fiscal/sefaz-client.js`
- Modify: `functions/package.json` — add signing deps used by CF only (e.g. `node-forge`, `xml-crypto` — pin versions; document choice in commit body)

**Interfaces:**

```js
// a1-signer.js
function loadPfx({ pfxBase64, password }) {
  // returns { privateKeyPem, certificatePem, thumbprint }
}
function signNfceXml({ xml, privateKeyPem, certificatePem }) {
  // returns signedXml string
}

// sefaz-client.js
async function autorizarNfce({ endpointUrl, signedXml, timeoutMs }) {
  // SOAP envelope per UF/NT; parse cStat / xMotivo / nProt / chNFe
  // returns { status: 'authorized'|'rejected', nfceKey, nfceProtocol, nfceNumber, raw }
}
```

- [ ] **Step 1:** Add CF dependencies with pinned versions; run `npm install` inside `functions/`.

- [ ] **Step 2:** Implement `loadPfx` + `signNfceXml`. Test with a **fixture**: do **not** commit a real A1. Use a generated self-signed PFX **only in local/dev** or skip integration test in CI with `if (!process.env.NFCE_TEST_PFX_B64) { console.log('skip'); process.exit(0); }`.

- [ ] **Step 3:** Implement `autorizarNfce` for the pilot UF SOAP action (verify action name/namespace from SEFAZ doc). Map rejection to `err.code = 'provider_reject'`.

- [ ] **Step 4:** Smoke without network:

```bash
node -e "require('./functions/fiscal/a1-signer'); require('./functions/fiscal/sefaz-client'); console.log('ok')"
```

- [ ] **Step 5: Commit**

```bash
git add functions/fiscal/a1-signer.js functions/fiscal/sefaz-client.js functions/package.json functions/package-lock.json
git commit -m "$(cat <<'EOF'
feat(fiscal): A1 XML signer and SEFAZ NFC-e client

EOF
)"
```

---

### Task 4: Wire `createFiscalIssuer('sefaz-direct')` + nfce-service secrets

**Files:**
- Modify: `functions/fiscal/fiscal-issuer.js`
- Modify: `functions/fiscal/nfce-service.js`

**Interfaces:**
- Consumes: `buildNfceXml`, `loadPfx`, `signNfceXml`, `autorizarNfce`, `resolveNfceEndpoint`
- Secrets shape extension (same doc `secrets/fiscal`):

```js
{
  provider: 'focus' | 'sefaz-direct',
  apiToken?: string,          // Focus only
  cscId: string,
  cscToken: string,
  a1PfxBase64?: string,       // sefaz-direct
  a1Password?: string,        // sefaz-direct — never log
  a1ExpiresAt?: string,       // ISO, for UI warning
  a1Thumbprint?: string,
  updatedAt: string,
  updatedByUid: string,
}
```

- [ ] **Step 1:** `createSefazDirectFiscalIssuer()`:

```js
async function issue(input) {
  const uf = input.enterprise.state;
  const { url } = resolveNfceEndpoint(uf, input.environment);
  const { xml } = buildNfceXml({ ...input, csc: { cscId: input.secrets.cscId, cscToken: input.secrets.cscToken } });
  const { privateKeyPem, certificatePem } = loadPfx({
    pfxBase64: input.secrets.a1PfxBase64,
    password: input.secrets.a1Password,
  });
  const signedXml = signNfceXml({ xml, privateKeyPem, certificatePem });
  const result = await autorizarNfce({ endpointUrl: url, signedXml });
  if (result.status !== 'authorized') {
    const err = new Error(result.xMotivo || 'SEFAZ rejected');
    err.code = 'provider_reject';
    err.sefaz = result;
    throw err;
  }
  return {
    status: 'authorized',
    nfceNumber: String(result.nfceNumber),
    nfceKey: String(result.nfceKey),
    nfceProtocol: String(result.nfceProtocol),
    nfceIssuedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 2:** `createFiscalIssuer('sefaz-direct')` returns that issuer; Focus/mock unchanged.

- [ ] **Step 3:** In `resolveIssuer` / `issueSaleNfceForEnterprise`, if provider is `sefaz-direct`, require `a1PfxBase64` + `a1Password` + CSC or set `missing_fiscal_config`.

- [ ] **Step 4:** Commit

```bash
git add functions/fiscal/fiscal-issuer.js functions/fiscal/nfce-service.js
git commit -m "$(cat <<'EOF'
feat(fiscal): wire sefaz-direct FiscalIssuer into NFC-e service

EOF
)"
```

---

### Task 5: Callable upload cert + audit fields (SaaS)

**Files:**
- Modify: `functions/index.js`
- Modify: `src/api/firestore/nfce.ts`
- Modify: `firestore.rules` (verify deny; add comment if needed)

**Callable `uploadEnterpriseFiscalCert`:**

```js
// request.data: { enterpriseId, pfxBase64, password, cscId?, cscToken? }
// Auth: assertEnterpriseAdminOrPlatformAdmin
// Validate: pfxBase64 length cap (e.g. 2MB decoded), loadPfx succeeds, extract notAfter → a1ExpiresAt
// Write secrets/fiscal merge; set enterprise.hasFiscalSecrets, fiscalIssuerProvider optional leave unchanged
// Return: { ok: true, a1Thumbprint, a1ExpiresAt } — never return password or pfx
```

Also extend `saveEnterpriseFiscalSecrets` to allow setting `provider: 'sefaz-direct'` without requiring Focus `apiToken`.

- [ ] **Step 1:** Implement callable + client wrapper:

```ts
export function uploadEnterpriseFiscalCert(input: {
  enterpriseId: string;
  pfxBase64: string;
  password: string;
  cscId?: string;
  cscToken?: string;
}) {
  return call<typeof input, { ok: boolean; a1Thumbprint: string; a1ExpiresAt?: string }>(
    'uploadEnterpriseFiscalCert',
    input
  );
}
```

- [ ] **Step 2:** Ensure `match /enterprises/{enterpriseId}/secrets/{docId} { allow read, write: if false; }` remains.

- [ ] **Step 3:** Commit

```bash
git add functions/index.js src/api/firestore/nfce.ts firestore.rules
git commit -m "$(cat <<'EOF'
feat(fiscal): SaaS callable to upload per-tenant A1 certificate

EOF
)"
```

---

### Task 6: Account fiscal UI — opt-in SEFAZ-direct + cert upload

**Files:**
- Modify: `src/sections/account/account-fiscal-form.tsx`
- Modify: `src/api/firestore/platform.ts` (provider union includes `sefaz-direct`)
- Modify: `src/locales/langs/pt/common.json`, `en/common.json`, `es/common.json`

**UI behavior:**
- Provider select: Focus (default) | SEFAZ direto (opt-in)
- When `sefaz-direct`: show file input (`.pfx`/`.p12`) + password; on save, `FileReader` → base64 → `uploadEnterpriseFiscalCert` (not `updateEnterpriseSettings` for bytes)
- Show `a1ExpiresAt` / thumbprint if enterprise has `hasFiscalSecrets` and provider is sefaz-direct (store public `a1ExpiresAt` + `a1Thumbprint` on enterprise doc from callable — **not** the PFX)
- ConfirmDialog / `window.confirm` when switching provider Focus ↔ sefaz-direct
- Soft Alert if `enterprise.state` missing or UF not in map (optional client check via static list exported later — for v1 show hint “UF do cadastro da empresa deve estar habilitada”)

i18n keys under `fiscal.*`:

```json
"sefazDirect": "SEFAZ direto",
"uploadCert": "Certificado A1 (.pfx)",
"certPassword": "Senha do certificado",
"certExpires": "Validade do A1",
"certUploaded": "Certificado armazenado",
"switchProviderConfirm": "Trocar provedor fiscal? Confirme CSC e credenciais."
```

- [ ] **Step 1:** Unlock MenuItem `sefaz-direct`; wire upload
- [ ] **Step 2:** ESLint + tsc on touched TSX
- [ ] **Step 3:** Commit

```bash
git add src/sections/account/account-fiscal-form.tsx src/api/firestore/platform.ts src/locales/langs/pt/common.json src/locales/langs/en/common.json src/locales/langs/es/common.json
git commit -m "$(cat <<'EOF'
feat(account): opt-in SEFAZ-direct provider and A1 upload UI

EOF
)"
```

---

### Task 7: Multi-tenant hardening

**Files:**
- Modify: `functions/fiscal/nfce-service.js` / `functions/index.js`
- Create: `functions/fiscal/cert-audit.js` (optional thin helper)

**Requirements:**
- Every cert write stores `updatedByUid`, `updatedAt`
- Optional enterprise public fields: `a1ExpiresAt`, `a1Thumbprint` (no secret material)
- Scheduled job or reuse `processPendingNfceBatch`: skip `sefaz-direct` tenants with expired `a1ExpiresAt` → set sale error `missing_fiscal_config` with message cert expired
- Log lines must **redact** password and pfx (`[REDACTED]`)

- [ ] **Step 1:** Implement expiry check before `issuer.issue` for sefaz-direct
- [ ] **Step 2:** Smoke with mock date via dependency injection if easy; else unit test pure `isCertExpired(iso, now)`
- [ ] **Step 3:** Commit

```bash
git add functions/fiscal functions/index.js
git commit -m "$(cat <<'EOF'
feat(fiscal): multi-tenant A1 expiry guard and audit metadata

EOF
)"
```

---

### Task 8: Homolog verification + handoff

**Files:**
- Modify: `docs/agents/antigravity-erp-handoff.md`

**Checklist (document results in handoff):**
1. Tenant A: Focus still emits in homolog
2. Tenant B: `sefaz-direct`, upload A1, CSC, `state` in UF map → sale → `authorized` or clear SEFAZ reject
3. Tenant B with wrong UF / missing cert → `error` typed, no crash
4. Client cannot read `secrets/fiscal` from browser SDK
5. Deploy CF + rules; set `NFCE_ISSUER` unset (not mock) in prod

**Commands:**

```bash
node --test functions/fiscal/nfce-xml.test.cjs
./node_modules/.bin/vitest run src/sections/fiscal/nfce-domain.test.ts
./node_modules/.bin/eslint --max-warnings=0 src/sections/account/account-fiscal-form.tsx src/api/firestore/nfce.ts src/api/firestore/platform.ts
./node_modules/.bin/tsc --noEmit
yarn check:amplify --skip-build
```

- [ ] **Step 1:** Run commands — all green
- [ ] **Step 2:** Update handoff with UF map keys enabled + ops (cert rotation)
- [ ] **Step 3:** Commit

```bash
git add docs/agents/antigravity-erp-handoff.md
git commit -m "$(cat <<'EOF'
docs(handoff): SEFAZ-direct SaaS NFC-e verification notes

EOF
)"
```

---

## Spec coverage (self-review)

| Decision / requirement | Task |
|------------------------|------|
| Focus default kept | T4–T6 (opt-in only) |
| `sefaz-direct` parallel provider | T4 |
| A1 per enterprise, client deny | T5, rules |
| Pilot 1 UF + multi-UF map | T1 |
| SaaS isolation + audit + expiry | T7 |
| Self-serve cert upload UI | T5–T6 |
| No NF-e/NFS-e/contingency | Out of plan |
| Estimates scenario A | Tasks T1–T8 ≈ 6–10 weeks calendar with homolog |

## Placeholder scan

UF URLs must be filled with **verified** official values in Task 1 (research step explicit). No “implement later” tasks. Signing library choice pinned in Task 3 commit.

## Type consistency

- Provider string: `'focus' | 'sefaz-direct' | 'mock' | 'plugnotas' | 'nuvemfiscal'`
- Callable: `uploadEnterpriseFiscalCert`
- Secrets: `a1PfxBase64`, `a1Password`, `a1ExpiresAt`, `a1Thumbprint`
- Errors: reuse `missing_fiscal_config` | `provider_reject` | add `uf_not_supported`

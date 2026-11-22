# NFC-e Emission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake `issueSaleNfce` stub with real per-tenant NFC-e emission (homolog → production) across POS, online, and table sales, behind a `FiscalIssuer` adapter.

**Architecture:** Client enqueues / calls authenticated Cloud Functions. Functions load enterprise fiscal config + secrets (`enterprises/{id}/secrets/fiscal`, client-denied), validate product/enterprise emit gates, call `FiscalIssuer` (pilot: Focus NFe), and persist `nfceStatus` on `sales`. Offline sales stay `pending` until a retry worker/callable processes them. Certificate A1 stays in the provider portal — ERP stores API token + CSC only.

**Tech Stack:** React 18, MUI 5, Vite, Firestore, Cloud Functions v2 (`functions/fiscal/*` + `functions/index.js`), Focus NFe REST (sandbox/prod), Vitest, i18n pt/en/es.

**Spec:** `docs/superpowers/specs/2026-11-22-nfce-tax-reform-umbrella-design.md` (D1–D10 locked). Tax-reform **skill** is out of this plan (already delivered).

## Global Constraints

- Auth remains Firebase (`CONFIG.auth.method = 'firebase'`).
- Never invent client `role: 'admin'` when claims are missing.
- Never expose Focus API token / CSC token to the browser (no reads of `secrets/fiscal`).
- Emission only via Cloud Functions Admin SDK.
- Field names in Firestore: English.
- UI default language `pt`; add `en` / `es` keys for new strings.
- ERP UI: CardHeader collapsible forms, toast + `getFirebaseErrorMessage`.
- ESLint zero-warnings + `tsc --noEmit` on every touched `.ts`/`.tsx` task.
- Before deploy-affecting push: `yarn check:amplify` (or `--skip-build` if deps/`amplify.yml` untouched).
- Do not implement NF-e entrada, NFS-e, A1 upload, or SEFAZ contingency (tpEmis 9).
- Do not change tax-reform skill files unless a bug blocks NFC-e.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/sections/fiscal/nfce-domain.ts` | Pure emit-gate + status helpers |
| `src/sections/fiscal/nfce-domain.test.ts` | Vitest for gates / state machine |
| `src/api/firestore/nfce.ts` | Client wrappers for fiscal callables (no secrets) |
| `src/api/firestore/sales.ts` | Extend `Sale` nfce fields; replace stub with callable enqueue |
| `src/api/firestore/products.ts` | Product fiscal fields map/CRUD |
| `src/api/firestore/platform.ts` | Enterprise fiscal public settings (no secrets) |
| `src/sections/account/account-fiscal-form.tsx` | Regime, enable, series, env, provider, secret save via CF |
| `src/sections/inventory/product/product-form.tsx` | Collapsible Fiscal card |
| `src/sections/pos/view/sale-details-view.tsx` | Issue / retry / cancel via CF |
| `src/sections/pos/view/pos-checkout-view.tsx` | Enqueue after `createSale` when enabled |
| `src/api/firestore/tables.ts` | Enqueue after `closeTableSession` sale |
| Online accept path (CF `acceptOnlineOrder` and/or client) | Enqueue when sale is created |
| `functions/fiscal/nfce-domain.js` | CommonJS copy of emit gates for CF |
| `functions/fiscal/focus-client.js` | Focus NFe HTTP helper |
| `functions/fiscal/fiscal-issuer.js` | `FiscalIssuer` interface + Focus adapter + mock |
| `functions/fiscal/nfce-service.js` | issue / cancel / retry orchestration |
| `functions/index.js` | Export callables + scheduled retry |
| `firestore.rules` | Deny client on `secrets/**`; member rules for `nfceJobs` if used |
| `src/locales/langs/{pt,en,es}/common.json` | i18n |
| `.superpowers/sdd/progress.md` | Ledger (local) |
| `docs/agents/antigravity-erp-handoff.md` | Slice note |

---

### Task 1: Pure NFC-e domain (TDD) + pilot lock

**Files:**
- Create: `src/sections/fiscal/nfce-domain.ts`
- Create: `src/sections/fiscal/nfce-domain.test.ts`
- Create: `functions/fiscal/nfce-domain.js` (mirror of pure helpers for CF)

**Interfaces:**
- Produces:

```ts
export type TaxRegime = 'simples' | 'presumido' | 'real' | 'mei';
export type NfceEnvironment = 'homologation' | 'production';
export type NfceStatus = 'none' | 'pending' | 'authorized' | 'cancelled' | 'error';
export type NfceErrorCode =
  | 'missing_fiscal_config'
  | 'missing_fiscal_product_data'
  | 'provider_reject'
  | 'network'
  | 'sefaz_unavailable';

export type FiscalProductSnapshot = {
  ncm?: string | null;
  origin?: number | null;
  cstOrCsosn?: string | null;
};

export type FiscalEnterpriseSnapshot = {
  nfceEnabled: boolean;
  taxRegime?: TaxRegime | null;
  nfceSeries?: string | null;
  nfceEnvironment?: NfceEnvironment | null;
  hasIssuerCredentials: boolean; // true if secrets exist server-side
};

export function canEmitNfce(
  enterprise: FiscalEnterpriseSnapshot,
  products: FiscalProductSnapshot[]
): { ok: true } | { ok: false; code: NfceErrorCode; message: string };

export function nextNfceStatus(
  current: NfceStatus,
  event: 'enqueue' | 'authorize' | 'fail' | 'cancel' | 'retry'
): NfceStatus;
```

- Pilot lock (document in commit message + progress ledger): **Focus NFe** as `fiscalIssuerProvider: 'focus'`. Adapter must still accept `'plugnotas' | 'nuvemfiscal'` enum values throwing `provider_not_implemented` until a later plan.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { canEmitNfce, nextNfceStatus } from './nfce-domain';

describe('canEmitNfce', () => {
  const baseEnt = {
    nfceEnabled: true,
    taxRegime: 'simples' as const,
    nfceSeries: '1',
    nfceEnvironment: 'homologation' as const,
    hasIssuerCredentials: true,
  };

  it('fails when nfce disabled', () => {
    const r = canEmitNfce({ ...baseEnt, nfceEnabled: false }, [
      { ncm: '21069090', origin: 0, cstOrCsosn: '102' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('missing_fiscal_config');
  });

  it('fails when credentials missing', () => {
    const r = canEmitNfce({ ...baseEnt, hasIssuerCredentials: false }, [
      { ncm: '21069090', origin: 0, cstOrCsosn: '102' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('missing_fiscal_config');
  });

  it('fails when product lacks ncm/origin/cstOrCsosn', () => {
    const r = canEmitNfce(baseEnt, [{ ncm: '', origin: 0, cstOrCsosn: '102' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('missing_fiscal_product_data');
  });

  it('passes when enterprise + all products valid', () => {
    expect(
      canEmitNfce(baseEnt, [{ ncm: '21069090', origin: 0, cstOrCsosn: '102' }]).ok
    ).toBe(true);
  });
});

describe('nextNfceStatus', () => {
  it('none + enqueue → pending', () => {
    expect(nextNfceStatus('none', 'enqueue')).toBe('pending');
  });
  it('pending + authorize → authorized', () => {
    expect(nextNfceStatus('pending', 'authorize')).toBe('authorized');
  });
  it('pending + fail → error', () => {
    expect(nextNfceStatus('pending', 'fail')).toBe('error');
  });
  it('error + retry → pending', () => {
    expect(nextNfceStatus('error', 'retry')).toBe('pending');
  });
  it('authorized + cancel → cancelled', () => {
    expect(nextNfceStatus('authorized', 'cancel')).toBe('cancelled');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
./node_modules/.bin/vitest run src/sections/fiscal/nfce-domain.test.ts
```

Expected: FAIL (module / exports missing)

- [ ] **Step 3: Implement `nfce-domain.ts` + CommonJS mirror**

Implement `canEmitNfce` / `nextNfceStatus` exactly to satisfy tests. Mirror the same pure functions in `functions/fiscal/nfce-domain.js` (`module.exports = { canEmitNfce, nextNfceStatus }`) without Firebase imports.

- [ ] **Step 4: Run tests — expect PASS**

```bash
./node_modules/.bin/vitest run src/sections/fiscal/nfce-domain.test.ts
```

- [ ] **Step 5: ESLint + commit**

```bash
./node_modules/.bin/eslint --fix src/sections/fiscal/nfce-domain.ts src/sections/fiscal/nfce-domain.test.ts
./node_modules/.bin/eslint --max-warnings=0 src/sections/fiscal/nfce-domain.ts src/sections/fiscal/nfce-domain.test.ts
./node_modules/.bin/tsc --noEmit
git add src/sections/fiscal/nfce-domain.ts src/sections/fiscal/nfce-domain.test.ts functions/fiscal/nfce-domain.js
git commit -m "$(cat <<'EOF'
feat(fiscal): add NFC-e emit-gate domain helpers (Focus pilot locked)

EOF
)"
```

---

### Task 2: FiscalIssuer adapter + Focus client (mock-first)

**Files:**
- Create: `functions/fiscal/focus-client.js`
- Create: `functions/fiscal/fiscal-issuer.js`
- Create: `functions/fiscal/fiscal-issuer.test.js` (or Vitest under `functions/` if project already runs CF tests — prefer Node assert script runnable via `node --test` if Vitest root excludes `functions/`)

**Interfaces:**
- Produces:

```js
/**
 * @typedef {object} IssueNfceInput
 * @property {string} enterpriseId
 * @property {string} saleId
 * @property {object} sale - sale payload for XML mapping
 * @property {object[]} products - fiscal snapshots keyed by productId
 * @property {object} enterprise - public fiscal settings + emitente data
 * @property {object} secrets - { apiToken, cscId, cscToken }
 * @property {'homologation'|'production'} environment
 */

/**
 * @typedef {object} IssueNfceResult
 * @property {'authorized'} status
 * @property {string} nfceNumber
 * @property {string} nfceKey
 * @property {string} nfceProtocol
 * @property {string} [nfceDanfeUrl]
 * @property {string} [nfceQrCodeUrl]
 * @property {string} nfceIssuedAt
 */

function createFiscalIssuer(provider) // 'focus' | 'mock' | ...
function createMockFiscalIssuer(overrides?)
```

- [ ] **Step 1: Implement `createMockFiscalIssuer`** that returns deterministic key/protocol (for CF unit tests and local homolog without Focus account). Must **not** write Firestore.

- [ ] **Step 2: Implement `focus-client.js`**

```js
function getFocusBaseUrl(env) {
  // Confirm against Focus docs in this step; placeholders:
  // homologation vs production host — update if docs differ
  return env === 'production'
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br';
}

async function focusRequest({ token, env, method, path, body }) {
  const auth = Buffer.from(`${token}:`).toString('base64');
  const res = await fetch(`${getFocusBaseUrl(env)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.mensagem || data?.message || res.statusText);
    err.status = res.status;
    err.focus = data;
    throw err;
  }
  return data;
}

module.exports = { getFocusBaseUrl, focusRequest };
```

**Before coding production paths:** open Focus NFC-e docs and align `path` + payload fields (ref, natureza, itens NCM/origem/CSOSN, CSC). If sandbox URL differs, fix `getFocusBaseUrl` in the same commit. Do not invent undocumented fields.

- [ ] **Step 3: `createFiscalIssuer('focus')` maps sale → Focus payload, calls client, normalizes `IssueNfceResult`. `createFiscalIssuer('plugnotas'|'nuvemfiscal')` throws clear `provider_not_implemented`.**

- [ ] **Step 4: Smoke test mock**

```bash
node -e "const { createMockFiscalIssuer } = require('./functions/fiscal/fiscal-issuer'); createMockFiscalIssuer().issue({ saleId: 's1' }).then(r => { if (r.status !== 'authorized' || !r.nfceKey) process.exit(1); console.log('ok', r.nfceKey); })"
```

Expected: prints `ok` + key

- [ ] **Step 5: Commit**

```bash
git add functions/fiscal/
git commit -m "$(cat <<'EOF'
feat(fiscal): add FiscalIssuer adapter with Focus client and mock

EOF
)"
```

---

### Task 3: Cloud Functions — secrets + issue / cancel / retry

**Files:**
- Create: `functions/fiscal/nfce-service.js`
- Modify: `functions/index.js` (export callables; require fiscal modules)
- Create: `src/api/firestore/nfce.ts` (client callable wrappers)

**Secrets doc:** `enterprises/{enterpriseId}/secrets/fiscal`

```js
{
  provider: 'focus',
  apiToken: string,
  cscId: string,
  cscToken: string,
  updatedAt: string,
  updatedByUid: string,
}
```

**Enterprise public fields** (already partially exist — extend):  
`nfceEnabled`, `taxRegime`, `nfceSeries`, `nfceEnvironment`, `fiscalIssuerProvider`, `nfceCscId` (id only; token only in secrets).

**Callables:**

| Name | Who | Behavior |
|------|-----|----------|
| `saveEnterpriseFiscalSecrets` | admin \| gestor \| platformAdmin | Upsert secrets doc; set `hasFiscalSecrets: true` flag on enterprise (boolean only) |
| `issueSaleNfce` | sameEnterprise member | Validate gate → call issuer → update sale |
| `cancelSaleNfce` | sameEnterprise member | Cancel at provider if authorized → `cancelled` |
| `retryPendingNfce` | sameEnterprise member | Process one saleId or next pending |
| `processPendingNfceBatch` | scheduled / admin | Query pending/error with attempts < 5 |

- [ ] **Step 1: Implement `nfce-service.js`**

```js
async function issueSaleNfceForEnterprise({ db, enterpriseId, saleId, issuerFactory }) {
  // 1. load enterprise, secrets, sale, products for line items
  // 2. canEmitNfce(...) — on fail set sale.nfceStatus=error + nfceLastError
  // 3. set pending + attempts++
  // 4. issuer.issue(...)
  // 5. write authorized fields + clear nfceLastError
  // on throw: status error, store message, rethrow HttpsError
}
```

Use `issuerFactory` so tests inject `createMockFiscalIssuer`. Default production wiring: if `process.env.NFCE_ISSUER === 'mock'` use mock; else Focus when `fiscalIssuerProvider === 'focus'`.

- [ ] **Step 2: Wire `functions/index.js`**

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
// require fiscal modules; mirror claim checks from inviteMember / validateSaleDiscount
exports.saveEnterpriseFiscalSecrets = onCall(async (request) => { /* ... */ });
exports.issueSaleNfce = onCall(async (request) => { /* ... */ });
exports.cancelSaleNfce = onCall(async (request) => { /* ... */ });
exports.retryPendingNfce = onCall(async (request) => { /* ... */ });
exports.processPendingNfceBatch = onSchedule('every 15 minutes', async () => { /* ... */ });
```

Auth pattern: require `request.auth`; resolve `enterpriseId` from claims (or platformAdmin + explicit arg); reject cross-tenant.

- [ ] **Step 3: Client wrapper `src/api/firestore/nfce.ts`**

```ts
import { call } from './call'; // use the same callable helper other APIs use (billing.ts pattern)

export function saveEnterpriseFiscalSecrets(input: {
  enterpriseId: string;
  apiToken: string;
  cscId: string;
  cscToken: string;
  provider?: 'focus';
}) {
  return call('saveEnterpriseFiscalSecrets', input);
}

export function issueSaleNfceCf(input: { enterpriseId: string; saleId: string }) {
  return call('issueSaleNfce', input);
}

export function cancelSaleNfceCf(input: { enterpriseId: string; saleId: string }) {
  return call('cancelSaleNfce', input);
}

export function retryPendingNfceCf(input: { enterpriseId: string; saleId?: string }) {
  return call('retryPendingNfce', input);
}
```

Match the project's existing `httpsCallable` helper import path exactly (see `src/api/firestore/billing.ts`).

- [ ] **Step 4: Replace stub in `sales.ts`**

Change `issueSaleNfce` to:

```ts
export async function issueSaleNfce(enterpriseId: string, sale: Sale) {
  return issueSaleNfceCf({ enterpriseId, saleId: sale.id });
}
```

Extend `Sale` type:

```ts
nfceStatus?: 'none' | 'pending' | 'authorized' | 'cancelled' | 'error';
nfceDanfeUrl?: string;
nfceQrCodeUrl?: string;
nfceLastError?: string;
nfceAttempts?: number;
customerDocument?: string;
```

Update `mapSale` accordingly. After `createSale`, if caller passes `{ enqueueNfce: true }` **or** leave enqueue to UI/CF — prefer explicit `enqueueSaleNfce(enterpriseId, saleId)` that sets `pending` then calls `issueSaleNfceCf` (fire-and-forget with catch → leave pending for scheduler).

- [ ] **Step 5: Commit**

```bash
git add functions/fiscal functions/index.js src/api/firestore/nfce.ts src/api/firestore/sales.ts
git commit -m "$(cat <<'EOF'
feat(fiscal): Cloud Functions for NFC-e issue, cancel, retry, and secrets

EOF
)"
```

---

### Task 4: Firestore rules for fiscal secrets + jobs

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Deny all client access to secrets**

```
match /enterprises/{enterpriseId}/secrets/{docId} {
  allow read, write: if false;
}
```

- [ ] **Step 2: Optional `nfceJobs`** — if implemented as collection:

```
match /enterprises/{enterpriseId}/nfceJobs/{jobId} {
  allow read: if isMember(enterpriseId) || isPlatformAdmin();
  allow write: if false; // Admin SDK only
}
```

Prefer writing status only on `sales` in v1; add `nfceJobs` only if scheduler needs a separate queue. Spec allows either — **v1 default: sales query only**, skip `nfceJobs` unless batch query needs it.

- [ ] **Step 3: Ensure enterprise fields `hasFiscalSecrets`, `nfceEnabled`, `taxRegime` remain writable only by roles already allowed to update enterprise settings (existing `enterprises/{id}` rules). Do not put tokens on the enterprise doc.**

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "$(cat <<'EOF'
feat(rules): deny client access to enterprise fiscal secrets

EOF
)"
```

---

### Task 5: Account fiscal UI + platform types

**Files:**
- Modify: `src/api/firestore/platform.ts`
- Modify: `src/sections/account/account-fiscal-form.tsx`
- Modify: `src/locales/langs/pt/common.json` (and en/es in Task 8 if split — add pt keys here minimum)

**Enterprise extensions:**

```ts
taxRegime?: TaxRegime;
nfceEnabled?: boolean;
hasFiscalSecrets?: boolean;
fiscalIssuerProvider?: 'focus' | 'plugnotas' | 'nuvemfiscal' | null;
nfceCscId?: string; // public id only
```

- [ ] **Step 1: Extend Zod schema in `account-fiscal-form.tsx`**

```ts
taxRegime: zod.enum(['simples', 'presumido', 'real', 'mei']),
nfceEnabled: zod.boolean(),
fiscalIssuerProvider: zod.enum(['focus', 'plugnotas', 'nuvemfiscal']),
nfceCscId: zod.string().optional().or(zod.literal('')),
// secret fields are write-only UI state, not loaded from getEnterprise:
apiToken: zod.string().optional().or(zod.literal('')),
cscToken: zod.string().optional().or(zod.literal('')),
```

- [ ] **Step 2: Persist public fields via `updateEnterpriseSettings`; if `apiToken` or `cscToken` non-empty, call `saveEnterpriseFiscalSecrets`.**

- [ ] **Step 3: UI blocks**
  - ConfirmDialog when switching `nfceEnvironment` to `production`
  - Show badge if `!hasFiscalSecrets`
  - Disable `nfceEnabled` save if missing series / regime

- [ ] **Step 4: ESLint + tsc + commit**

```bash
./node_modules/.bin/eslint --fix src/api/firestore/platform.ts src/sections/account/account-fiscal-form.tsx
./node_modules/.bin/eslint --max-warnings=0 src/api/firestore/platform.ts src/sections/account/account-fiscal-form.tsx
./node_modules/.bin/tsc --noEmit
git add src/api/firestore/platform.ts src/sections/account/account-fiscal-form.tsx src/locales/langs/pt/common.json
git commit -m "$(cat <<'EOF'
feat(account): per-tenant NFC-e fiscal settings and secret save

EOF
)"
```

---

### Task 6: Product fiscal fields

**Files:**
- Modify: `src/api/firestore/products.ts`
- Modify: `src/sections/inventory/product/product-form.tsx`
- Modify: `src/sections/inventory/product/product-schema` (schema is inline in `product-form.tsx`)

**Product fields:**

```ts
ncm?: string;
origin?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
cfopSaleDefault?: string;
cstOrCsosn?: string;
commercialUnit?: string; // default from existing `unit` if unset
cest?: string;
taxBenefitCode?: string;
cbsRate?: number;
ibsRate?: number;
cClassTrib?: string;
taxClassificationNotes?: string;
```

- [ ] **Step 1: Extend `Product` type + `mapProduct` + create/update payloads with `omitUndefined`.**

- [ ] **Step 2: Add collapsible CardHeader “Fiscal” in `product-form.tsx`** with `Field.Text` / `Field.Select` for origin 0–8 and optional reforma fields. Keep `taxPercent` as legacy optional (do not remove).

- [ ] **Step 3: Soft warning (Alert) when enterprise `nfceEnabled` and required fiscal fields empty — do not hard-block product save in v1 (emit gate blocks NFC-e only).**

- [ ] **Step 4: ESLint + tsc + commit**

```bash
./node_modules/.bin/eslint --fix src/api/firestore/products.ts src/sections/inventory/product/product-form.tsx
./node_modules/.bin/eslint --max-warnings=0 src/api/firestore/products.ts src/sections/inventory/product/product-form.tsx
./node_modules/.bin/tsc --noEmit
git add src/api/firestore/products.ts src/sections/inventory/product/product-form.tsx
git commit -m "$(cat <<'EOF'
feat(products): add NFC-e and reforma fiscal classification fields

EOF
)"
```

---

### Task 7: Wire enqueue on POS / online / table + sales UI

**Files:**
- Modify: `src/sections/pos/view/pos-checkout-view.tsx`
- Modify: `src/sections/pos/view/sale-details-view.tsx` (and list row actions if present)
- Modify: `src/api/firestore/tables.ts` (`closeTableSession`)
- Modify: `functions/online-orders.js` (`acceptOnlineOrder` — after sale write) **or** client path that creates the sale — prefer CF so public client never calls fiscal

**Enqueue helper (client or CF):**

```ts
async function enqueueNfceAfterSale(enterpriseId: string, saleId: string, nfceEnabled: boolean) {
  if (!nfceEnabled) return;
  // set pending via CF issue (issueSaleNfceCf); on network fail leave pending for scheduler
  try {
    await issueSaleNfceCf({ enterpriseId, saleId });
  } catch {
    // sale should already be pending/error from CF partial write; if CF unreachable, client sets pending:
    // updateDoc sale { nfceStatus: 'pending' } — only if rules allow member update of nfceStatus
  }
}
```

**Rules note:** If members cannot patch `nfceStatus`, then offline enqueue must go through a callable `enqueueSaleNfce` that only sets `pending`. Add that callable in this task if needed:

```js
exports.enqueueSaleNfce = onCall(async (request) => {
  // set nfceStatus pending if none/error; do not call provider (scheduler/issue will)
});
```

- [ ] **Step 1: POS** — after successful `createSale`, call enqueue when enterprise `nfceEnabled`.

- [ ] **Step 2: Table** — after sale created in `closeTableSession`, enqueue (callable from client after close, or Admin in a follow-up CF). Prefer callable from the same client that closes the table to avoid bloating `tables.ts` with fiscal secrets.

- [ ] **Step 3: Online** — in `acceptOnlineOrder` after sale document created, call `issueSaleNfceForEnterprise` with mock/Focus (server-side). Do not block accept on SEFAZ failure — catch, set `error`/`pending`.

- [ ] **Step 4: Sale details** — replace success copy; show `nfceLastError`; buttons Emitir / Reemitir / Cancelar (ConfirmDialog); link DANFE when `nfceDanfeUrl` present.

- [ ] **Step 5: ESLint + tsc + commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/sections/pos src/api/firestore/tables.ts functions/online-orders.js functions/index.js
git commit -m "$(cat <<'EOF'
feat(pos): enqueue NFC-e on POS, online, and table sale finalize

EOF
)"
```

---

### Task 8: i18n pt / en / es

**Files:**
- Modify: `src/locales/langs/pt/common.json`
- Modify: `src/locales/langs/en/common.json`
- Modify: `src/locales/langs/es/common.json`

**Keys (minimum):**

```json
{
  "fiscal": {
    "title": "Fiscal / NFC-e",
    "nfceEnabled": "Emitir NFC-e automaticamente",
    "taxRegime": "Regime tributário",
    "provider": "Provedor fiscal",
    "apiToken": "Token da API",
    "cscId": "CSC ID",
    "cscToken": "CSC Token",
    "homologToProdConfirm": "Trocar para produção? Notas passam a ter validade fiscal.",
    "missingSecrets": "Configure o token do provedor e o CSC",
    "productCard": "Fiscal",
    "ncm": "NCM",
    "origin": "Origem da mercadoria",
    "cstOrCsosn": "CST / CSOSN",
    "issueSuccess": "NFC-e autorizada",
    "issueError": "Falha na emissão da NFC-e",
    "pending": "NFC-e pendente",
    "retry": "Reemitir NFC-e",
    "cancel": "Cancelar NFC-e"
  }
}
```

Translate `en` / `es` properly (not machine-garbage). Replace hard-coded Portuguese strings added in Task 5–7 with `t('fiscal.*')`.

- [ ] **Step 1: Add keys to all three locale files**
- [ ] **Step 2: Wire `t()` in fiscal form, product form, sale details**
- [ ] **Step 3: Commit**

```bash
git add src/locales/langs/pt/common.json src/locales/langs/en/common.json src/locales/langs/es/common.json src/sections/account/account-fiscal-form.tsx src/sections/inventory/product/product-form.tsx src/sections/pos/view/sale-details-view.tsx
git commit -m "$(cat <<'EOF'
feat(i18n): add NFC-e fiscal strings for pt, en, es

EOF
)"
```

---

### Task 9: Verification + handoff

**Files:**
- Modify: `docs/agents/antigravity-erp-handoff.md`
- Modify: `.superpowers/sdd/progress.md` (gitignored locally OK)

- [ ] **Step 1: Run**

```bash
./node_modules/.bin/vitest run src/sections/fiscal/nfce-domain.test.ts src/sections/overview/erp/__tests__/erp-analytics.test.ts
./node_modules/.bin/eslint --max-warnings=0 src/sections/fiscal src/api/firestore/nfce.ts src/api/firestore/sales.ts src/api/firestore/products.ts src/api/firestore/platform.ts src/sections/account/account-fiscal-form.tsx src/sections/inventory/product/product-form.tsx
./node_modules/.bin/tsc --noEmit
yarn check:amplify --skip-build
```

Expected: all green.

- [ ] **Step 2: Manual homolog checklist (document in handoff)**
  1. Create Focus sandbox empresa + token + CSC
  2. Fill `/dashboard/account/fiscal` (homologation)
  3. Fill product NCM/origem/CSOSN
  4. POS sale → `authorized` or clear `error`
  5. Airplane mode sale → `pending` → retry after online
  6. Flip to production only after SEFAZ credentialing (ops, not code)

- [ ] **Step 3: Update handoff with “NFC-e slice status” + remaining ops (deploy CF, rules, Focus account)**

- [ ] **Step 4: Final commit**

```bash
git add docs/agents/antigravity-erp-handoff.md
git commit -m "$(cat <<'EOF'
docs(handoff): NFC-e emission slice verification notes

EOF
)"
```

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| FiscalIssuer + Focus pilot | T1–T2 |
| Secrets at provider; ERP API/CSC only | T3–T5 |
| Hybrid auto + manual + queue | T3, T7 |
| Product fiscal fields + reforma optional | T6 |
| `taxRegime` per enterprise | T5 |
| Offline → pending | T3 scheduler + T7 enqueue |
| POS / online / table triggers | T7 |
| RBAC admin/gestor config; CF-only secrets | T3–T5, T4 |
| Replace fake `issueSaleNfce` | T3 |
| i18n pt/en/es | T8 |
| No NF-e/NFS-e/A1/contingency | Out of plan |
| Tax-reform skill | Already shipped — not in this plan |

## Placeholder scan

No TBD steps. Focus HTTP paths must be confirmed against live Focus docs in Task 2 Step 2 (explicit research step, not a blank “implement later”).

## Type consistency

- `NfceStatus` / `NfceErrorCode` / `TaxRegime` defined in Task 1; reused in sales map, CF service, UI.
- Callables: `issueSaleNfce`, `cancelSaleNfce`, `retryPendingNfce`, `saveEnterpriseFiscalSecrets`.
- Client: `issueSaleNfceCf` wraps CF; `sales.issueSaleNfce` delegates to it.

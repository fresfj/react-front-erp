# SaaS Billing Free/Pro/Ultra + Asaas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Billing-A: Free seed on enterprise create, platform plan CRUD + Asaas settings, tenant admin upgrade/cancel via Asaas, webhook sync, grace downgrade, Account Assinatura UI.

**Architecture:** Firestore is the app source of truth for `plans`, `enterprises.subscription`, and `subscriptionInvoices`. Cloud Functions own all Asaas calls and writes. Secrets live in Admin-only `platformSecrets/asaas` (rules deny all client access); public flags on `platformSettings/billing`. Pure domain helpers are unit-tested before CF wiring.

**Tech Stack:** React 18, MUI 5, Vite, Firestore, Cloud Functions v2 (`functions/index.js` + new modules), Asaas REST v3 (`fetch`), Vitest, i18n pt/en/es.

**Spec:** `docs/superpowers/specs/2026-11-17-saas-billing-asaas-design.md`

## Global Constraints

- Auth remains Firebase (`CONFIG.auth.method = 'firebase'`).
- Never invent client `role: 'admin'` when claims are missing.
- Never expose Asaas API key or webhook token to the client.
- Tenant billing actions: claim `role === 'admin'` only (not gestor).
- `platformAdmin` alone configures Asaas + plans.
- No entitlement hard-blocks (product/user caps) in this plan.
- No public storefront/checkout in this plan.
- Field names in English; UI default language `pt`.
- Follow ERP UI: DataGrid lists, CardHeader collapsible forms, toast + `getFirebaseErrorMessage`.
- Do not re-enable Auth0/Amplify/Supabase.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/sections/billing/subscription-domain.ts` | Pure status/grace helpers |
| `src/sections/billing/subscription-domain.test.ts` | Vitest for domain |
| `src/api/firestore/plans.ts` | Plan types + list reads |
| `src/api/firestore/billing.ts` | Settings/subscription/invoice reads + CF wrappers |
| `src/api/firestore/platform.ts` | Extend `Enterprise` with `subscription` |
| `src/api/firestore/paths.ts` | Add `subscriptionInvoices` collection name |
| `functions/billing/asaas-client.js` | Asaas REST helper |
| `functions/billing/subscription-domain.js` | Shared pure logic (CommonJS copy of domain rules) |
| `functions/index.js` | New callables + webhook + scheduler; seed Free on create |
| `firestore.rules` | `plans`, `platformSettings`, `platformSecrets`, invoices |
| `src/layouts/config-nav-account.tsx` | Configuração + Assinatura links |
| `src/layouts/config-nav-dashboard.tsx` | Plans + billing-settings nav |
| `src/routes/paths.ts` | New paths |
| `src/routes/sections/dashboard.tsx` | Routes + guards |
| `src/sections/platform/plan/*` | Plans CRUD UI |
| `src/sections/platform/billing-settings/*` | Asaas settings UI |
| `src/sections/account/account-billing-view.tsx` | Tenant Assinatura tab |
| `src/sections/account/view/account-view.tsx` | Billing tab |
| `src/sections/platform/enterprise/view/enterprise-details-view.tsx` | Read-only subscription block |
| `src/locales/langs/{pt,en,es}/common.json` | i18n keys |
| `docs/agents/antigravity-erp-handoff.md` | Slice note |

---

### Task 1: Pure subscription domain (TDD)

**Files:**
- Create: `src/sections/billing/subscription-domain.ts`
- Create: `src/sections/billing/subscription-domain.test.ts`

**Interfaces:**
- Produces:

```ts
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';
export type PlanCode = 'free' | 'pro' | 'ultra';

export function shouldDowngradeAfterGrace(
  pastDueSince: string | null | undefined,
  graceDays: number,
  now: Date
): boolean;

export function mapAsaasPaymentEventToStatus(
  event: string
): SubscriptionStatus | null;

export function buildFreeSubscription(planId: string, nowIso: string): {
  planId: string;
  planCode: 'free';
  status: 'active';
  billingCycle: 'monthly';
  currentPeriodStart: null;
  currentPeriodEnd: null;
  cancelAtPeriodEnd: false;
  pastDueSince: null;
  asaasCustomerId: null;
  asaasSubscriptionId: null;
  paymentMethod: null;
  updatedAt: string;
};
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  shouldDowngradeAfterGrace,
  mapAsaasPaymentEventToStatus,
  buildFreeSubscription,
} from './subscription-domain';

describe('shouldDowngradeAfterGrace', () => {
  it('returns false when pastDueSince is null', () => {
    expect(shouldDowngradeAfterGrace(null, 7, new Date('2026-11-17T12:00:00.000Z'))).toBe(false);
  });

  it('returns false inside grace window', () => {
    expect(
      shouldDowngradeAfterGrace(
        '2026-11-15T12:00:00.000Z',
        7,
        new Date('2026-11-17T12:00:00.000Z')
      )
    ).toBe(false);
  });

  it('returns true after graceDays elapsed', () => {
    expect(
      shouldDowngradeAfterGrace(
        '2026-11-01T12:00:00.000Z',
        7,
        new Date('2026-11-17T12:00:00.000Z')
      )
    ).toBe(true);
  });
});

describe('mapAsaasPaymentEventToStatus', () => {
  it('maps PAYMENT_RECEIVED to active', () => {
    expect(mapAsaasPaymentEventToStatus('PAYMENT_RECEIVED')).toBe('active');
  });

  it('maps PAYMENT_CONFIRMED to active', () => {
    expect(mapAsaasPaymentEventToStatus('PAYMENT_CONFIRMED')).toBe('active');
  });

  it('maps PAYMENT_OVERDUE to past_due', () => {
    expect(mapAsaasPaymentEventToStatus('PAYMENT_OVERDUE')).toBe('past_due');
  });

  it('maps unknown to null', () => {
    expect(mapAsaasPaymentEventToStatus('SOMETHING_ELSE')).toBeNull();
  });
});

describe('buildFreeSubscription', () => {
  it('returns active free shape', () => {
    const sub = buildFreeSubscription('plan_free', '2026-11-17T00:00:00.000Z');
    expect(sub.planCode).toBe('free');
    expect(sub.status).toBe('active');
    expect(sub.asaasSubscriptionId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/sections/billing/subscription-domain.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';
export type PlanCode = 'free' | 'pro' | 'ultra';

export function shouldDowngradeAfterGrace(
  pastDueSince: string | null | undefined,
  graceDays: number,
  now: Date
): boolean {
  if (!pastDueSince) return false;
  const start = Date.parse(pastDueSince);
  if (Number.isNaN(start)) return false;
  const days = Math.max(0, Number(graceDays) || 0);
  const elapsedMs = now.getTime() - start;
  return elapsedMs >= days * 24 * 60 * 60 * 1000;
}

export function mapAsaasPaymentEventToStatus(event: string): SubscriptionStatus | null {
  switch (event) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED':
      return 'active';
    case 'PAYMENT_OVERDUE':
      return 'past_due';
    default:
      return null;
  }
}

export function buildFreeSubscription(planId: string, nowIso: string) {
  return {
    planId,
    planCode: 'free' as const,
    status: 'active' as const,
    billingCycle: 'monthly' as const,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    pastDueSince: null,
    asaasCustomerId: null,
    asaasSubscriptionId: null,
    paymentMethod: null,
    updatedAt: nowIso,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/sections/billing/subscription-domain.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/sections/billing/subscription-domain.ts src/sections/billing/subscription-domain.test.ts
git commit -m "$(cat <<'EOF'
feat(billing): add subscription domain helpers with tests

EOF
)"
```

---

### Task 2: Client types + Firestore API (plans / billing)

**Files:**
- Create: `src/api/firestore/plans.ts`
- Create: `src/api/firestore/billing.ts`
- Modify: `src/api/firestore/paths.ts` — add `'subscriptionInvoices'` to `EnterpriseCollectionName`
- Modify: `src/api/firestore/platform.ts` — add `subscription?: EnterpriseSubscription` on `Enterprise` + map in `mapEnterprise`

**Interfaces:**
- Consumes: `FIRESTORE`, `FUNCTIONS`, `omitUndefined`, `enterpriseCollection`
- Produces types/functions:

```ts
// plans.ts
export type PlanCode = 'free' | 'pro' | 'ultra';
export type Plan = {
  id: string;
  code: PlanCode;
  name: string;
  description?: string;
  priceMonthly: number;
  currency: 'BRL';
  features: string[];
  sortOrder: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};
export function listPlans(opts?: { activeOnly?: boolean }): Promise<Plan[]>;
export function getPlan(id: string): Promise<Plan | null>;

// billing.ts
export type EnterpriseSubscription = { /* match spec §7.3 */ };
export type PlatformBillingSettings = { /* match spec §7.2 */ };
export type SubscriptionInvoice = { /* match spec §7.4 */ };
export function getBillingSettings(): Promise<PlatformBillingSettings | null>;
export function listSubscriptionInvoices(enterpriseId: string): Promise<SubscriptionInvoice[]>;
export function saveBillingSettings(input: {
  graceDays: number;
  asaasEnv: 'sandbox' | 'production';
  asaasApiKey?: string;
  asaasWebhookToken?: string;
}): Promise<PlatformBillingSettings>;
export function upsertPlan(input: Omit<Plan, 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Plan>;
export function deactivatePlan(planId: string): Promise<void>;
export function startSubscription(input: {
  enterpriseId: string;
  planId: string;
  paymentMethod: 'pix' | 'boleto' | 'credit_card';
  creditCardToken?: string;
}): Promise<{ subscription: EnterpriseSubscription; paymentUrl?: string | null }>;
export function cancelSubscriptionAtPeriodEnd(enterpriseId: string): Promise<EnterpriseSubscription>;
```

- [ ] **Step 1: Extend `paths.ts`**

Add `'subscriptionInvoices'` to `EnterpriseCollectionName` union.

- [ ] **Step 2: Add types to `platform.ts`**

Import or redefine `EnterpriseSubscription` from `billing.ts` (prefer export from `billing.ts` and import in `platform.ts`). In `mapEnterprise`, if `data.subscription` is object, attach mapped subscription; else `undefined`.

- [ ] **Step 3: Implement `plans.ts`**

Use `collection(FIRESTORE, 'plans')`, `getDocs` + optional client filter `active === true`, sort by `sortOrder`. Map docs to `Plan`.

- [ ] **Step 4: Implement `billing.ts`**

- `getDoc(doc(FIRESTORE, 'platformSettings', 'billing'))`
- `listSubscriptionInvoices` via `enterpriseCollection(enterpriseId, 'subscriptionInvoices')`
- CF wrappers with `httpsCallable` same pattern as `platform.ts` `call()`:

```ts
async function call<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq, TRes>(FUNCTIONS, name);
  const result = await fn(data);
  return result.data;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`  
Expected: no errors from new files (ignore pre-existing unrelated if any; fix what you introduced).

- [ ] **Step 6: Commit**

```bash
git add src/api/firestore/plans.ts src/api/firestore/billing.ts src/api/firestore/paths.ts src/api/firestore/platform.ts
git commit -m "$(cat <<'EOF'
feat(billing): add plans and billing Firestore client API

EOF
)"
```

---

### Task 3: CF — Free seed on `createEnterprise` + ensure Free plan

**Files:**
- Create: `functions/billing/subscription-domain.js` (CommonJS port of Task 1 helpers used by CF)
- Modify: `functions/index.js` — `createEnterprise` + helper `ensureFreePlan()`

**Interfaces:**
- Produces (internal):

```js
async function ensureFreePlan(db) // returns { id, ...plan }
// createEnterprise payload gains subscription: buildFreeSubscription(freePlan.id, nowIso())
```

- [ ] **Step 1: Add `functions/billing/subscription-domain.js`**

Port `shouldDowngradeAfterGrace`, `mapAsaasPaymentEventToStatus`, `buildFreeSubscription` as `module.exports`.

- [ ] **Step 2: Add `ensureFreePlan` in `functions/index.js`**

```js
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
```

- [ ] **Step 3: Patch `createEnterprise`**

Before `ref.set(payload)`:

```js
const freePlan = await ensureFreePlan();
const { buildFreeSubscription } = require('./billing/subscription-domain');
payload.subscription = buildFreeSubscription(freePlan.id, nowIso());
// keep asaasCustomerId null; if enterprise already had customer later, startSubscription sets it
```

- [ ] **Step 4: Manual sanity**

Run locally if emulator available; otherwise code-review path: new enterprise doc must include `subscription.planCode === 'free'`.

- [ ] **Step 5: Commit**

```bash
git add functions/billing/subscription-domain.js functions/index.js
git commit -m "$(cat <<'EOF'
feat(billing): seed Free subscription on createEnterprise

EOF
)"
```

---

### Task 4: CF — `saveBillingSettings`, `upsertPlan`, `deactivatePlan`

**Files:**
- Modify: `functions/index.js`

**Interfaces:**
- Produces callables matching Task 2 client wrappers.

**Secrets storage (Billing-A):**
- Public: `platformSettings/billing` — `{ graceDays, asaasEnv, asaasApiKeyConfigured, asaasWebhookTokenConfigured, updatedAt, updatedByUid }`
- Private: `platformSecrets/asaas` — `{ apiKey?, webhookToken?, updatedAt }` written only via Admin SDK; rules deny all

- [ ] **Step 1: Implement `saveBillingSettings`**

```js
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
  if (typeof request.data?.asaasWebhookToken === 'string' && request.data.asaasWebhookToken.trim()) {
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
```

- [ ] **Step 2: Implement `upsertPlan`**

Validate `code` ∈ free|pro|ultra, `priceMonthly >= 0`, unique active code (query `code` + `active==true`, allow same id). Set timestamps. Return `{ id, ...data }`.

- [ ] **Step 3: Implement `deactivatePlan`**

Load plan; if `code === 'free'` throw `failed-precondition`; else `active: false`.

- [ ] **Step 4: Commit**

```bash
git add functions/index.js
git commit -m "$(cat <<'EOF'
feat(billing): platform saveBillingSettings and plan upsert/deactivate

EOF
)"
```

---

### Task 5: CF — Asaas client + `startSubscription` + `cancelSubscriptionAtPeriodEnd`

**Files:**
- Create: `functions/billing/asaas-client.js`
- Modify: `functions/index.js`

**Interfaces:**
- Produces:

```js
// asaas-client.js
function getAsaasBaseUrl(env) // sandbox | production
async function asaasRequest({ apiKey, env, method, path, body })
async function createOrUpdateCustomer(...)
async function createSubscription(...)
async function cancelSubscription(subscriptionId, ...)
```

- [ ] **Step 1: Implement Asaas client**

```js
function getAsaasBaseUrl(env) {
  return env === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

async function asaasRequest({ apiKey, env, method, path, body }) {
  const res = await fetch(`${getAsaasBaseUrl(env)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    err.asaas = data;
    throw err;
  }
  return data;
}

module.exports = { getAsaasBaseUrl, asaasRequest };
```

- [ ] **Step 2: Add `assertTenantAdminOnly(request, enterpriseId)`**

```js
function assertTenantAdminOnly(request, enterpriseId) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  const ok =
    request.auth.token.enterpriseId === enterpriseId &&
    request.auth.token.role === 'admin';
  if (!ok) {
    throw new HttpsError('permission-denied', 'Enterprise admin role required');
  }
}
```

- [ ] **Step 3: Implement `startSubscription`**

Flow:
1. `assertTenantAdminOnly`
2. Load `platformSettings/billing` + `platformSecrets/asaas`; if no apiKey → `failed-precondition`
3. Load plan by id; require `active` and `code !== 'free'` and `priceMonthly > 0`
4. Load enterprise; require document/name/email for Asaas customer
5. Create customer if `subscription.asaasCustomerId` missing (`POST /customers` with `externalReference: enterpriseId`)
6. Map paymentMethod: `pix`→`PIX`, `boleto`→`BOLETO`, `credit_card`→`CREDIT_CARD` (+ `creditCardToken` required)
7. `POST /subscriptions` with `cycle: MONTHLY`, `value: plan.priceMonthly`, `customer`
8. Write enterprise.subscription with `status: 'incomplete'`, plan fields, asaas ids, `paymentMethod`, periods if returned
9. Return subscription + `paymentUrl` from first payment if present (`invoiceUrl` / `bankSlipUrl` / `pix` payload when available)

On Asaas error: set `incomplete` if partial write needed; throw `HttpsError('internal', message)`.

- [ ] **Step 4: Implement `cancelSubscriptionAtPeriodEnd`**

1. Tenant admin only  
2. Require paid `asaasSubscriptionId`  
3. Asaas update/delete per API (prefer update with cancel at end if supported; else document delete-at-cycle via Asaas `DELETE` + flag local `cancelAtPeriodEnd: true` and keep paid until `currentPeriodEnd`)  
4. Persist `cancelAtPeriodEnd: true`

- [ ] **Step 5: Commit**

```bash
git add functions/billing/asaas-client.js functions/index.js
git commit -m "$(cat <<'EOF'
feat(billing): start and cancel Asaas subscriptions via Cloud Functions

EOF
)"
```

---

### Task 6: CF — `asaasWebhook` + `enforceSubscriptionGrace`

**Files:**
- Modify: `functions/index.js`
- Requires: `firebase-functions/v2/https` `onRequest`, `firebase-functions/v2/scheduler` `onSchedule`

**Interfaces:**
- HTTP `asaasWebhook`: header or query token must match `platformSecrets/asaas.webhookToken`
- Scheduler daily `enforceSubscriptionGrace`

- [ ] **Step 1: Implement webhook**

```js
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const {
  mapAsaasPaymentEventToStatus,
  shouldDowngradeAfterGrace,
  buildFreeSubscription,
} = require('./billing/subscription-domain');

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

  // Resolve enterprise by subscription.asaasCustomerId == customerId
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
  res.status(200).json({ ok: true, enterpriseId: entId });
});
```

- [ ] **Step 2: Implement scheduler**

```js
exports.enforceSubscriptionGrace = onSchedule('every 24 hours', async () => {
  const settings = (await db.doc('platformSettings/billing').get()).data() || {};
  const graceDays = Number(settings.graceDays ?? 7);
  const freePlan = await ensureFreePlan();
  const snap = await db
    .collection('enterprises')
    .where('subscription.status', '==', 'past_due')
    .get();
  const { asaasRequest } = require('./billing/asaas-client');
  const secret = (await db.doc('platformSecrets/asaas').get()).data() || {};
  for (const docSnap of snap.docs) {
    const sub = docSnap.data().subscription || {};
    if (!shouldDowngradeAfterGrace(sub.pastDueSince, graceDays, new Date())) continue;
    if (sub.asaasSubscriptionId && secret.apiKey) {
      try {
        await asaasRequest({
          apiKey: secret.apiKey,
          env: settings.asaasEnv === 'production' ? 'production' : 'sandbox',
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
```

- [ ] **Step 3: Commit**

```bash
git add functions/index.js
git commit -m "$(cat <<'EOF'
feat(billing): Asaas webhook sync and grace downgrade scheduler

EOF
)"
```

---

### Task 7: Firestore rules delta

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add helpers + matches**

```
function isTenantAdmin() {
  return request.auth.token.role == 'admin';
}

match /plans/{planId} {
  allow read: if signedIn();
  allow write: if false;
}

match /platformSettings/{docId} {
  allow read: if signedIn() && isPlatformAdmin();
  allow write: if false;
}

match /platformSecrets/{docId} {
  allow read, write: if false;
}

match /enterprises/{enterpriseId}/subscriptionInvoices/{invoiceId} {
  allow read: if signedIn() && (
    isPlatformAdmin() || (sameEnterprise(enterpriseId) && isTenantAdmin())
  );
  allow write: if false;
}
```

Note: enterprise doc already readable by sameEnterprise; subscription field rides on that. Client must **not** update subscription via client SDK — existing `allow write` for admin/gestor on enterprise is broader. **Tighten** enterprise write so subscription field cannot be client-mutated:

```
allow write: if signedIn() && sameEnterprise(enterpriseId) && isAdminOrGestor()
  && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['subscription']);
```

Keep `platformAdmin` create/update/delete as today for full doc (or also strip subscription changes from platform client updates — prefer CF-only for subscription always). For platformAdmin `updateEnterprise` callable uses Admin SDK, so rules on client update path matter for console/client only.

- [ ] **Step 2: Deploy rules when ready**

Run: `firebase deploy --only firestore:rules --project checkout-shop-b5bb3`

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "$(cat <<'EOF'
feat(security): rules for plans, billing settings, and subscription invoices

EOF
)"
```

---

### Task 8: Paths, routes, i18n, avatar, nav

**Files:**
- Modify: `src/routes/paths.ts`
- Modify: `src/routes/sections/dashboard.tsx`
- Modify: `src/layouts/config-nav-account.tsx`
- Modify: `src/layouts/config-nav-dashboard.tsx`
- Modify: `src/locales/langs/pt/common.json`
- Modify: `src/locales/langs/en/common.json`
- Modify: `src/locales/langs/es/common.json`
- Create stub pages under `src/pages/platform/plan/*`, `src/pages/platform/billing-settings/*`, `src/pages/account/billing.tsx` (wire real views in Tasks 9–10)

- [ ] **Step 1: Paths**

```ts
account: {
  root: `${ROOTS.DASHBOARD}/account`,
  general: `${ROOTS.DASHBOARD}/account/general`,
  changePassword: `${ROOTS.DASHBOARD}/account/change-password`,
  company: `${ROOTS.DASHBOARD}/account/company`,
  billing: `${ROOTS.DASHBOARD}/account/billing`,
},
plans: {
  root: `${ROOTS.DASHBOARD}/plans`,
  list: `${ROOTS.DASHBOARD}/plans/list`,
  create: `${ROOTS.DASHBOARD}/plans/create`,
  edit: (id: string) => `${ROOTS.DASHBOARD}/plans/${id}/edit`,
},
billingSettings: `${ROOTS.DASHBOARD}/billing-settings`,
```

- [ ] **Step 2: Replace `_account` demo links**

In `config-nav-account.tsx`, use real items (labels can be English keys replaced later via layout if needed; for Billing-A hardcode PT-friendly labels matching i18n):

```tsx
import { paths } from 'src/routes/paths';

export const _account = [
  {
    label: 'Configuração',
    href: paths.dashboard.account.general,
    icon: <Iconify icon="solar:settings-bold-duotone" />,
  },
  {
    label: 'Assinatura',
    href: paths.dashboard.account.billing,
    icon: <Iconify icon="solar:card-bold-duotone" />,
  },
];
```

Filter Assinatura for non-admin in `AccountDrawer` or pass filtered `data` from `layout.tsx` based on `user.role === 'admin'`. Prefer filter in `layout.tsx` when building account menu:

```tsx
const accountMenu = _account.filter(
  (item) => item.href !== paths.dashboard.account.billing || user?.role === 'admin'
);
```

- [ ] **Step 3: Nav admin items** for `platformAdmin`: Plans + Billing settings under Administração.

- [ ] **Step 4: Routes**

- `plans/*` behind `PermissionGuard requirePlatformAdmin`
- `billing-settings` same
- `account/billing` behind `PermissionGuard roles={['admin']}`

- [ ] **Step 5: i18n keys** (minimum)

```json
"billing": {
  "title": "Assinatura",
  "settingsTitle": "Cobrança Asaas",
  "plansTitle": "Planos",
  "upgrade": "Fazer upgrade",
  "cancelAtPeriodEnd": "Cancelar no fim do ciclo",
  "pastDueBanner": "Pagamento em atraso. Grace restante: {{days}} dia(s).",
  "paymentMethod": "Forma de pagamento",
  "invoices": "Faturas"
},
"nav": {
  "plans": "Planos",
  "billingSettings": "Cobrança Asaas",
  "accountBilling": "Assinatura"
}
```

Mirror en/es.

- [ ] **Step 6: Commit**

```bash
git add src/routes/paths.ts src/routes/sections/dashboard.tsx src/layouts/config-nav-account.tsx src/layouts/config-nav-dashboard.tsx src/layouts/dashboard/layout.tsx src/locales/langs/pt/common.json src/locales/langs/en/common.json src/locales/langs/es/common.json src/pages/platform src/pages/account/billing.tsx
git commit -m "$(cat <<'EOF'
feat(billing): routes, nav, avatar links, and i18n for Billing-A

EOF
)"
```

---

### Task 9: Platform UI — Plans CRUD + Billing settings

**Files:**
- Create: `src/sections/platform/plan/plan-form.tsx`
- Create: `src/sections/platform/plan/view/plan-list-view.tsx`
- Create: `src/sections/platform/plan/view/plan-create-view.tsx`
- Create: `src/sections/platform/plan/view/plan-edit-view.tsx`
- Create: `src/sections/platform/billing-settings/billing-settings-form.tsx`
- Create: `src/sections/platform/billing-settings/view/billing-settings-view.tsx`
- Wire pages from Task 8

**Pattern:** Copy structure from `src/sections/platform/enterprise/*` and `src/sections/supplier/supplier-form.tsx` (CardHeader collapse + Zod + Field).

- [ ] **Step 1: Plan form schema**

Zod: `code` enum, `name` min 1, `priceMonthly` >= 0, `features` as string (textarea, split lines to array on submit), `sortOrder` int, `active` bool.

Submit → `upsertPlan`. Deactivate button → `deactivatePlan` (disabled for free).

- [ ] **Step 2: Plan list DataGrid**

Columns: name, code, priceMonthly, active, sortOrder, actions edit.

- [ ] **Step 3: Billing settings form**

Fields: `graceDays`, `asaasEnv` select, `asaasApiKey` password (optional empty = keep), `asaasWebhookToken` password, chips showing configured flags from `getBillingSettings`.

- [ ] **Step 4: Smoke UI**

Open `/dashboard/plans`, `/dashboard/billing-settings` as platformAdmin.

- [ ] **Step 5: Commit**

```bash
git add src/sections/platform/plan src/sections/platform/billing-settings src/pages/platform
git commit -m "$(cat <<'EOF'
feat(billing): platform plans CRUD and Asaas settings UI

EOF
)"
```

---

### Task 10: Tenant Account Assinatura UI

**Files:**
- Create: `src/sections/account/account-billing-view.tsx`
- Create: `src/sections/account/upgrade-plan-dialog.tsx`
- Modify: `src/sections/account/view/account-view.tsx`
- Modify: `src/pages/account/billing.tsx`

- [ ] **Step 1: Account tab**

Add tab `billing` → `paths.dashboard.account.billing`, only if `user.role === 'admin'`.

- [ ] **Step 2: `AccountBillingView`**

Load enterprise via `getEnterprise(enterpriseId)` + `listPlans({ activeOnly: true })` + `listSubscriptionInvoices(enterpriseId)` + `getBillingSettings` (for graceDays banner math only if readable — tenant cannot read settings; compute remaining grace client-side only if `pastDueSince` present **and** pass graceDays from a public field OR store `graceDays` snapshot on subscription later).

**Billing-A fix:** tenant needs grace remaining. Options: (a) allow authenticated read of only `graceDays` via CF `getPublicBillingConfig`, or (b) denormalize `graceDays` onto subscription when past_due. Prefer small CF:

```js
exports.getPublicBillingConfig = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  const s = (await db.doc('platformSettings/billing').get()).data() || {};
  return { graceDays: Number(s.graceDays ?? 7) };
});
```

Add client wrapper in `billing.ts`. Banner uses `shouldDowngradeAfterGrace` inverse to show days left.

UI blocks:
- Current plan name/code/status chip
- `cancelAtPeriodEnd` alert
- past_due banner
- Buttons: Upgrade → dialog; Cancel at period end → confirm → CF
- Invoices table (dueDate, value, status, link)

- [ ] **Step 3: Upgrade dialog**

Cards for active paid plans; radio payment method; if credit_card, text field for Asaas creditCardToken (sandbox token paste OK for Billing-A; document that production must use Asaas.js tokenization later). Submit → `startSubscription`. Show returned `paymentUrl` link.

- [ ] **Step 4: Commit**

```bash
git add src/sections/account src/pages/account/billing.tsx src/api/firestore/billing.ts functions/index.js
git commit -m "$(cat <<'EOF'
feat(billing): account Assinatura tab with upgrade and invoices

EOF
)"
```

---

### Task 11: Enterprise details subscription summary + handoff verify

**Files:**
- Modify: `src/sections/platform/enterprise/view/enterprise-details-view.tsx`
- Modify: `docs/agents/antigravity-erp-handoff.md`

- [ ] **Step 1: Details block**

Show `planCode`, `status`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `pastDueSince` read-only.

- [ ] **Step 2: Handoff**

Add Billing-A done bullets + deferred Entitlements-B / Storefront-C. Note deploy: functions + rules; configure Asaas webhook URL to `asaasWebhook` HTTP function with token.

- [ ] **Step 3: Verification**

Run:
```bash
npx vitest run src/sections/billing/subscription-domain.test.ts
npx tsc --noEmit
```

Expected: domain tests PASS; tsc clean for touched files.

- [ ] **Step 4: Commit**

```bash
git add src/sections/platform/enterprise/view/enterprise-details-view.tsx docs/agents/antigravity-erp-handoff.md
git commit -m "$(cat <<'EOF'
docs: note Billing-A handoff and enterprise subscription summary

EOF
)"
```

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
|------------------|------|
| Free seed on createEnterprise | T3 |
| platformAdmin plan CRUD | T4, T9 |
| Asaas credentials + graceDays | T4, T9 |
| Tenant admin upgrade PIX/boleto/card | T5, T10 |
| Cancel at period end | T5, T10 |
| Webhook sync + invoices | T6, T10 |
| Grace downgrade scheduler | T6 |
| Avatar Configuração/Assinatura | T8 |
| Rules no client secret/write subscription | T7 |
| Unit tests domain | T1 |
| No entitlements / storefront | Global constraints |
| getPublicBillingConfig for grace banner | T10 |

## Placeholder scan

No TBD/TODO left in tasks. Asaas credit-card production tokenization called out as paste-token for sandbox in T10 (explicit, not deferred silently).

## Type consistency

- `EnterpriseSubscription` / `Plan` / statuses match spec §7 and Task 1 helpers.
- CF names match client wrappers in Task 2: `saveBillingSettings`, `upsertPlan`, `deactivatePlan`, `startSubscription`, `cancelSubscriptionAtPeriodEnd`, plus `getPublicBillingConfig` (T10).
`}

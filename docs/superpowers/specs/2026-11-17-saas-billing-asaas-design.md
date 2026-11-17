# Design: SaaS Billing — Plans Free/Pro/Ultra + Asaas (Slice Billing-A)

**Date:** 2026-11-17  
**Status:** Draft for user review  
**Stack:** Firebase Auth + Firestore + Cloud Functions v2 + Asaas API + Minimals Vite React  

## 1. Context and problem

The ERP is multi-tenant (`enterprises/{enterpriseId}`) with `platformAdmin` and tenant roles (`admin` | `gestor` | `operador`). Enterprises are created via Cloud Functions (`createEnterprise`) with **no subscription or plan**. There is no Asaas integration, no plan catalog, and Account only has General / Security / Company tabs.

The product needs SaaS monetization: every company starts on **Free**, can upgrade to monthly **Pro** or **Ultra**, pays through a **single platform Asaas account** configured by `platformAdmin`, and loses paid access after a configurable grace period on payment failure. Tenant admins manage subscription from the avatar menu / Account.

This slice is **SaaS billing only**. Feature limits (e.g. Free = 1 admin + 1 collaborator, 10 products) and the public storefront/checkout are deferred to later slices.

## 2. Goals

1. Seed every new enterprise with an **active Free** subscription.
2. Let `platformAdmin` CRUD commercial plans (Free/Pro/Ultra codes, price, feature bullets for UI) and configure Asaas credentials + `graceDays` (default 7).
3. Let tenant `admin` upgrade to Pro/Ultra (PIX, boleto, or credit card with Asaas recurrence), view invoices, and cancel at period end.
4. Sync subscription state from Asaas webhooks into Firestore (source of truth for the app).
5. Auto-downgrade to Free after grace when payment stays past due.
6. Expose Assinatura / Configuração from the avatar menu.

## 3. Non-goals (deferred)

- Entitlement enforcement (product/user caps, email/WhatsApp/feature gates)
- Public product catalog / B2C checkout (storefront style “Nota IA”)
- Per-enterprise Asaas credentials or marketplace split
- New custom claims for `planCode` (read plan from enterprise doc for now)
- NestJS / PostgreSQL billing
- Soft-lock of login without downgrade

## 4. Decisions (locked)

| Topic | Decision |
|-------|----------|
| Scope | Billing + plans + Asaas + Account/Assinatura UI only |
| Asaas ownership | One SaaS account; only `platformAdmin` configures credentials |
| Past due | Status `past_due` → after `graceDays` (configurable, default 7) → cancel Asaas + Free |
| Plans | Full CRUD by `platformAdmin` (`code` free/pro/ultra, price BRL, features text) |
| Tenant who manages billing | `role: admin` only |
| Payment methods | PIX + boleto + credit card with recurrence |
| Voluntary cancel | `cancelAtPeriodEnd`; paid plan until cycle end → Free |
| UI entry | Avatar: Configuração → Account; Assinatura → `/dashboard/account/billing` |
| Architecture | Firestore source of truth + Asaas Subscriptions API + webhook + daily scheduler |

## 5. Approach (approved)

**Approach 1:** Firestore holds subscription/plan state. Cloud Functions call Asaas (create customer/subscription, cancel) and process webhooks. Secrets never reach the client. UI is Minimals DataGrid/forms for platform; Account billing tab for tenants.

## 6. Architecture

```
platformAdmin ──CF──► Secret Manager (Asaas key/webhook token)
                 └──► plans/* , platformSettings/billing (public flags)

tenant admin ──CF startSubscription / cancelAtPeriodEnd──► Asaas API
Asaas ──webhook──► CF asaasWebhook ──► enterprises/{id}.subscription
                                      └──► subscriptionInvoices/*

Scheduler enforceSubscriptionGrace ──► past_due + grace exceeded → Free
createEnterprise ──► subscription Free active
```

### 6.1 Cloud Functions

| Function | Type | Auth | Behavior |
|----------|------|------|----------|
| `saveBillingSettings` | callable | `platformAdmin` | Upsert `graceDays`, `asaasEnv`; store API key + webhook token in secrets; set `asaasApiKeyConfigured` / `asaasWebhookTokenConfigured` on `platformSettings/billing` |
| `upsertPlan` | callable | `platformAdmin` | Create/update `plans/{id}`; validate unique `code` among active plans |
| `deactivatePlan` | callable | `platformAdmin` | Soft-delete: `active: false` (do not delete Free if in use) |
| `startSubscription` | callable | tenant `admin` + same `enterpriseId` | Require paid plan `active`; create/update Asaas customer + subscription; set enterprise `subscription` (`incomplete` until first confirmation if needed, then `active` via webhook) |
| `cancelSubscriptionAtPeriodEnd` | callable | tenant `admin` | Set Asaas cancel at period end + `cancelAtPeriodEnd: true` |
| `asaasWebhook` | HTTP | webhook token | Idempotent event handling; update status, periods, invoices |
| `enforceSubscriptionGrace` | scheduled (daily) | Admin SDK | Downgrade Free when grace elapsed |
| `createEnterprise` (extend) | callable | existing | Seed `subscription` Free |

**Asaas mapping (conceptual):**

- Payment confirmed / subscription active → `status: active`, clear `pastDueSince`
- Payment overdue / unpaid → `status: past_due`, set `pastDueSince` if null
- Subscription deleted / canceled after period → Free plan fields, clear Asaas subscription id (keep customer id)
- Credit card: use Asaas credit card token / recurrence on subscription create (no PAN in Firestore)

### 6.2 Client API layer

- `src/api/firestore/plans.ts` — list active plans (read); mutations via CF only
- `src/api/firestore/billing.ts` — read `platformSettings/billing`, enterprise subscription, invoices; wrap CF callables
- Extend `Enterprise` type with optional `subscription`

### 6.3 UI

| Surface | Path | Who |
|---------|------|-----|
| Avatar → Configuração | `/dashboard/account` | authenticated |
| Avatar → Assinatura | `/dashboard/account/billing` | tenant `admin` (hide for others) |
| Account tab Assinatura | same | plan card, status, grace banner, upgrade dialog, cancel, invoice table |
| Plans CRUD | `/dashboard/plans` | `platformAdmin` |
| Billing settings | `/dashboard/billing-settings` | `platformAdmin` |
| Enterprise details | existing | read-only subscription summary |

Register paths in `paths.ts`, `dashboard.tsx`, `config-nav-dashboard.tsx` (Administração for platform items). i18n keys in `pt` / `en` / `es`.

Upgrade UX: cards from `plans` (name, `priceMonthly`, `features[]`) → payment method → CF. Show PIX/boleto payment URL from Asaas when returned. Toast success/error via sonner + `getFirebaseErrorMessage`.

## 7. Data model

### 7.1 `plans/{planId}`

```ts
type Plan = {
  id: string;
  code: 'free' | 'pro' | 'ultra';
  name: string;
  description?: string;
  priceMonthly: number; // BRL
  currency: 'BRL';
  features: string[]; // UI/demo bullets only in this slice
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
```

Seed: at least one active Free with `priceMonthly: 0`. Paid codes may exist as drafts (`active: false`) until platformAdmin publishes prices.

### 7.2 `platformSettings/billing`

```ts
type PlatformBillingSettings = {
  graceDays: number; // default 7
  asaasEnv: 'sandbox' | 'production';
  asaasApiKeyConfigured: boolean;
  asaasWebhookTokenConfigured: boolean;
  updatedAt: string;
  updatedByUid?: string;
};
```

API key and webhook token live only in Secret Manager / Functions secrets.

### 7.3 `enterprises/{enterpriseId}.subscription`

```ts
type EnterpriseSubscription = {
  planId: string;
  planCode: 'free' | 'pro' | 'ultra';
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  billingCycle: 'monthly';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: string | null;
  asaasCustomerId: string | null;
  asaasSubscriptionId: string | null;
  paymentMethod: 'pix' | 'boleto' | 'credit_card' | null;
  updatedAt: string;
};
```

### 7.4 `enterprises/{enterpriseId}/subscriptionInvoices/{invoiceId}`

```ts
type SubscriptionInvoice = {
  id: string;
  asaasPaymentId: string;
  status: string; // mirrored Asaas payment status
  value: number;
  dueDate: string;
  paidAt: string | null;
  invoiceUrl: string | null;
  billingType: string; // PIX | BOLETO | CREDIT_CARD ...
  createdAt: string;
  updatedAt: string;
};
```

## 8. Security rules (delta)

- `plans`: authenticated read of documents (client filters `active` for tenant UI); **no client write**
- `platformSettings/billing`: read if `isPlatformAdmin()`; **no client write**; never store secrets in this doc
- `enterprises/{id}` subscription fields: readable with `sameEnterprise` / platformAdmin; **writes only Admin SDK**
- `subscriptionInvoices`: read if tenant `admin` (member role admin) or platformAdmin; **no client write**

Exact role check for invoice read may use `members/{uid}.role == 'admin'` or existing claim helpers already in `firestore.rules`.

## 9. Error handling

| Case | Behavior |
|------|----------|
| Missing Asaas config | `startSubscription` fails with clear error; toast |
| Asaas API error | Log; leave or set `incomplete`; toast |
| Duplicate webhook | Idempotent no-op by payment/event id |
| Non-admin callable | `permission-denied` |
| Cancel on Free | No-op / failed-precondition |
| Upgrade while `past_due` | Allowed only if Asaas accepts new payment method / settle; otherwise block with message to pay open invoice |

## 10. Testing and acceptance

**Unit (pure):**

- Map Asaas event → `EnterpriseSubscription` status transitions
- `shouldDowngradeAfterGrace(pastDueSince, graceDays, now)` true/false

**Smoke (sandbox):**

1. Create enterprise → Free `active`
2. `platformAdmin` sets Asaas sandbox + graceDays + creates Pro/Ultra plans
3. Tenant admin upgrades with PIX or card → webhook → `active` + invoice row
4. Simulate unpaid → `past_due` + banner with remaining grace days
5. After grace (or force scheduler) → Free
6. Voluntary cancel → `cancelAtPeriodEnd` → after period end → Free
7. Non-admin cannot open Assinatura actions / CF returns denied

## 11. Out of scope follow-ups (next slices)

1. **Entitlements-B:** enforce Free limits (1 admin + 1 collaborator, 10 products) and feature flags from plan metadata  
2. **Storefront-C:** public catalog + checkout for end customers  
3. Optional: mirror `planCode` into custom claims for offline guards  

## 12. Acceptance criteria (this slice)

- [ ] New enterprises always have Free subscription seeded  
- [ ] `platformAdmin` can CRUD plans and save billing settings without exposing secrets to the client  
- [ ] Tenant `admin` can upgrade (PIX/boleto/card recurrence), see invoices, cancel at period end  
- [ ] Webhooks update subscription + invoices idempotently  
- [ ] Grace downgrade to Free works via scheduler  
- [ ] Avatar exposes Configuração and Assinatura; i18n pt/en/es  
- [ ] No entitlement hard-blocks and no public storefront in this PR/slice

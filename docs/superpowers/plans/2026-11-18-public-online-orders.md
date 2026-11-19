# Public Online Orders (Vitrine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Anota-style public storefront at `/p/:slug` that places pending online orders via Cloud Functions, notifies admin in realtime, and on accept creates a PDV `sale` tied to the open cash session.

**Architecture:** Public client never reads tenant collections. Callables `getPublicStorefront` / `placeOnlineOrder` (unauthenticated) and `acceptOnlineOrder` / `rejectOnlineOrder` / `upsertOnlineStoreConfig` (auth). Domain helpers for open-store predicate, slug, and order→sale mapping live in shared TS tested with Vitest; CF mirrors the same rules in JS.

**Tech Stack:** Vite React 18, MUI 5, Firebase Auth + Firestore + Functions v2 (`onCall`), Vitest, i18n pt/en/es, existing `createSale` / `getOpenCashSession`.

**Spec:** `docs/superpowers/specs/2026-11-18-public-online-orders-design.md`

## Global Constraints

- Auth method stays Firebase; no Auth0/Amplify/Supabase.
- Collection/field keys in English.
- Public write path only via Admin SDK in Cloud Functions.
- MVP: no complements, no online Pix, no FCM.
- Open store = entitlement `online_orders` ∧ `onlineStore.enabled` ∧ within `openingHours` ∧ open cash session.
- Accept requires open cash; else leave order `pending`.
- ESLint zero warnings + `tsc --noEmit` on touched TS/TSX before task done.
- Imports: `perfectionist/sort-imports` line-length asc.
- i18n keys in `src/locales/langs/{pt,en,es}/common.json`.

---

## File map (create / modify)

| Path | Responsibility |
|------|----------------|
| `src/sections/online-store/online-store-domain.ts` | Pure: slug, open hours, open predicate, order totals, map to sale input |
| `src/sections/online-store/online-store-domain.test.ts` | Vitest for domain |
| `src/api/firestore/online-orders.ts` | Types + list/subscribe + CF wrappers (client) |
| `src/api/firestore/products.ts` | Add `showOnline` |
| `src/api/firestore/plans.ts` | Add `entitlements: string[]` |
| `src/api/firestore/platform.ts` | Add `onlineStore?: OnlineStoreConfig` on Enterprise |
| `src/api/firestore/sales.ts` | Optional `channel`, `onlineOrderId`, `cashSessionId` on create/map |
| `src/api/firestore/paths.ts` | Add `'onlineOrders'` to `EnterpriseCollectionName` |
| `functions/online-orders.js` | CF handlers (new module required by index) |
| `functions/index.js` | Export new callables |
| `firestore.rules` | `onlineOrders` read/write auth+perm; deny public client create |
| `src/routes/paths.ts` | `paths.publicStore` + `dashboard.pos.onlineOrders` |
| `src/routes/sections/public-store.tsx` | Public routes (no AuthGuard) |
| `src/routes/sections/index.tsx` | Mount public routes |
| `src/routes/sections/dashboard.tsx` | Online orders page + PermissionGuard |
| `src/layouts/config-nav-dashboard.tsx` | Nav item Pedidos online |
| `src/pages/public-store/*` | Page shells |
| `src/pages/pos/online-orders.tsx` | Admin queue page |
| `src/sections/public-store/*` | Vitrine, cart, checkout, confirmation views |
| `src/sections/pos/view/online-order-list-view.tsx` | Admin realtime queue |
| `src/sections/account/account-online-store-form.tsx` | Config slug/hours/toggle |
| `src/sections/inventory/product/product-form.tsx` | Switch `showOnline` |
| `src/sections/platform/plan/plan-form.tsx` | Entitlements editor |
| `src/locales/langs/{pt,en,es}/common.json` | Strings |
| `.superpowers/sdd/progress.md` | Ledger |

---

### Task 1: Domain helpers (TDD)

**Files:**
- Create: `src/sections/online-store/online-store-domain.ts`
- Create: `src/sections/online-store/online-store-domain.test.ts`

**Interfaces:**
- Produces:
  - `normalizeStoreSlug(raw: string): string`
  - `isWithinOpeningHours(hours: OnlineStoreDayHours[], now: Date, timeZone?: string): boolean`
  - `resolveOnlineStoreOpen(input: ResolveOpenInput): { isOpen: boolean; closedReason?: 'plan' | 'disabled' | 'outside_hours' | 'no_open_cash' }`
  - `buildOnlineOrderTotals(items: { qty: number; unitPrice: number }[], deliveryFee: number): { subtotal: number; total: number }`
  - `mapOnlineOrderToCreateSaleInput(order: OnlineOrderLike, meta: { cashSessionId: string; sellerUid?: string; sellerEmail?: string; code: string }): CreateSaleInputLike`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  normalizeStoreSlug,
  isWithinOpeningHours,
  resolveOnlineStoreOpen,
  buildOnlineOrderTotals,
  mapOnlineOrderToCreateSaleInput,
} from './online-store-domain';

describe('normalizeStoreSlug', () => {
  it('lowercases, strips accents, kebab', () => {
    expect(normalizeStoreSlug('  Açai da Praça!! ')).toBe('acai-da-praca');
  });
});

describe('isWithinOpeningHours', () => {
  it('true when now inside weekday window', () => {
    // Wednesday 2026-11-18 14:00 America/Sao_Paulo
    const now = new Date('2026-11-18T17:00:00.000Z');
    const hours = [{ day: 3, open: '10:00', close: '22:00' }];
    expect(isWithinOpeningHours(hours, now, 'America/Sao_Paulo')).toBe(true);
  });

  it('false when day marked closed', () => {
    const now = new Date('2026-11-18T17:00:00.000Z');
    const hours = [{ day: 3, open: '10:00', close: '22:00', closed: true }];
    expect(isWithinOpeningHours(hours, now, 'America/Sao_Paulo')).toBe(false);
  });
});

describe('resolveOnlineStoreOpen', () => {
  const base = {
    hasEntitlement: true,
    enabled: true,
    hours: [{ day: 3, open: '10:00', close: '22:00' }] as const,
    now: new Date('2026-11-18T17:00:00.000Z'),
    hasOpenCash: true,
    timeZone: 'America/Sao_Paulo',
  };

  it('open when all gates pass', () => {
    expect(resolveOnlineStoreOpen({ ...base, hours: [...base.hours] }).isOpen).toBe(true);
  });

  it('closedReason plan', () => {
    expect(resolveOnlineStoreOpen({ ...base, hours: [...base.hours], hasEntitlement: false })).toEqual({
      isOpen: false,
      closedReason: 'plan',
    });
  });

  it('closedReason no_open_cash', () => {
    expect(resolveOnlineStoreOpen({ ...base, hours: [...base.hours], hasOpenCash: false })).toEqual({
      isOpen: false,
      closedReason: 'no_open_cash',
    });
  });
});

describe('buildOnlineOrderTotals', () => {
  it('sums lines + delivery fee', () => {
    expect(buildOnlineOrderTotals([{ qty: 2, unitPrice: 10 }, { qty: 1, unitPrice: 5 }], 3)).toEqual({
      subtotal: 25,
      total: 28,
    });
  });
});

describe('mapOnlineOrderToCreateSaleInput', () => {
  it('maps payment on delivery and channel fields', () => {
    const sale = mapOnlineOrderToCreateSaleInput(
      {
        customerName: 'Ana',
        customerPhone: '11999999999',
        customerAddress: 'Rua A, 1',
        deliveryType: 'delivery',
        deliveryFee: 5,
        paymentMethod: 'pix',
        items: [
          {
            productId: 'p1',
            productName: 'Açaí',
            productSku: 'AC1',
            unit: 'un',
            qty: 1,
            unitPrice: 20,
            lineTotal: 20,
            notes: 'sem granola',
          },
        ],
        subtotal: 20,
        total: 25,
        notes: 'interfone 12',
      },
      { cashSessionId: 'cs1', code: 'OL-1', sellerUid: 'u1' }
    );
    expect(sale.total).toBe(25);
    expect(sale.deliveryFee).toBe(5);
    expect(sale.payments[0]).toMatchObject({ method: 'pix', amount: 25 });
    expect(sale.channel).toBe('online');
    expect(sale.cashSessionId).toBe('cs1');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
./node_modules/.bin/vitest run src/sections/online-store/online-store-domain.test.ts
```

Expected: FAIL module not found / export missing.

- [ ] **Step 3: Implement `online-store-domain.ts`**

Implement pure helpers matching the tests. Use `Intl.DateTimeFormat` with `timeZone: 'America/Sao_Paulo'` to get weekday + `HH:mm`. Gate order in `resolveOnlineStoreOpen`: `plan` → `disabled` → `outside_hours` → `no_open_cash`. Round money with `Math.round(n * 100) / 100`.

For `mapOnlineOrderToCreateSaleInput`, set:
- `unitCost: 0` on items if unknown (accept CF will enrich from product/batch later or use product.costPrice in CF)
- `discountAmount: 0`, `discountPercent: 0`
- `paidAmount: total`, `changeAmount: 0`
- `channel: 'online'`, `cashSessionId` from meta
- `notes` merge item notes into sale notes or keep order notes

- [ ] **Step 4: Run tests — expect PASS**

```bash
./node_modules/.bin/vitest run src/sections/online-store/online-store-domain.test.ts
```

- [ ] **Step 5: ESLint + commit**

```bash
./node_modules/.bin/eslint --fix src/sections/online-store/online-store-domain.ts src/sections/online-store/online-store-domain.test.ts
./node_modules/.bin/eslint --max-warnings=0 src/sections/online-store/online-store-domain.ts src/sections/online-store/online-store-domain.test.ts
git add src/sections/online-store/online-store-domain.ts src/sections/online-store/online-store-domain.test.ts
git commit -m "feat(online-store): domain helpers for open gates and sale mapping"
```

---

### Task 2: Firestore types + client API stubs

**Files:**
- Modify: `src/api/firestore/paths.ts` — add `'onlineOrders'`
- Modify: `src/api/firestore/products.ts` — `showOnline?: boolean` in `Product` + map (default `false`)
- Modify: `src/api/firestore/plans.ts` — `entitlements: string[]` in `Plan` + map
- Modify: `src/api/firestore/platform.ts` — `onlineStore?: OnlineStoreConfig` on `Enterprise` + map/update input
- Modify: `src/api/firestore/sales.ts` — `channel?`, `onlineOrderId?`, `cashSessionId?` on `Sale` / `CreateSaleInput` / `mapSale` / `wb.set`
- Create: `src/api/firestore/online-orders.ts`

**Interfaces:**
- Consumes: domain types conceptually from Task 1 (re-export store config types from `online-orders.ts` or `platform.ts`)
- Produces:
  - `listOnlineOrders(enterpriseId: string): Promise<OnlineOrder[]>`
  - `subscribeOnlineOrders(enterpriseId: string, cb: (rows: OnlineOrder[]) => void): Unsubscribe`
  - `getPublicStorefrontCf(slug: string): Promise<PublicStorefront>`
  - `placeOnlineOrderCf(input: PlaceOnlineOrderInput): Promise<{ orderId: string; code: string }>`
  - `acceptOnlineOrderCf(enterpriseId: string, orderId: string): Promise<{ saleId: string }>`
  - `rejectOnlineOrderCf(enterpriseId: string, orderId: string, reason?: string): Promise<void>`
  - `upsertOnlineStoreConfigCf(enterpriseId: string, config: OnlineStoreConfig): Promise<void>`

- [ ] **Step 1: Extend paths + product/plan/enterprise/sale types** as above. Persist new sale fields in `createSale` `wb.set`.

- [ ] **Step 2: Create `online-orders.ts`** with Zod-free types matching the spec §5.5, `mapOnlineOrder`, `listOnlineOrders`, `onSnapshot` subscribe ordered by `createdAt` desc, and `httpsCallable` wrappers for the five CF names. Until CF exists, wrappers still compile.

```ts
import { httpsCallable } from 'firebase/functions';
import { onSnapshot, orderBy, query, getDocs } from 'firebase/firestore';

import { FUNCTIONS } from 'src/lib/firebase';
import { enterpriseCollection } from './paths';
```

- [ ] **Step 3: Lint + tsc files + commit**

```bash
./node_modules/.bin/eslint --fix src/api/firestore/paths.ts src/api/firestore/products.ts src/api/firestore/plans.ts src/api/firestore/platform.ts src/api/firestore/sales.ts src/api/firestore/online-orders.ts
./node_modules/.bin/eslint --max-warnings=0 src/api/firestore/paths.ts src/api/firestore/products.ts src/api/firestore/plans.ts src/api/firestore/platform.ts src/api/firestore/sales.ts src/api/firestore/online-orders.ts
./node_modules/.bin/tsc --noEmit
git add src/api/firestore/paths.ts src/api/firestore/products.ts src/api/firestore/plans.ts src/api/firestore/platform.ts src/api/firestore/sales.ts src/api/firestore/online-orders.ts
git commit -m "feat(firestore): online orders types, showOnline, plan entitlements"
```

---

### Task 3: Cloud Functions module

**Files:**
- Create: `functions/online-orders.js`
- Modify: `functions/index.js` — `require` + `exports.*`

**Interfaces:**
- Consumes: same open-store rules as Task 1 (duplicate JS helpers inside `online-orders.js` — do not import Vite src)
- Produces callables:
  - `getPublicStorefront({ slug })`
  - `placeOnlineOrder({ slug, items, customerName, customerPhone, customerAddress?, deliveryType, paymentMethod, notes? })`
  - `acceptOnlineOrder({ enterpriseId, orderId })`
  - `rejectOnlineOrder({ enterpriseId, orderId, reason? })`
  - `upsertOnlineStoreConfig({ enterpriseId, onlineStore })`

- [ ] **Step 1: Implement helpers in `functions/online-orders.js`**

Port: `normalizeStoreSlug`, `isWithinOpeningHours`, `resolveOnlineStoreOpen`, `buildOnlineOrderTotals`.

Helper `async function loadStoreContext(slug)`:
1. Read `publicStoreIndex/{slug}` → `enterpriseId`
2. Load enterprise, plan by `subscription.planId` / `planCode`
3. `hasEntitlement = (plan.entitlements || []).includes('online_orders') || (plan.code === 'pro' || plan.code === 'ultra')` as temporary fallback
4. Query cashSessions where status open (or list + find) → `hasOpenCash` + `openSessionId`
5. Return context

`getPublicStorefront`:
- If slug missing → `not-found`
- Load products where `active != false`, filter `showOnline === true` && `type === 'finished'`
- Return `{ storeName, isOpen, closedReason, estimatedMinutes, deliveryFee, acceptDelivery, acceptPickup, paymentMethodsOnDelivery, whatsapp, products: [{ id, name, category, description?: '', salePrice, imageUrl }] }`
- Never return costPrice

`placeOnlineOrder`:
- Recompute open; if closed → `failed-precondition` with reason
- Re-fetch each product; require `showOnline` + finished + active; use **server** `salePrice`; if client sent price and `|client - server| > 0.009` → `failed-precondition` `price_changed`
- deliveryFee from config if delivery else 0
- Create doc under `enterprises/{id}/onlineOrders` with `status: 'pending'`, code `OL-YYYYMMDD-XXXX`
- Return `{ orderId, code }`

`upsertOnlineStoreConfig`:
- Auth required; caller claim `enterpriseId` match + role `admin`|`gestor` (or platformAdmin)
- Normalize slug; if another index doc points to different enterprise → `already-exists`
- Transaction: delete old slug index if slug changed; set new index; merge `onlineStore` on enterprise

`acceptOnlineOrder`:
- Auth + same enterprise + (admin/gestor or member perm `pos`)
- Load order; must be `pending`
- Require open cash session
- Build sale payload (payments = [{ method: order.paymentMethod, amount: order.total }]); set `channel: 'online'`, `onlineOrderId`, `cashSessionId`
- Prefer calling shared sale write logic in Admin SDK (batch: sale + stock OUT). If porting full FIFO is heavy in CF, MVP accept may: create sale with items without batch deduction **only if** product has no tracked batches; otherwise pick oldest batch with remainingQty > 0 in CF (simple FIFO query). Mirror client `createSale` fields.
- Update order → `accepted`, `saleId`, `cashSessionId`, `acceptedByUid`

`rejectOnlineOrder`:
- Auth same as accept; set `rejected` + optional reason; no stock

- [ ] **Step 2: Wire exports in `functions/index.js`**

```js
const onlineOrders = require('./online-orders');
exports.getPublicStorefront = onlineOrders.getPublicStorefront;
exports.placeOnlineOrder = onlineOrders.placeOnlineOrder;
exports.acceptOnlineOrder = onlineOrders.acceptOnlineOrder;
exports.rejectOnlineOrder = onlineOrders.rejectOnlineOrder;
exports.upsertOnlineStoreConfig = onlineOrders.upsertOnlineStoreConfig;
```

- [ ] **Step 3: Commit**

```bash
git add functions/online-orders.js functions/index.js
git commit -m "feat(functions): public storefront and online order callables"
```

---

### Task 4: Firestore rules + plan entitlements UI seed path

**Files:**
- Modify: `firestore.rules`
- Modify: `src/sections/platform/plan/plan-form.tsx`
- Modify: `src/api/firestore/plans.ts` (if not done)
- Modify: `functions/index.js` `upsertPlan` to persist `entitlements` array

- [ ] **Step 1: Rules** — under `enterprises/{enterpriseId}`:

```
match /onlineOrders/{orderId} {
  allow read: if hasPerm(enterpriseId, 'pos');
  allow update, delete: if hasPerm(enterpriseId, 'pos');
  allow create: if false; // Admin SDK / CF only
}

match /{document=**} {
  // existing
}
```

Also: `match /publicStoreIndex/{slug} { allow read, write: if false; }` (CF only) — add at root if collection is top-level.

- [ ] **Step 2: Plan form** — add multiline or checkbox group for entitlements. Persist via `upsertPlan` data.entitlements. Default Pro/Ultra docs should include `online_orders` when seeded/updated by platformAdmin (document in handoff; optional one-shot seed in existing seed script if present).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules src/sections/platform/plan/plan-form.tsx functions/index.js src/api/firestore/plans.ts
git commit -m "feat(security): onlineOrders rules and plan entitlements field"
```

---

### Task 5: Admin config + product `showOnline`

**Files:**
- Create: `src/sections/account/account-online-store-form.tsx`
- Modify: `src/sections/account/account-company-form.tsx` (or account tabs) to include Online Store section/collapse
- Modify: `src/sections/inventory/product/product-form.tsx` — `Field.Switch` `showOnline`
- Modify: locales pt/en/es

- [ ] **Step 1: Product form** — Zod + default `showOnline: false`; save through existing `updateProduct`/`createProduct`.

- [ ] **Step 2: Online store form** — fields: enabled, slug, estimatedMinutes, acceptDelivery/Pickup, paymentMethodsOnDelivery multi, openingHours (7 rows), whatsapp, deliveryFee. Submit → `upsertOnlineStoreConfigCf`. Show public URL `${origin}/p/${slug}` + copy button.

- [ ] **Step 3: i18n keys** under `onlineStore.*` and `product.fields.showOnline`.

- [ ] **Step 4: Lint + commit**

```bash
./node_modules/.bin/eslint --fix src/sections/account/account-online-store-form.tsx src/sections/inventory/product/product-form.tsx src/locales/langs/pt/common.json src/locales/langs/en/common.json src/locales/langs/es/common.json
./node_modules/.bin/eslint --max-warnings=0 src/sections/account/account-online-store-form.tsx src/sections/inventory/product/product-form.tsx
git add src/sections/account/account-online-store-form.tsx src/sections/account/account-company-form.tsx src/sections/inventory/product/product-form.tsx src/locales/langs/pt/common.json src/locales/langs/en/common.json src/locales/langs/es/common.json
git commit -m "feat(admin): online store config and product showOnline switch"
```

---

### Task 6: Admin realtime queue

**Files:**
- Create: `src/sections/pos/view/online-order-list-view.tsx`
- Create: `src/pages/pos/online-orders.tsx`
- Modify: `src/routes/paths.ts` — `pos.onlineOrders`
- Modify: `src/routes/sections/dashboard.tsx` — route + `PermissionGuard permission="pos"`
- Modify: `src/layouts/config-nav-dashboard.tsx` — nav under PDV
- Modify: locales

- [ ] **Step 1: List view** — `DashboardContent` + Card; `subscribeOnlineOrders`; tabs pending/accepted/rejected; on new pending id not in ref Set → `toast` + `new Audio('/assets/sound/notification.mp3')` or `AudioContext` beep fallback if asset missing.

Actions:
- Accept → `acceptOnlineOrderCf` → toast success → link to `paths.dashboard.pos.saleDetails(saleId)`
- Reject → confirm dialog → `rejectOnlineOrderCf`

- [ ] **Step 2: Wire routes/nav/i18n**

- [ ] **Step 3: Lint + commit**

```bash
./node_modules/.bin/eslint --fix src/sections/pos/view/online-order-list-view.tsx src/pages/pos/online-orders.tsx src/routes/paths.ts src/routes/sections/dashboard.tsx src/layouts/config-nav-dashboard.tsx
./node_modules/.bin/eslint --max-warnings=0 src/sections/pos/view/online-order-list-view.tsx src/pages/pos/online-orders.tsx
git add src/sections/pos/view/online-order-list-view.tsx src/pages/pos/online-orders.tsx src/routes/paths.ts src/routes/sections/dashboard.tsx src/layouts/config-nav-dashboard.tsx src/locales/langs/pt/common.json src/locales/langs/en/common.json src/locales/langs/es/common.json
git commit -m "feat(pos): realtime online orders queue with accept/reject"
```

---

### Task 7: Public storefront UI (`/p/:slug`)

**Files:**
- Create: `src/routes/sections/public-store.tsx`
- Modify: `src/routes/sections/index.tsx` — insert before 404 catch-all
- Modify: `src/routes/paths.ts` — `publicStore: { root: (slug) => `/p/${slug}`, order: (slug, id) => `/p/${slug}/order/${id}` }`
- Create: `src/pages/public-store/storefront.tsx`
- Create: `src/pages/public-store/order-status.tsx`
- Create: `src/sections/public-store/view/public-storefront-view.tsx`
- Create: `src/sections/public-store/view/public-checkout-drawer.tsx` (or section)
- Create: `src/sections/public-store/view/public-order-confirm-view.tsx`
- Create: `src/sections/public-store/public-cart-context.tsx` (minimal cart state)
- Modify: locales

- [ ] **Step 1: Routes** — path `p/:slug` and `p/:slug/order/:orderId` **without** AuthGuard/DashboardLayout. Minimal blank layout (Container maxWidth sm).

- [ ] **Step 2: Storefront view** — on mount `getPublicStorefrontCf(slug)`; header open/closed; group by category; product dialog qty+notes; sticky cart bar; if `!isOpen` disable checkout CTA with `closedReason` message.

- [ ] **Step 3: Checkout** — form name, phone, address if delivery, paymentMethod select from store methods, submit `placeOnlineOrderCf`; navigate to order confirm with returned ids.

- [ ] **Step 4: Confirm view** — show code + pending status; WhatsApp deep link if configured `https://wa.me/{digits}?text=...`.

- [ ] **Step 5: Mobile CSS** — stack, full-width buttons; verify mentally 360–428px (no desktop-only grids).

- [ ] **Step 6: Lint + tsc + commit**

```bash
./node_modules/.bin/eslint --fix src/routes/sections/public-store.tsx src/routes/sections/index.tsx src/pages/public-store/storefront.tsx src/pages/public-store/order-status.tsx src/sections/public-store/**/*.{ts,tsx}
./node_modules/.bin/eslint --max-warnings=0 src/routes/sections/public-store.tsx src/pages/public-store/storefront.tsx src/pages/public-store/order-status.tsx src/sections/public-store/view/public-storefront-view.tsx
./node_modules/.bin/tsc --noEmit
git add src/routes/sections/public-store.tsx src/routes/sections/index.tsx src/routes/paths.ts src/pages/public-store src/sections/public-store src/locales/langs/pt/common.json src/locales/langs/en/common.json src/locales/langs/es/common.json
git commit -m "feat(public-store): mobile storefront checkout at /p/:slug"
```

---

### Task 8: Verification + SDD ledger

**Files:**
- Modify: `.superpowers/sdd/progress.md`
- Modify: `docs/agents/antigravity-erp-handoff.md` (short status)
- Modify: `docs/superpowers/specs/2026-11-18-public-online-orders-design.md` — Status → Approved / Implemented-in-progress

- [ ] **Step 1: Automated checks**

```bash
./node_modules/.bin/vitest run src/sections/online-store/online-store-domain.test.ts
./node_modules/.bin/tsc --noEmit
```

Expected: PASS / 0 errors.

- [ ] **Step 2: Manual smoke (after CF deploy)**

1. platformAdmin: Pro/Ultra entitlements include `online_orders`.
2. Tenant: set slug, hours covering now, enable store, mark 2 products `showOnline`.
3. Open cash session.
4. Open `/p/{slug}` → place order pay-on-delivery.
5. Admin queue: toast+sound → Accept → sale appears with `channel: online` and `cashSessionId`.
6. Close cash → refresh public → checkout blocked `no_open_cash`.

- [ ] **Step 3: Update ledger + commit**

```bash
git add .superpowers/sdd/progress.md docs/agents/antigravity-erp-handoff.md docs/superpowers/specs/2026-11-18-public-online-orders-design.md
git commit -m "docs(sdd): online orders plan verification notes"
```

---

## Spec coverage checklist (self-review)

| Spec item | Task |
|-----------|------|
| CF public API | T3 |
| Open gates (plan/hours/cash/enabled) | T1 + T3 |
| `onlineOrders` pending→accept/reject | T3 + T6 |
| Sale + stock + cashSessionId | T3 (accept) + T2 sale fields |
| `showOnline` | T2 + T5 |
| Admin config slug/hours | T5 |
| Plan entitlement | T4 |
| Realtime toast+sound | T6 |
| `/p/:slug` UX | T7 |
| Rules CF-only create | T4 |
| No complements / Pix online / FCM | Global + non-goals |
| i18n pt/en/es | T5–T7 |
| Unit tests open + map sale | T1 |
| Smoke | T8 |

## Placeholder scan

No TBD/TODO left in task steps. CF sale/FIFO note in Task 3 is an explicit MVP decision (implement FIFO pick in CF), not a placeholder.

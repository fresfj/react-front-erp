# Online Orders → Kitchen + KDS Sound + Checkout Address UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept online orders straight into kitchen `preparing`, make KDS sound an icon+tooltip control, and show authenticated delivery address as a Seus Dados–style summary with a change/add modal.

**Architecture:** Surgical change: `acceptOnlineOrder` CF sets `fulfillmentStatus: 'preparing'` while keeping `status: 'accepted'` for compatibility; simplify online-orders UI to one accept path; replace KDS sound Button with IconButton+Tooltip; refactor public checkout delivery block for verified customers to summary+modal using existing `SavedCustomerAddress` helpers.

**Tech Stack:** Cloud Functions v2 (`functions/online-orders.js`), React/MUI Minimals views, `src/sections/public-store/public-customer-profile.ts`, i18n pt/en/es where keys already exist.

**Spec:** `docs/superpowers/specs/2026-11-24-online-orders-kitchen-checkout-ux-design.md`

## Global Constraints

- Auth remains Firebase; no Auth0/Amplify/Supabase reactivation.
- Field names in Firestore stay English (`fulfillmentStatus`, `preparingAt`, …).
- Do not purge `status: 'accepted'` from the data model in this plan.
- ESLint zero-warnings + `tsc --noEmit` on every touched `.ts`/`.tsx` task.
- Imports: `perfectionist/sort-imports` / `sort-named-imports` (`order: 'asc', type: 'line-length'`).
- Deploy note: after Task 1, redeploy `functions:acceptOnlineOrder` when ready (CPU quota may constrain full deploy).
- YAGNI: do not redesign Seus Dados, demand Label, or Meta SLA.

---

## File map

| File | Responsibility |
|------|----------------|
| `functions/online-orders.js` | `acceptOnlineOrder` sets preparing + preparingAt |
| `src/sections/pos/view/online-order-list-view.tsx` | Single accept → optimistic preparing; drop Aceito tab/CTA dual path |
| Online-order card/drawer components used by list view | Props: remove `onAcceptAndPrepare` if only used for dual CTA |
| `src/locales/langs/{pt,en,es}/**` | Adjust/remove `onlineOrders.tabs.accepted` usage if tab removed; add checkout/kitchen strings if needed |
| `src/sections/pos/kitchen/view/kitchen-kds-view.tsx` | Sound IconButton + Tooltip |
| `src/sections/public-store/view/public-checkout-view.tsx` | Delivery summary card for verified+addresses |
| `src/sections/public-store/checkout-address-picker-dialog.tsx` (create) | Modal: list addresses + new form (fullScreen mobile) |
| `docs/agents/antigravity-erp-handoff.md` | Optional one-liner after done |

---

### Task 1: `acceptOnlineOrder` → preparing

**Files:**
- Modify: `functions/online-orders.js` (`acceptUpdate` ~1018–1032)

**Interfaces:**
- Consumes: existing `acceptOnlineOrder` batch sale+order update
- Produces: order after accept has `status: 'accepted'`, `fulfillmentStatus: 'preparing'`, `acceptedAt`, `preparingAt` (same `timestamp`)

- [ ] **Step 1: Locate acceptUpdate**

Confirm current block sets `fulfillmentStatus: 'accepted'`.

- [ ] **Step 2: Patch acceptUpdate**

```js
const acceptUpdate = {
  status: 'accepted',
  fulfillmentStatus: 'preparing',
  saleId: saleRef.id,
  cashSessionId: openCash.id,
  acceptedByUid: request.auth.uid,
  acceptedAt: timestamp,
  preparingAt: timestamp,
  updatedAt: timestamp,
};
```

Keep payment confirmation fields as today.

- [ ] **Step 3: Smoke (no SEFAZ)**

```bash
node -e "const fs=require('fs'); const s=fs.readFileSync('functions/online-orders.js','utf8'); if(!s.includes(\"fulfillmentStatus: 'preparing'\") \|\| !s.includes('preparingAt: timestamp')) process.exit(1); console.log('accept_preparing_ok');"
```

Expected: `accept_preparing_ok`

- [ ] **Step 4: Commit**

```bash
git add functions/online-orders.js
git commit -m "$(cat <<'EOF'
fix(online-orders): accept sends fulfillmentStatus preparing for kitchen

EOF
)"
```

---

### Task 2: Online orders UI — one accept path, drop Aceito ops stage

**Files:**
- Modify: `src/sections/pos/view/online-order-list-view.tsx`
- Modify: any child (order card / detail drawer) that receives `onAcceptAndPrepare` / dual accept buttons — search `onAcceptAndPrepare` / `Aceitar e`
- Modify: `src/locales/langs/pt|en|es` only if removing unused keys or renaming accept CTA (optional; unused keys may stay)

**Interfaces:**
- Consumes: `acceptOnlineOrderCf(enterpriseId, orderId)` only (no follow-up `updateOnlineOrderStatusCf(..., 'preparing')` on accept)
- Produces: optimistic map uses `'preparing'`; tabs exclude operational `accepted` fulfillment stage

- [ ] **Step 1: Grep call sites**

```bash
rg -n "handleAcceptAndPrepare|onAcceptAndPrepare|tabs\.accepted|fulfillmentStatus === 'accepted'" src/sections/pos src/locales -g '*.{ts,tsx,json}'
```

- [ ] **Step 2: Collapse handlers**

- Delete `handleAcceptAndPrepare` (or make it an alias removed from UI).
- Update `handleAccept` optimistic status to `'preparing'`.
- Wire all Accept buttons to `handleAccept` only.
- Remove tab/filter entry `value: 'accepted'` from operational tabs if it filters by order `status === 'accepted'` **as a kitchen stage**. If the tab means “accepted sales history”, re-read UX: per spec, remove Aceito as operational stage — prefer filtering by `fulfillmentStatus` for kitchen stages (`preparing`, `out_for_delivery`, …) and keep pending/rejected. Align analytics strip: do not highlight “Aceito” as next action after pending.

- [ ] **Step 3: Child components**

Remove secondary “prepare” button props; keep Reject.

- [ ] **Step 4: Quality gate**

```bash
./node_modules/.bin/eslint --fix <touched_tsx>
./node_modules/.bin/eslint --max-warnings=0 <touched_tsx>
./node_modules/.bin/tsc --noEmit
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/sections/pos/view/online-order-list-view.tsx src/sections/pos/**/*.tsx src/locales/langs/**/common.json
git commit -m "$(cat <<'EOF'
fix(pos): single online-order accept path goes to preparing

EOF
)"
```

---

### Task 3: KDS sound IconButton + Tooltip

**Files:**
- Modify: `src/sections/pos/kitchen/view/kitchen-kds-view.tsx`

**Interfaces:**
- Consumes: existing `soundEnabled` / `setSoundEnabled`
- Produces: header action IconButton (default size) + Tooltip title / aria-label

- [ ] **Step 1: Add imports**

`IconButton`, `Tooltip` from MUI (sort imports per perfectionist).

- [ ] **Step 2: Replace Button**

Replace the `Button size="small"` sound control (~lines 267–279) with:

```tsx
<Tooltip title={soundEnabled ? 'Som ativo' : 'Som mudo'}>
  <IconButton
    color={soundEnabled ? 'primary' : 'default'}
    aria-label={soundEnabled ? 'Som ativo' : 'Som mudo'}
    onClick={() => setSoundEnabled((prev) => !prev)}
  >
    <Iconify
      icon={soundEnabled ? 'solar:volume-loud-bold' : 'solar:volume-cross-bold'}
      width={22}
    />
  </IconButton>
</Tooltip>
```

Do **not** use `size="small"`. Leave Demand Label + Meta SLA unchanged.

- [ ] **Step 3: Quality gate**

```bash
./node_modules/.bin/eslint --fix src/sections/pos/kitchen/view/kitchen-kds-view.tsx
./node_modules/.bin/eslint --max-warnings=0 src/sections/pos/kitchen/view/kitchen-kds-view.tsx
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/sections/pos/kitchen/view/kitchen-kds-view.tsx
git commit -m "$(cat <<'EOF'
fix(kitchen): sound control as icon with tooltip

EOF
)"
```

---

### Task 4: Checkout delivery address summary + modal

**Files:**
- Create: `src/sections/public-store/checkout-address-picker-dialog.tsx`
- Modify: `src/sections/public-store/view/public-checkout-view.tsx`
- Reuse: `public-customer-profile.ts` (`SavedCustomerAddress`, `formatSavedAddressLine`, `upsertPublicCustomerAddress`, `getDefaultPublicCustomerAddress`)
- Pattern reference: `public-customer-account-drawer.tsx` (`fullScreen={isMobile}` modal)

**Interfaces:**
- Dialog props (suggested):

```ts
type CheckoutAddressPickerDialogProps = {
  open: boolean;
  onClose: () => void;
  addresses: SavedCustomerAddress[];
  selectedId?: string;
  onSelect: (addr: SavedCustomerAddress) => void;
  onCreate: (addr: SavedCustomerAddress) => void | Promise<void>;
};
```

- Parent keeps form state (`cep`, `street`, …); `applySavedAddressToForm` remains the single apply helper.
- When `verifiedCustomer && deliveryType === 'delivery'`: show summary card; chips+always-open form removed for that case.
- Guest / no verified: keep current inline form.

- [ ] **Step 1: Extract dialog component**

Implement list + “Novo endereço” form (CEP blur lookup can call the same handlers passed as props or duplicate minimal CEP UX). Use `Dialog` + `fullScreen` on mobile (`useMediaQuery` / existing hook pattern from account drawer).

- [ ] **Step 2: Wire checkout view**

- State: `addressModalOpen`.
- Summary UI mirroring Seus Dados verified block (map icon, primary line, caption, Alterar button).
- On mount / when verified loads: if default address exists, `applySavedAddressToForm` (already partially done — ensure no chip row remains for verified path).
- Empty addresses: CTA opens modal in create mode.

- [ ] **Step 3: Manual acceptance checklist** (document in commit body if useful)

1. Logged-in + default address → summary only.
2. Alterar → select other → fields update; fee recalculates if applicable.
3. Novo → save → selected.
4. Guest → inline form still works.

- [ ] **Step 4: Quality gate**

```bash
./node_modules/.bin/eslint --fix src/sections/public-store/checkout-address-picker-dialog.tsx src/sections/public-store/view/public-checkout-view.tsx
./node_modules/.bin/eslint --max-warnings=0 src/sections/public-store/checkout-address-picker-dialog.tsx src/sections/public-store/view/public-checkout-view.tsx
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/sections/public-store/checkout-address-picker-dialog.tsx src/sections/public-store/view/public-checkout-view.tsx
git commit -m "$(cat <<'EOF'
feat(store): delivery address summary and picker modal for logged-in checkout

EOF
)"
```

---

### Task 5: Handoff + deploy reminder

**Files:**
- Modify: `docs/agents/antigravity-erp-handoff.md` (short bullet under Pendente/Feito)

- [ ] **Step 1: Note**

- Accept → preparing shipped; redeploy `acceptOnlineOrder` required for prod/cloud.
- KDS sound + checkout address UX on front (Amplify via `main`).

- [ ] **Step 2: Commit**

```bash
git add docs/agents/antigravity-erp-handoff.md
git commit -m "$(cat <<'EOF'
docs(handoff): online accept-to-kitchen and checkout address UX

EOF
)"
```

- [ ] **Step 3: Deploy CF when user ready**

```bash
firebase deploy --only functions:acceptOnlineOrder
```

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Accept → preparing atomically | T1 |
| UI single accept / drop Aceito ops | T2 |
| KDS sound icon + tooltip | T3 |
| Checkout summary + modal (logged-in) | T4 |
| Guest inline form kept | T4 |
| Handoff / deploy | T5 |

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-11-24-online-orders-kitchen-checkout-ux.md`.

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task; review between tasks  
**2. Inline** — execute tasks in this session with `executing-plans`

Which approach?

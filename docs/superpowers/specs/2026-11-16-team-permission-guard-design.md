# Design: Team PermissionGuard + Invite (Slice A)

**Date:** 2026-11-16  
**Status:** Draft for user review  
**Stack:** Firebase Auth + Firestore + Cloud Functions + Minimals Vite React  

## 1. Context and problem

Today the dashboard **hides menu items** via `getEffectivePermissions` in `config-nav-dashboard.tsx`, but **routes are not gated**. An operador can type a URL (e.g. `/dashboard/products/list`, `/dashboard/cash/dre`) and still see the screen (problem confirmed as type **B**).

Team invite already collects `displayName`, email, role, temp password, and permission checkboxes, but:

- Login/password fields may trigger browser autocomplete.
- Existing Auth users invited again may not get Auth `displayName` updated.
- Account form already prefers `members/{uid}.displayName`; invite must reliably persist that name.

This slice is **frontend route guards + invite polish**. Firestore rules by permission key are **explicitly deferred**.

## 2. Goals

1. Block unauthorized **route access** with the same permission model as the nav.
2. Disable browser autocomplete on invite email/password fields.
3. Sync collaborator **name** from invite → Auth + `members/{uid}` so `/dashboard/account` opens prefilled.
4. Keep admin/gestor / platformAdmin behavior unchanged (full access where applicable).

## 3. Non-goals (deferred)

- Firestore / Storage rules enforcing `MemberPermissionKey`
- BrasilAPI CEP/CNPJ, enterprise full address, account DOB/phone/address
- Seller ranking, DRE date filters, Contas a pagar/receber
- Mass ESLint cleanup of legacy `inventario` / Typography import noise

## 4. Approach (approved)

**PermissionGuard on route groups** in `src/routes/sections/dashboard.tsx`, using `getEffectivePermissions` (same helper as nav). Not per-page checks and not pathname-map in layout.

## 5. Architecture

### 5.1 `PermissionGuard`

**File:** `src/auth/guard/permission-guard.tsx`  
**Export:** `src/auth/guard/index.ts`

| Prop | Type | Behavior |
|------|------|----------|
| `permission` | `MemberPermissionKey \| MemberPermissionKey[]` | If array: user needs **any one** key. If single: that key. |
| `roles` | `TenantRole[]` | Optional; user role must be in list (or platformAdmin). |
| `requirePlatformAdmin` | `boolean` | Only `platformAdmin` (enterprises). |
| `hasContent` | `boolean` (default `true`) | Show Forbidden UI vs empty. |
| `children` | `ReactNode` | Protected subtree. |

**Resolution order:**

1. Not authenticated / no claims → leave to existing `AuthGuard` / `ClaimsGuard` (parent).
2. If `requirePlatformAdmin` → allow only `user.platformAdmin`.
3. If `user.platformAdmin` → allow (cross-tenant ops; enterprises already separate).
4. If `roles` is set → allow iff `user.role` ∈ `roles`. For this slice, **do not** set `roles` and `permission` on the same guard instance (team → `roles` only; modules → `permission` only).
5. Else compute `getEffectivePermissions(user.role, user.permissions)`:
   - `admin` / `gestor` → all keys (existing helper).
   - `operador` → custom array or `DEFAULT_OPERATOR_PERMISSIONS`.
6. Deny → Forbidden illustration + `permission.deniedTitle` / `permission.deniedBody` (same pattern as `RoleBasedGuard`).

### 5.2 Route map

Wrap each group with `<PermissionGuard>…<Outlet /></PermissionGuard>` as the group `element` (children keep list/create/edit).

| Path group | Guard |
|------------|--------|
| `pos/*` | `permission="pos"` |
| `customers/*` | `permission="customers"` |
| `cash` index (session) | `permission="cash_close"` |
| `cash/dre` | `permission="dre"` |
| `batches` list + `movements` | `permission="batches_read"` |
| `batches/create` | `permission="batches_write"` |
| `products/*` | `permission="products"` |
| `suppliers/*` | `permission="suppliers"` |
| `processing/*` | `permission="processing"` |
| `team/*` | `roles={['admin','gestor']}` |
| `enterprises/*` | `requirePlatformAdmin` |
| `account` | no extra guard |
| dashboard index | no extra guard (nav already hides app if no `dre`; optional later: guard index with `dre`) |

**Cash nesting note:** structure so `/dashboard/cash` requires `cash_close` and sibling `/dashboard/cash/dre` requires `dre` (separate route nodes, not one parent that requires both).

**Batches nesting note:** list/movements under a `batches_read` parent; `create` as sibling under `batches_write` or nested child with its own guard.

### 5.3 Invite UI

**File:** `src/sections/team/view/team-list-view.tsx`

- Email `Field.Text`: `autoComplete="off"`.
- Temp password `Field.Text`: `type="password"`, `autoComplete="new-password"`.
- No change to permission checkbox UX beyond verifying submitted array is what the CF persists.

### 5.4 Cloud Function `inviteMember`

**File:** `functions/index.js`

1. New user: keep `auth.createUser({ displayName })`.
2. Existing user + non-empty `displayName`: `auth.updateUser(uid, { displayName })`.
3. Always merge member doc with `displayName`, `role`, `email`, `active`, timestamps.
4. If `role === 'operador'` and `permissions` missing or empty array: set `DEFAULT_OPERATOR_PERMISSIONS` equivalent (`pos`, `customers`, `cash_close`, `batches_read`) on the member doc.
5. If `admin`/`gestor`: permissions field optional (client treats as full set).

Redeploy functions after change.

### 5.5 Account

No structural change required if member + Auth have `displayName`. Smoke: invite → sign-in → Account shows name.

## 6. Error handling

- Denied route: Forbidden content inside layout (user stays logged in).
- Invite failures: toast + `getFirebaseErrorMessage`.
- Permission edits for a currently logged-in member: may need reload / token refresh to see nav change — document in handoff; optional `getIdToken(true)` + member re-fetch is nice-to-have, not required for slice A.

## 7. Acceptance tests (manual)

1. Operador with only `pos` → nav: PDV + account; `/dashboard/products/list` → Forbidden.
2. Same → `/dashboard/cash/dre` → Forbidden; with `cash_close` → cash session OK, DRE still Forbidden until `dre`.
3. Operador → `/dashboard/team/list` → Forbidden; admin/gestor → OK.
4. Invite displayName “Maria” → login → Account shows Maria; email/password fields have autocomplete attributes above.
5. platformAdmin → `/dashboard/enterprises/list` OK; non-platformAdmin → Forbidden.

## 8. Files to touch

- `src/auth/guard/permission-guard.tsx` (new)
- `src/auth/guard/index.ts`
- `src/routes/sections/dashboard.tsx`
- `src/sections/team/view/team-list-view.tsx`
- `functions/index.js`
- This spec; handoff note after implement

## 9. Follow-up slices (ordered)

1. **B** — BrasilAPI CEP/CNPJ + enterprise/account/supplier fields  
2. Firestore rules by permission (harden bypass beyond UI)  
3. **C** — AP/AR + DRE filters + seller ranking  
4. Legacy/demo ESLint cleanup  

## 10. Decisions log

| Decision | Choice |
|----------|--------|
| First slice | A — team security + autocomplete + name sync |
| URL bypass fix depth | Front now; Firestore rules later (C) |
| Name → account | Sync Auth + members; account remains editable by user |
| Guard placement | Route groups in `dashboard.tsx` |
| Array `permission` prop | Any-of (unused if each route uses one key) |

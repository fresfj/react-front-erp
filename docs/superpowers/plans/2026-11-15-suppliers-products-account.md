# Suppliers, Products & Account (Firestore) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Firestore CRUD for suppliers and products (`raw`|`finished`) under `enterprises/{enterpriseId}`, migrate claims to English `enterpriseId` + roles `admin|gestor|operador`, add Account (profile + password), and strip legacy Empresa/Filiais/Usuários/Auditoria from nav and routes.

**Architecture:** Extend Firebase foundation: rename claims/rules; add thin `src/api/firestore/*` helpers scoped by `enterpriseId` from AuthContext; Minimals-style page/view forms (card sections); Account tabs like Minimals account. Keep legacy page files on disk but unrouted.

**Tech Stack:** React 18, Vite 5, MUI 5, Firebase JS 13, Firestore, i18next pt|en|es, Zod + RHF, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-suppliers-products-account-design.md`

## Global Constraints

- Firestore paths/fields and claim keys in **English** (`enterprises`, `suppliers`, `products`, `enterpriseId`).
- Roles only: `admin` | `gestor` | `operador` (no `gerente`/`vendedor`).
- UI strings via i18n `pt` (default), `en`, `es` — no hardcoded user-facing copy in new UI.
- Prefer `src/sections/inventory/product` (not demo `src/sections/product` shop).
- Do not delete Empresa/Sucursal/Usuarios/Auditoria source files; remove from nav/routes only.
- Soft-delete via `active: false` (and `updatedAt`).
- Never invent role when claim missing; never commit service account JSON.
- Prefer `yarn`; gate with `yarn test` and `yarn build`.
- Operador: products R/W, suppliers read-only (UI + rules).

## File map

| File | Responsibility |
|------|----------------|
| `src/auth/firebase-claims.ts` | `enterpriseId` + new roles |
| `src/auth/firebase-claims.test.ts` | Unit tests |
| `src/auth/context/firebase/auth-provider.tsx` | Expose `enterpriseId` (replace `empresaId`) |
| `src/layouts/config-nav-dashboard.tsx` | New nav + role filters |
| `src/routes/paths.ts` / `dashboard.tsx` | New routes; legacy redirects |
| `firestore.rules` | `enterprises/…` rules |
| `scripts/bootstrap-tenant-admin.mjs` / `set-firebase-claims.mjs` | English claims |
| `src/api/firestore/paths.ts` | `enterpriseCollection(enterpriseId, name)` |
| `src/api/firestore/suppliers.ts` | Supplier CRUD |
| `src/api/firestore/products.ts` | Product CRUD |
| `src/api/firestore/members.ts` | Member profile |
| `src/sections/supplier/**` | List/create/edit + form |
| `src/sections/inventory/product/**` | List/create/edit + form |
| `src/sections/account/**` | General + change password |
| `src/pages/supplier/*`, `src/pages/inventory/product/*`, `src/pages/account/*` | Thin pages |
| `src/locales/langs/{pt,en,es}/common.json` | i18n keys |

---

### Task 1: Migrate claims helpers (TDD)

**Files:**
- Modify: `src/auth/firebase-claims.ts`
- Modify: `src/auth/firebase-claims.test.ts`

**Interfaces:**
- Produces:
  - `export type TenantRole = 'admin' | 'gestor' | 'operador'`
  - `export type FirebaseTenantClaims = { enterpriseId: string; role: TenantRole }`
  - `parseFirebaseTenantClaims` reads `enterpriseId` (not `empresaId`)

- [ ] **Step 1: Rewrite tests for new claim shape**

```ts
import { describe, expect, it } from 'vitest';
import { isTenantRole, parseFirebaseTenantClaims } from './firebase-claims';

describe('isTenantRole', () => {
  it('accepts admin|gestor|operador only', () => {
    expect(isTenantRole('admin')).toBe(true);
    expect(isTenantRole('gestor')).toBe(true);
    expect(isTenantRole('operador')).toBe(true);
    expect(isTenantRole('gerente')).toBe(false);
    expect(isTenantRole('vendedor')).toBe(false);
  });
});

describe('parseFirebaseTenantClaims', () => {
  it('returns null without enterpriseId or valid role', () => {
    expect(parseFirebaseTenantClaims({ empresaId: 'x', role: 'admin' })).toBeNull();
    expect(parseFirebaseTenantClaims({ enterpriseId: 'e1', role: 'gerente' })).toBeNull();
  });

  it('parses enterpriseId + role', () => {
    expect(parseFirebaseTenantClaims({ enterpriseId: 'ent-1', role: 'operador' })).toEqual({
      enterpriseId: 'ent-1',
      role: 'operador',
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `yarn test src/auth/firebase-claims.test.ts`

- [ ] **Step 3: Implement**

```ts
export type TenantRole = 'admin' | 'gestor' | 'operador';
export const TENANT_ROLES = ['admin', 'gestor', 'operador'] as const;

export type FirebaseTenantClaims = {
  enterpriseId: string;
  role: TenantRole;
};

export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && (TENANT_ROLES as readonly string[]).includes(value);
}

export function parseFirebaseTenantClaims(
  claims: Record<string, unknown> | null | undefined
): FirebaseTenantClaims | null {
  if (!claims) return null;
  const raw = claims.enterpriseId;
  const enterpriseId =
    typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!enterpriseId || !isTenantRole(claims.role)) return null;
  return { enterpriseId, role: claims.role };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/auth/firebase-claims.ts src/auth/firebase-claims.test.ts
git commit -m "feat(auth): migrate claims to enterpriseId and gestor/operador roles"
```

---

### Task 2: Wire AuthProvider + ClaimsGuard consumers

**Files:**
- Modify: `src/auth/context/firebase/auth-provider.tsx`
- Grep/replace `empresaId` → `enterpriseId` in auth/layouts that read claims

**Interfaces:**
- Consumes: `parseFirebaseTenantClaims`
- Produces: context user `{ enterpriseId, role, claimsValid }` (drop `empresaId`)

- [ ] **Step 1: Update `buildUserState`**

```ts
const tenantClaims = parseFirebaseTenantClaims(tokenResult.claims as Record<string, unknown>);
return {
  ...user,
  ...profileData,
  accessToken,
  enterpriseId: tenantClaims?.enterpriseId ?? null,
  role: tenantClaims?.role ?? null,
  claimsValid: Boolean(tenantClaims),
};
```

Memoized user: expose `enterpriseId` (remove `empresaId`).

- [ ] **Step 2: Fix any TS references to `user.empresaId`**

Run: `rg "empresaId" src --glob '!**/node_modules/**'`

Update call sites to `enterpriseId`.

- [ ] **Step 3: Commit**

```bash
git commit -am "refactor(auth): expose enterpriseId from Firebase claims"
```

---

### Task 3: Rules + bootstrap scripts

**Files:**
- Modify: `firestore.rules`
- Modify: `scripts/bootstrap-tenant-admin.mjs`
- Modify: `scripts/set-firebase-claims.mjs`
- Modify: `scripts/README-firebase-claims.md`

- [ ] **Step 1: Replace rules**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function roleOk() {
      return request.auth.token.role in ['admin', 'gestor', 'operador'];
    }
    function sameEnterprise(enterpriseId) {
      return request.auth.token.enterpriseId == enterpriseId;
    }
    function isAdminOrGestor() {
      return request.auth.token.role in ['admin', 'gestor'];
    }

    match /enterprises/{enterpriseId} {
      allow read: if signedIn() && sameEnterprise(enterpriseId) && roleOk();
      allow write: if signedIn() && sameEnterprise(enterpriseId) && isAdminOrGestor();
    }

    match /enterprises/{enterpriseId}/products/{id} {
      allow read: if signedIn() && sameEnterprise(enterpriseId) && roleOk();
      allow write: if signedIn() && sameEnterprise(enterpriseId) && roleOk();
    }

    match /enterprises/{enterpriseId}/suppliers/{id} {
      allow read: if signedIn() && sameEnterprise(enterpriseId) && roleOk();
      allow write: if signedIn() && sameEnterprise(enterpriseId) && isAdminOrGestor();
    }

    match /enterprises/{enterpriseId}/members/{uid} {
      allow read, write: if signedIn() && sameEnterprise(enterpriseId)
        && request.auth.uid == uid && roleOk();
    }

    match /users/{userId} {
      allow read, write: if signedIn() && request.auth.uid == userId;
    }
  }
}
```

- [ ] **Step 2: Bootstrap writes `enterprises/{id}` and claims `{ enterpriseId, role }`**

CLI args: `--email` `--enterpriseId` `--enterpriseName` `--role`  
Roles allowlist: admin|gestor|operador.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules scripts/
git commit -m "feat(firebase): enterprises rules and English claims bootstrap"
```

- [ ] **Step 4: Manual (operator)** — re-run bootstrap for fresfj after deploy rules (document in report; do not commit secrets):

```bash
GOOGLE_APPLICATION_CREDENTIALS=… yarn claims:bootstrap -- \
  --email fresfj@gmail.com --enterpriseId ent-fresfj \
  --enterpriseName "Empresa Fresfj" --role admin
```

Then sign out/in.

---

### Task 4: Shell cleanup + paths + i18n nav

**Files:**
- Modify: `src/layouts/config-nav-dashboard.tsx`
- Modify: `src/routes/paths.ts`
- Modify: `src/routes/sections/dashboard.tsx`
- Modify: `src/locales/langs/{pt,en,es}/common.json`

**Nav items:** App, Suppliers, Products, Account.  
Suppliers item: `roles: ['admin','gestor']` for create path actions later; list can show for all with read-only UI in Task 7. Spec: operador can read suppliers — include Suppliers in nav for all roles; hide “New” for operador in view.

- [ ] **Step 1: Add path keys**

```ts
suppliers: {
  root: `${ROOTS.DASHBOARD}/suppliers`,
  list: `${ROOTS.DASHBOARD}/suppliers/list`,
  create: `${ROOTS.DASHBOARD}/suppliers/create`,
  edit: (id: string) => `${ROOTS.DASHBOARD}/suppliers/${id}/edit`,
},
products: {
  root: `${ROOTS.DASHBOARD}/products`,
  list: `${ROOTS.DASHBOARD}/products/list`,
  create: `${ROOTS.DASHBOARD}/products/create`,
  edit: (id: string) => `${ROOTS.DASHBOARD}/products/${id}/edit`,
},
account: {
  root: `${ROOTS.DASHBOARD}/account`,
  general: `${ROOTS.DASHBOARD}/account/general`,
  changePassword: `${ROOTS.DASHBOARD}/account/change-password`,
},
```

- [ ] **Step 2: Replace dashboard children**

Keep IndexPage. Add lazy pages for suppliers/products/account (stubs ok until later tasks — or wire after Task 7/8/9). Prefer adding routes in the task that creates pages; this task: remove legacy routes + add Navigate redirects + update nav pointing to new paths.

Legacy: `sistema/*`, `usuarios/*`, `auditoria/*`, old `productos/*` → redirect to `paths.dashboard.root`.

- [ ] **Step 3: i18n keys** `nav.suppliers`, `nav.products`, `nav.account`, plus form keys stubs.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(shell): nav and routes for suppliers products account"
```

---

### Task 5: Firestore path helper + suppliers API

**Files:**
- Create: `src/api/firestore/paths.ts`
- Create: `src/api/firestore/suppliers.ts`
- Create: `src/types/supplier.ts` (optional inline types in api file if smaller)

**Interfaces:**

```ts
// paths.ts
export function enterpriseDoc(enterpriseId: string);
export function enterpriseCollection(enterpriseId: string, name: 'suppliers' | 'products' | 'members');

// suppliers.ts
export type Supplier = { id: string; name: string; document: string; phone?: string; email?: string; active: boolean; createdAt: string; updatedAt: string };
export async function listSuppliers(enterpriseId: string): Promise<Supplier[]>;
export async function getSupplier(enterpriseId: string, id: string): Promise<Supplier | null>;
export async function createSupplier(enterpriseId: string, data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>;
export async function updateSupplier(enterpriseId: string, id: string, data: Partial<Supplier>): Promise<void>;
export async function deactivateSupplier(enterpriseId: string, id: string): Promise<void>;
```

Use `collection`, `doc`, `getDocs`, `getDoc`, `addDoc`, `updateDoc`, `query`, `where('active','==',true)` from `firebase/firestore` + `FIRESTORE` from `src/lib/firebase`.

- [ ] **Step 1: Implement paths + suppliers**
- [ ] **Step 2: Commit**

```bash
git add src/api/firestore/
git commit -m "feat(api): Firestore suppliers CRUD under enterprises"
```

---

### Task 6: Products API

**Files:**
- Create: `src/api/firestore/products.ts`

**Interfaces:**

```ts
export type ProductType = 'raw' | 'finished';
export type Product = {
  id: string;
  name: string;
  sku: string;
  type: ProductType;
  unit: string;
  costPrice?: number;
  salePrice?: number;
  variant?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
// listProducts, getProduct, createProduct, updateProduct, deactivateProduct
```

- [ ] **Step 1: Implement**
- [ ] **Step 2: Commit**

```bash
git add src/api/firestore/products.ts
git commit -m "feat(api): Firestore products CRUD under enterprises"
```

---

### Task 7: Suppliers UI (list/create/edit)

**Files:**
- Create: `src/sections/supplier/supplier-form.tsx`
- Create: `src/sections/supplier/view/{supplier-list-view,supplier-create-view,supplier-edit-view,index}.ts(x)`
- Create: `src/pages/supplier/{list,create,edit}.tsx`
- Wire routes in `dashboard.tsx`
- i18n keys under `suppliers.*`

**UX:** Card sections Details (name, document) + Contact (phone, email) + active switch. List with New button; hide New/Edit for `operador` (`useAuthContext().user?.role`).

Use `enterpriseId` from auth; if missing, rely on ClaimsGuard.

- [ ] **Step 1: Build form + views + thin pages**
- [ ] **Step 2: Manual smoke create/list**
- [ ] **Step 3: Commit**

```bash
git commit -am "feat(supplier): Firestore supplier list and forms"
```

---

### Task 8: Products UI (list/create/edit)

**Files:**
- Create: `src/sections/inventory/product/product-form.tsx`
- Create: `src/sections/inventory/product/view/*`
- Create: `src/pages/inventory/product/{list,create,edit}.tsx`
- i18n `products.*` (type labels Insumo/Acabado)

**UX:** Cards Details (name, sku, type select) + Properties (unit, prices, variant shown if type===finished). Zod: require type; variant optional.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Commit**

```bash
git commit -am "feat(product): Firestore product CRUD with raw/finished type"
```

---

### Task 9: Members API + Account UI

**Files:**
- Create: `src/api/firestore/members.ts`
- Create: `src/sections/account/account-general-form.tsx`
- Create: `src/sections/account/account-change-password-form.tsx`
- Create: `src/sections/account/view/account-view.tsx` (tabs General | Security)
- Create: `src/pages/account/{index or general,change-password}.tsx`
- Prefer single Account page with tabs + routes that sync tab (Minimals style)

**Password:** `EmailAuthProvider.credential` + `reauthenticateWithCredential` + `updatePassword` from `firebase/auth`; toast i18n errors.

- [ ] **Step 1: Implement members get/set**
- [ ] **Step 2: Implement Account UI**
- [ ] **Step 3: Commit**

```bash
git commit -am "feat(account): profile and change-password for tenant members"
```

---

### Task 10: Verification gate

- [ ] **Step 1:** `yarn test`
- [ ] **Step 2:** eslint on touched files
- [ ] **Step 3:** `yarn build`
- [ ] **Step 4:** Confirm nav + redirects + operador supplier write blocked
- [ ] **Step 5:** Fix/commit only if needed: `fix: …`

---

## Self-review (plan vs spec)

| Spec item | Task |
|-----------|------|
| English paths + enterpriseId | 1–3 |
| Roles admin/gestor/operador | 1–3, 7 |
| Shell cleanup | 4 |
| Suppliers CRUD | 5, 7 |
| Products raw/finished | 6, 8 |
| Account profile + password | 9 |
| Operador supplier write deny | 3, 7 |
| i18n | 4, 7–9 |
| No FormTable | all |

No TBD placeholders in task steps.

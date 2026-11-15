# Design: Suppliers, Products (raw|finished), Account — Firestore tenant

**Date:** 2026-11-15  
**Status:** Approved in brainstorming (pending user review of this file)  
**Depends on:** `docs/superpowers/specs/2026-11-14-firebase-tenant-offline-rbac-design.md` (foundation)  
**Product context:** ERP SaaS varejo & beneficiamento (`docs/deepseek_markdown_20261115_78aa86.md`)  
**UI refs:** Minimals product create (card sections), account general + change-password ([minimals.cc account](https://minimals.cc/dashboard/user/account/change-password))

---

## 1. Goal

Ship the first **business CRUD** on Firestore under the tenant, with English collection/field names, Minimals-style forms, i18n (`pt` default, `en`, `es`), and in-company **Account** (profile + password). Strip legacy ERP shell items that are not part of this product.

**Success criteria**

- Nav: Overview (App) + Suppliers + Products + Account only (no Empresa / Filiais / Usuários list / Auditoria).
- Legacy routes redirect to `/dashboard`.
- CRUD suppliers + products under `enterprises/{enterpriseId}/…`.
- Product `type`: `raw` | `finished` (UI: Insumo | Acabado); optional `variant` when finished.
- Roles: `admin` | `gestor` | `operador` with claim `enterpriseId`.
- Account: General + Security (change password) per Minimals account UX.
- Firestore keys and claim names in **English**; UI strings via i18n.

---

## 2. Decisions (locked)

| Topic | Choice |
|-------|--------|
| Storage | Firestore under tenant (not HTTP FormTable) |
| Field/collection language | English (`enterprise`, `suppliers`, `products`, …) |
| MVP fields | Lean A (see §4) |
| Legacy Empresa/Sucursal/Usuarios/Auditoria | Remove from nav **and** routes; keep files on disk |
| Approach | Dedicated Firestore hooks + v6-2 thin page/view; no FormTable adapter |
| Roles | `admin` \| `gestor` \| `operador` (replaces `gerente`/`vendedor`) |
| Claim key | `enterpriseId` (migrate from `empresaId`) |

---

## 3. Architecture

```
enterprises/{enterpriseId}
enterprises/{enterpriseId}/suppliers/{supplierId}
enterprises/{enterpriseId}/products/{productId}
enterprises/{enterpriseId}/members/{uid}   // profile prefs for Account General
```

**Auth claims (Custom Claims):**

```ts
{ enterpriseId: string; role: 'admin' | 'gestor' | 'operador' }
```

**Migration from foundation slice**

- Update `parseFirebaseTenantClaims`, ClaimsGuard copy keys if needed, Firestore rules, bootstrap scripts.
- Re-seed `fresfj@gmail.com` with `enterpriseId` + `role: 'admin'`.
- Create `enterprises/{id}` doc (English fields: `name`, `active`, …). Optional: leave old `empresas/…` unused.

**Frontend layers**

| Piece | Role |
|-------|------|
| `src/api/firestore/suppliers.ts` | list / get / create / update / soft-delete |
| `src/api/firestore/products.ts` | same |
| `src/api/firestore/members.ts` | read/update member profile |
| `src/sections/supplier/view/*` | list / create / edit views |
| `src/sections/product/view/*` (tenant product, not shop demo) | list / create / edit — or `src/sections/inventory/product/view` to avoid clash with Minimals shop `sections/product` |
| `src/sections/account/view/*` | general + security |
| `src/pages/...` | Helmet-only thin pages |
| Nav + paths + dashboard routes | shell |

**Path naming note:** Prefer `src/sections/inventory/product` and `src/sections/supplier` so we do not collide with existing Minimals demo `src/sections/product` (shop).

---

## 4. Data model (MVP)

### Supplier

```ts
{
  name: string;
  document: string;      // CNPJ/CPF
  phone?: string;
  email?: string;
  active: boolean;
  createdAt: string;     // ISO
  updatedAt: string;
}
```

### Product

```ts
{
  name: string;
  sku: string;
  type: 'raw' | 'finished';  // UI: Insumo | Acabado
  unit: string;              // e.g. kg, L, un
  costPrice?: number;
  salePrice?: number;
  variant?: string;          // only meaningful when type === 'finished'
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Member profile (Account General)

```ts
{
  displayName?: string;
  phone?: string;
  photoURL?: string;
  updatedAt: string;
}
```

Email comes from Firebase Auth (read-only in UI). Password change uses Firebase Auth (`reauthenticateWithCredential` + `updatePassword`).

---

## 5. RBAC (this slice)

| Role | Suppliers | Products | Account (own) | Cash / PDV |
|------|-----------|----------|---------------|------------|
| `admin` | R/W | R/W | yes | later |
| `gestor` | R/W | R/W | yes | later (gestor) |
| `operador` | R | R/W | yes | no |

Nav: hide Suppliers create/edit actions for operador if list is read-only; Products full CRUD for operador.

---

## 6. Shell cleanup

**Remove from `config-nav-dashboard` and `dashboard.tsx` routes:**

- `/dashboard/sistema/empresa`
- `/dashboard/sistema/sucursal`
- `/dashboard/usuarios/*` (list/create/edit)
- `/dashboard/auditoria/*`
- Optional: generic sistema demo routes (`simple`, `doble`, …) if unused

**Add:**

- `/dashboard/suppliers` (list, create, `:id/edit`)
- `/dashboard/products` (list, create, `:id/edit`) — Firestore products, not old HTTP `productos`
- `/dashboard/account` (general), `/dashboard/account/change-password` (or tabs on one account page)

Legacy URLs → `<Navigate to={paths.dashboard.root} replace />`.

Do **not** delete page/section files for Empresa/Sucursal/Usuarios/Auditoria in this slice.

---

## 7. UI / UX

- Thin pages + views (v6-2 pattern already used).
- Create/Edit product & supplier: **Card sections** (Details / Properties) like Minimals product create — not one flat wall of fields. No rich-text editor in MVP.
- Account: breadcrumbs + tabs (General | Security) matching Minimals account; Security = change password form.
- All visible strings: i18n `pt` | `en` | `es`.
- Feedback: sonner toast.

---

## 8. Security

**Rules (target shape):**

```
match /enterprises/{enterpriseId}/{document=**} {
  allow read: if signedIn() && sameEnterprise(enterpriseId) && roleOk();
  allow write: if signedIn() && sameEnterprise(enterpriseId) && roleOk();
}
// Refine products vs suppliers write for operador in rules or accept client+rules:
match /enterprises/{enterpriseId}/products/{id} {
  allow write: if … role in ['admin','gestor','operador'];
}
match /enterprises/{enterpriseId}/suppliers/{id} {
  allow write: if … role in ['admin','gestor'];
  allow read: if … roleOk();
}
```

Update `firestore.rules` and bootstrap scripts accordingly. Never commit service account JSON.

---

## 9. Out of scope

- Beneficiamento, PDV, caixa UI, DRE, NFC-e
- Image upload / rich description editor
- Migrating old HTTP `inv_articulo` data
- Cloud Functions for claim UI
- Deleting unused legacy page files
- `super_admin` SaaS portal

---

## 10. Acceptance

1. Menu shows only App, Suppliers, Products, Account (i18n).
2. Old sistema/usuarios/auditoria URLs redirect to dashboard.
3. Admin can CRUD suppliers and products; data under `enterprises/{enterpriseId}/…`.
4. Product form requires type raw|finished; variant optional for finished.
5. Operador can CRUD products; cannot write suppliers (rules + UI).
6. Account General saves member profile; Security changes password.
7. Claims use `enterpriseId` + new roles; fresfj re-bootstrapped as admin.
8. `yarn test` + `yarn build` pass.

---

## 11. File map (expected)

| Path | Action |
|------|--------|
| `src/auth/firebase-claims.ts` | `enterpriseId`, roles `admin\|gestor\|operador` |
| `firestore.rules` | `enterprises/…` + role splits |
| `scripts/bootstrap-tenant-admin.mjs` | English claim + enterprise doc |
| `src/api/firestore/*` | suppliers, products, members |
| `src/sections/supplier/**` | views + form |
| `src/sections/inventory/product/**` | views + form (avoid demo `sections/product`) |
| `src/sections/account/**` | general + change-password |
| `src/pages/...` | thin pages |
| `src/layouts/config-nav-dashboard.tsx` | new nav |
| `src/routes/paths.ts`, `dashboard.tsx` | routes + redirects |
| `src/locales/langs/{pt,en,es}/common.json` | keys |

---

## 12. Relation to foundation spec

Foundation delivered offline + ClaimsGuard + banner. This slice **renames** claim/path conventions to English and **replaces** role enum. Implementation must update foundation code in the same plan (not leave dual `empresaId`/`gerente` forever).

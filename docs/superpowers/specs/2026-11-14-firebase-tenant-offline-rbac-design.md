# Design: Fundação Firebase multi-tenant + offline + RBAC

**Date:** 2026-11-14  
**Status:** Approved — implementation plan at `docs/superpowers/plans/2026-11-14-firebase-tenant-offline-rbac.md`  
**Product context:** ERP SaaS varejo & beneficiamento / PDV offline (see `docs/superpowers/plans/deepseek_markdown_20261115_78aa86.md`)  
**This slice only:** foundation. Not PDV UI, not beneficiamento, not DRE, not Cloud Functions for claims.  
**Relation to slim-security spec:** That doc targeted JWT-only shell hardening. Product direction for this ERP is **Firebase Auth + Firestore** (workspace rule). Existing HTTP/`FormTable` remains; new offline domain data goes to Firestore.

---

## 1. Goal

Give the Minimals ERP shell a **safe, offline-capable Firestore base** so later modules (PDV, beneficiamento, financeiro) can write under `empresas/{empresaId}/...` with Auth claims, role-gated UI, and i18n — without rewriting existing `FormTable` / HTTP API screens.

**Success criteria**

- Firestore persistence enabled at boot; multi-tab / unsupported browser handled without crashing.
- Dashboard shows an i18n offline banner when cache/offline is active.
- Firebase Auth session exposes `empresaId` + `role` from **Custom Claims**.
- Firestore rules enforce tenant isolation by claim.
- Nav / routes can filter by `admin` | `gerente` | `vendedor`.
- Existing `src/api` + `FormTable` screens keep working unchanged.
- All new UI strings in `pt` (default), `en`, `es`.

---

## 2. Decisions (locked)

| Topic | Choice |
|-------|--------|
| First product slice | Foundation (tenant + offline + RBAC) |
| Tenant identity | Custom Claims: `empresaId` + `role` |
| Offline | Global `enableIndexedDbPersistence` + app-wide offline banner |
| Coexistence | Parallel Firebase for **new** modules; keep current HTTP/`FormTable` |
| Roles (MVP) | `admin` \| `gerente` \| `vendedor` (no `super_admin` yet) |
| Approach | Bootstrap mínimo: seed claims via Admin SDK script; no Cloud Functions in this slice |

---

## 3. Architecture

```
React (Vite) Minimals
├── Firebase Auth          → session + Custom Claims (empresaId, role)
├── Firestore              → empresas/{empresaId}/… (new domain data)
├── IndexedDB persistence  → offline read/write + auto sync
├── HTTP API (existing)    → FormTable cadastros (untouched this slice)
└── i18next                → pt | en | es (labels, banner, errors)
```

**Canonical path for new data**

```text
empresas/{empresaId}/{collection}/{docId}
```

Example stub used only to prove read/offline/rules:

```text
empresas/{empresaId}   // { nome, ativo }
```

**Out of scope (later slices)**

- PDV cart, payments, NFC-e
- Beneficiamento / lotes / rateio
- Caixa, sangria, DRE aggregations
- Cloud Functions for discount/sangria validation and claim provisioning UI
- Migrating Empresa/Produto/Usuario FormTable to Firestore
- SaaS `super_admin` portal

---

## 4. Frontend components

| Piece | Responsibility |
|-------|----------------|
| `src/lib/firebase.ts` | Init app; call `enableIndexedDbPersistence`; export `FIRESTORE` / `AUTH` |
| Firebase `AuthProvider` | After auth, `getIdTokenResult()`; expose `empresaId`, `role` on context user |
| `useOfflineStatus` | Derive offline/fromCache; drive banner |
| Offline banner | Dashboard layout; i18n keys only |
| `RoleGuard` | Route-level allow-list by role |
| Nav filter | Optional `roles` on nav items in `config-nav-dashboard` |
| Seed script | `scripts/set-firebase-claims.mjs` (Admin SDK; not shipped in client) |

### 4.1 Boot sequence

1. Initialize Firebase when config env vars exist.
2. Enable IndexedDB persistence; on `failed-precondition` or `unimplemented`, log and continue.
3. `onAuthStateChanged` → build user → `getIdTokenResult()` → read claims.
4. Missing/invalid claims: block Firestore dashboard entry; i18n message; allow sign-out.
5. Valid claims: context ready; optional smoke `onSnapshot` on `empresas/{empresaId}`.

### 4.2 Offline UX

- Prefer snapshot `metadata.fromCache` plus `window` online/offline events.
- Banner states: offline mode; sync pending (optional if distinguishable).
- Writes from future PDV go to local cache first; sync when network returns (Firestore built-in). No custom sync queue in this slice.

### 4.3 RBAC UX

- Claims roles only: `admin`, `gerente`, `vendedor`.
- `RoleGuard` wraps sensitive routes (financial routes when they exist; stub or placeholder filter now).
- Vendedor must not see financial/report nav entries once those modules appear; foundation only wires the filter mechanism.

---

## 5. Data flow

```text
Login Firebase
  → ID token + Custom Claims { empresaId, role }
  → AuthContext
  → RoleGuard / nav filter
  → Firestore queries scoped under empresas/{empresaId}
       ↕ IndexedDB (offline)
  → Server sync when online
```

**Claim provisioning (dev/MVP)**

- Operator runs Admin SDK script with `uid`, `empresaId`, `role`.
- User must refresh token (`getIdToken(true)`) after claims change; document this in script README comment.
- Production callable Function deferred.

---

## 6. Security

### 6.1 Firestore rules (minimum)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /empresas/{empresaId}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.empresaId == empresaId
        && request.auth.token.role in ['admin', 'gerente', 'vendedor'];
    }
  }
}
```

### 6.2 Explicit non-goals for rules

- Rules do **not** replace backend validation for discount limits, sangria, or cash close.
- Per-collection role splits (e.g. vendedor read-only on financeiro) land in later module specs.
- Client must never trust role alone for money movement; Cloud Functions later.

### 6.3 Secrets

- Only `VITE_FIREBASE_*` in `.env`.
- Admin SDK credentials for the seed script stay local / CI secret — never in the Vite bundle.

---

## 7. i18n

- Default language: **pt**.
- Supported for this work: `pt`, `en`, `es` under `src/locales/langs/{pt,en,es}/`.
- New keys (illustrative; exact keys set in implementation plan):

  - `common.offlineMode`
  - `common.syncPending`
  - `common.missingClaims`
  - `common.permissionDenied`

- Nav: any new items go through `navbar.json` in all three locales.
- No hardcoded user-visible strings in new foundation UI.

---

## 8. Error handling

| Case | Behavior |
|------|----------|
| Persistence `failed-precondition` | Log; continue (another tab owns persistence) |
| Persistence `unimplemented` | Log; online-only for that browser |
| Missing / invalid claims | Block Firestore entry; i18n message; sign-out available |
| `permission-denied` | i18n toast; do not leak paths/rules |
| Network down | Offline banner; local cache serves reads/writes |

---

## 9. Performance notes (Vercel React best practices)

Apply where this slice touches code:

- **bundle:** Prefer direct imports (`firebase/firestore`, `firebase/auth`); avoid new barrel re-exports that pull unused Firebase surfaces.
- **bundle-conditional:** Persistence enable runs once at module init only when Firebase config is present (already gated by `hasFirebaseConfig`).
- **rerender:** Offline banner should subscribe to a narrow boolean (`isOffline`), not the full auth user object.
- **rerender-derived-state:** Derive `empresaId` / `role` once when building auth user; consumers read primitives.
- **async-cheap-condition:** Skip Firestore profile/claim work when `!user`.
- Later PDV: heavy screens via route `lazy()` (already project pattern); keep foundation hooks tiny.

Do not add `useMemo`/`useCallback` by default beyond existing AuthProvider patterns unless lint/compiler guidance requires it.

---

## 10. Alignment with existing ERP UI patterns (for later slices)

When building forms after this foundation:

- Prefer `DashboardContent` + `CustomBreadcrumbs` + `Card`/`Grid`.
- Zod schema at page top; toast (sonner) feedback in PT by default via i18n.
- Tabular CRUD: `FormTable` / `useFormTable` when still on HTTP API.
- Firestore-native modules may use hook-form + Zod like `producto-form` if FormTable config is API-bound — decide per module plan.
- Routes in `dashboard.tsx` + `paths.ts` + `config-nav-dashboard.tsx`.
- Do not revive Auth0/Amplify/Supabase; keep `CONFIG.auth.method = 'firebase'`.

---

## 11. Testing / acceptance

1. User with valid claims signs in → context shows `empresaId` and `role`.
2. Chrome DevTools Offline → banner visible; stub empresa doc still readable from cache after a prior online fetch.
3. User with wrong `empresaId` claim → Firestore `permission-denied`.
4. User without claims → blocked with i18n message.
5. ESLint/TS clean on touched files.
6. Seed script documented; not required in CI for this slice.

---

## 12. File map (expected implementation)

| Path | Action |
|------|--------|
| `src/lib/firebase.ts` | Enable persistence |
| `src/auth/context/firebase/*` | Claims on user state |
| `src/auth/guard/role-guard.tsx` (or extend existing) | Role gate |
| `src/hooks/use-offline-status.ts` | Offline signal |
| `src/layouts/dashboard/*` | Banner mount |
| `src/layouts/config-nav-dashboard.tsx` | Optional `roles` filter |
| `src/locales/langs/{pt,en,es}/common.json` | Offline / claims strings |
| `firestore.rules` (repo root or `firebase/`) | Tenant rules |
| `scripts/set-firebase-claims.mjs` | Dev claim seed |

Exact filenames may adjust in the implementation plan; responsibilities must not.

---

## 13. Roadmap after this slice

1. Cadastros Firebase or bridge (Fornecedor / Produto tipo INSUMO\|ACABADO) + i18n forms  
2. Beneficiamento + lotes  
3. PDV offline (inherits persistence)  
4. Financeiro / caixa + Cloud Functions for sensitive ops  
5. Optional migration NestJS + PostgreSQL if compliance/reporting outgrows Firestore  

---

## 14. Non-negotiables

- Multi-tenant path always includes `empresaId` matching the claim.
- i18n for every new label/menu/form string in this and following slices.
- No secrets in git.
- No inventing client-side `role: 'admin'` when claim is missing (same spirit as slim-security work).

# Design: Firestore Rules by MemberPermissionKey (Slice F)

**Date:** 2026-11-16  
**Status:** Draft (awaiting user review of this file)  
**Stack:** Cloud Firestore Security Rules v2 + existing `members/{uid}.permissions`

## 1. Context

Slice A gated **routes** with `PermissionGuard` + `getEffectivePermissions`. Nav already hides modules by the same keys. **Firestore rules** still allow any tenant `roleOk()` user full read/write on domain collections — an operador can bypass the UI with the SDK/console.

User choices:

| Topic | Choice |
|-------|--------|
| Permission source | **C** — admin/gestor via claim `role`; operador via `get(members/{uid})` |
| Collection map | **A** — mirror front `PermissionGuard` 1:1 |
| Implementation | Approach **1** — helpers in `firestore.rules` |

## 2. Goals

1. Enforce `MemberPermissionKey` on tenant collection read/write for operadores.
2. Keep admin / gestor / platformAdmin full access (same as front).
3. Preserve members self-update and enterprise platform rules.
4. Default operator keys when `permissions` array missing/empty (match TS `DEFAULT_OPERATOR_PERMISSIONS`).

## 3. Non-goals

- Storage rules by permission
- Custom claims mirroring of permissions
- Banking / ledger UI (Slice G)
- Ops (`setpolicy`, package-lock)
- Changing `PermissionGuard` or nav (already correct)

## 4. Rule helpers

```
signedIn, roleOk, sameEnterprise, isAdminOrGestor, isPlatformAdmin  // existing

memberPath(enterpriseId) =
  /databases/$(database)/documents/enterprises/$(enterpriseId)/members/$(request.auth.uid)

memberData(enterpriseId) = get(memberPath(enterpriseId)).data

hasPerm(enterpriseId, key):
  signedIn && (
    isPlatformAdmin()
    || (sameEnterprise(enterpriseId) && isAdminOrGestor())
    || (sameEnterprise(enterpriseId) && roleOk() && (
         (memberData.permissions is list && key in memberData.permissions)
         || (
              (!(memberData.keys().hasAll(['permissions']))
               || memberData.permissions == null
               || memberData.permissions.size() == 0)
              && key in ['pos','customers','cash_close','batches_read']
            )
       ))
  )

hasAnyPerm(enterpriseId, keys): any hasPerm for keys (or inline OR)
```

**Note:** `get()` fails closed if member doc missing → operador without member doc denied (except admin/gestor/platform). Acceptable; invite creates member doc.

## 5. Collection map

| Path | read | write |
|------|------|--------|
| `products/{id}` | `products` | `products` |
| `suppliers/{id}` | `suppliers` | `suppliers` |
| `customers/{id}` | `customers` | `customers` |
| `sales/{id}` | `pos` | `pos` |
| `cashSessions/{id}` | `cash_close` | `cash_close` |
| `payables/{id}` | `dre` | `dre` |
| `receivables/{id}` | `dre` | `dre` |
| `processingOrders/{id}` | `processing` | `processing` |
| `batches/{id}` | `batches_read` | `batches_write` |
| `stockMovements/{id}` | `batches_read` | `batches_write` OR `pos` |
| `members/{uid}` | tenant `roleOk` (unchanged) | admin/gestor/self/platform (unchanged) |
| `enterprises/{id}` | unchanged | unchanged |
| `users/{userId}` | unchanged | unchanged |

Pattern per collection:

```
allow read: if hasPerm(enterpriseId, '…');
allow write: if hasPerm(enterpriseId, '…');
```

(or `hasPerm(...) || hasPerm(...)` for stockMovements write)

## 6. Delivery

1. Rewrite helpers + matches in `firestore.rules`
2. `firebase deploy --only firestore:rules` (project `checkout-shop-b5bb3`)
3. Update handoff; optional short note in AGENTS.md

No frontend changes required unless toast copy for `permission-denied` already covered by `getFirebaseErrorMessage`.

## 7. Testing / acceptance

1. Operador **without** `products` → client write/read products → `permission-denied`
2. Operador **with** `pos` → sales read/write OK; DRE/payables denied
3. Operador with `batches_read` only → batches list OK; batch create denied
4. Admin/gestor → all collections OK
5. platformAdmin → cross-tenant read still OK where rules allow

## 8. Risks

- Extra `get(members)` per request for operadores (cost + latency) — accepted for Slice F.
- Stale offline cache may surface permission-denied after perm revoke until online — expected.
- PDV atomic batch updating `batches` + `stockMovements` + `sales` + possibly `customers` requires **all** of `pos` (and customer debt needs `customers` if updating customer in same batch — verify sales create path).

### 8.1 PDV batch permission note

`createSale` may update `customers` (`currentDebt`) and `batches` / `stockMovements`. With map A:

- `sales` → `pos`
- `stockMovements` write → `pos` OR `batches_write` (OK for POS)
- `batches` write → **`batches_write` only** — **problem** for operador with only `pos`

**Resolution (in scope):** allow `batches` **write** if `hasPerm('batches_write') || hasPerm('pos')` so FIFO deduction during sale works for POS operators without granting batch **entry** UI (still guarded by `batches_write` on create route). Document this exception explicitly.

Similarly AR mark-paid updates `receivables` + `customers` + `cashSessions` → user needs `dre` + effectively those writes; cash settle from receivables UI is under `dre` guard — require `hasPerm('dre')` for receivables and also allow customer debt update when… actually mark paid is one batch: receivable (`dre`), customer (`customers`), cashSession (`cash_close`). That would require **three** keys for one action — too strict vs UI (only `dre`).

**Resolution:** for `customers` write, allow `hasPerm('customers') || hasPerm('dre') || hasPerm('pos')` (debt sync from PDV + AR).  
For `cashSessions` write, allow `hasPerm('cash_close') || hasPerm('dre')` (settlement from payables/receivables).

These OR-exceptions are documented and intentional for atomic flows.

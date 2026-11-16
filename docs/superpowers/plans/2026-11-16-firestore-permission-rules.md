# Firestore Permission Rules (Slice F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce `MemberPermissionKey` on tenant Firestore collections so operadores cannot bypass UI PermissionGuard via the SDK.

**Architecture:** Add `hasPerm(enterpriseId, key)` helpers in `firestore.rules` that grant admin/gestor/platformAdmin full access and check `members/{uid}.permissions` (with `DEFAULT_OPERATOR_PERMISSIONS` fallback) for operadores. Map each collection 1:1 to keys, plus documented OR-exceptions for atomic PDV/AR/AP batches (§8.1 of the design spec).

**Tech Stack:** Cloud Firestore Security Rules v2, Firebase CLI deploy, existing `src/api/firestore/members.ts` keys.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-16-firestore-permission-rules-design.md`
- Default operator keys (must match TS): `pos`, `customers`, `cash_close`, `batches_read`
- `members` / `enterprises` / `users` rules unchanged in semantics
- Project: `checkout-shop-b5bb3`
- No frontend feature work in this slice

---

### Task 1: Helpers + collection map in firestore.rules

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: `hasPerm(enterpriseId, key)`, `hasDefaultOperatorPerm(key)`, `memberDoc(enterpriseId)`, `memberHasExplicitPerm(enterpriseId, key)`

- [ ] **Step 1: Replace domain collection rules with hasPerm map**

Replace the entire contents of `firestore.rules` with:

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
    function isPlatformAdmin() {
      return request.auth.token.platformAdmin == true;
    }

    function memberDoc(enterpriseId) {
      return get(/databases/$(database)/documents/enterprises/$(enterpriseId)/members/$(request.auth.uid));
    }

    function hasDefaultOperatorPerm(key) {
      return key in ['pos', 'customers', 'cash_close', 'batches_read'];
    }

    function memberHasExplicitPerm(enterpriseId, key) {
      return memberDoc(enterpriseId).data.keys().hasAny(['permissions'])
        && memberDoc(enterpriseId).data.permissions is list
        && key in memberDoc(enterpriseId).data.permissions;
    }

    function memberUsesDefaultPerms(enterpriseId) {
      return !memberDoc(enterpriseId).data.keys().hasAny(['permissions'])
        || memberDoc(enterpriseId).data.permissions == null
        || !(memberDoc(enterpriseId).data.permissions is list)
        || memberDoc(enterpriseId).data.permissions.size() == 0;
    }

    function hasPerm(enterpriseId, key) {
      return signedIn() && (
        isPlatformAdmin()
        || (sameEnterprise(enterpriseId) && isAdminOrGestor())
        || (
          sameEnterprise(enterpriseId)
          && roleOk()
          && (
            memberHasExplicitPerm(enterpriseId, key)
            || (memberUsesDefaultPerms(enterpriseId) && hasDefaultOperatorPerm(key))
          )
        )
      );
    }

    match /enterprises/{enterpriseId} {
      allow read: if signedIn() && (
        isPlatformAdmin() || (sameEnterprise(enterpriseId) && roleOk())
      );
      allow create, update, delete: if signedIn() && isPlatformAdmin();
      allow write: if signedIn() && sameEnterprise(enterpriseId) && isAdminOrGestor();
    }

    match /enterprises/{enterpriseId}/products/{id} {
      allow read, write: if hasPerm(enterpriseId, 'products');
    }

    match /enterprises/{enterpriseId}/suppliers/{id} {
      allow read, write: if hasPerm(enterpriseId, 'suppliers');
    }

    match /enterprises/{enterpriseId}/customers/{id} {
      allow read: if hasPerm(enterpriseId, 'customers');
      allow write: if hasPerm(enterpriseId, 'customers')
        || hasPerm(enterpriseId, 'pos')
        || hasPerm(enterpriseId, 'dre');
    }

    match /enterprises/{enterpriseId}/sales/{id} {
      allow read, write: if hasPerm(enterpriseId, 'pos');
    }

    match /enterprises/{enterpriseId}/cashSessions/{id} {
      allow read: if hasPerm(enterpriseId, 'cash_close')
        || hasPerm(enterpriseId, 'dre');
      allow write: if hasPerm(enterpriseId, 'cash_close')
        || hasPerm(enterpriseId, 'dre');
    }

    match /enterprises/{enterpriseId}/payables/{id} {
      allow read, write: if hasPerm(enterpriseId, 'dre');
    }

    match /enterprises/{enterpriseId}/receivables/{id} {
      allow read, write: if hasPerm(enterpriseId, 'dre');
    }

    match /enterprises/{enterpriseId}/processingOrders/{id} {
      allow read, write: if hasPerm(enterpriseId, 'processing');
    }

    match /enterprises/{enterpriseId}/batches/{id} {
      allow read: if hasPerm(enterpriseId, 'batches_read');
      allow write: if hasPerm(enterpriseId, 'batches_write')
        || hasPerm(enterpriseId, 'pos');
    }

    match /enterprises/{enterpriseId}/stockMovements/{id} {
      allow read: if hasPerm(enterpriseId, 'batches_read');
      allow write: if hasPerm(enterpriseId, 'batches_write')
        || hasPerm(enterpriseId, 'pos');
    }

    match /enterprises/{enterpriseId}/members/{uid} {
      allow read: if signedIn() && (
        isPlatformAdmin() || (sameEnterprise(enterpriseId) && roleOk())
      );
      allow write: if signedIn() && (
        isPlatformAdmin()
        || (sameEnterprise(enterpriseId) && (isAdminOrGestor() || request.auth.uid == uid))
      );
    }

    match /users/{userId} {
      allow read, write: if signedIn() && request.auth.uid == userId;
    }
  }
}
```

- [ ] **Step 2: Commit rules**

```bash
git add firestore.rules
git commit -m "feat(security): enforce MemberPermissionKey in Firestore rules"
```

---

### Task 2: Deploy rules

**Files:** none (ops)

- [ ] **Step 1: Deploy**

```bash
firebase deploy --only firestore:rules --project checkout-shop-b5bb3
```

Expected: `Deploy complete!` for Firestore Rules.

- [ ] **Step 2: Smoke (manual checklist — document in handoff)**

1. Operador without `products` → products write → permission-denied
2. Operador with `pos` → sales OK; payables denied
3. Admin → all OK

---

### Task 3: Handoff + AGENTS note

**Files:**
- Modify: `docs/agents/antigravity-erp-handoff.md`
- Modify: `AGENTS.md` (one line under segurança if missing)

- [ ] **Step 1: Mark Slice F done; note G / ops still pending; note smoke E still manual**
- [ ] **Step 2: Commit**

```bash
git add docs/agents/antigravity-erp-handoff.md AGENTS.md docs/superpowers/plans/2026-11-16-firestore-permission-rules.md
git commit -m "docs: handoff Slice F Firestore permission rules"
```

---

## Self-review

1. Spec §4 helpers → Task 1  
2. Spec §5 map + §8.1 ORs → Task 1 (customers/cashSessions/batches/stockMovements)  
3. Spec §6 deploy → Task 2  
4. Spec §6 handoff → Task 3  
5. No placeholders in plan

# Team PermissionGuard + Invite Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block unauthorized dashboard URLs with the same permission model as the nav, harden team invite autocomplete, and sync collaborator `displayName` to Auth + `members/{uid}`.

**Architecture:** Extract a pure `resolvePermissionAccess` helper (unit-tested), wrap it in `PermissionGuard`, and apply that guard as the `element` of each ERP route group in `dashboard.tsx`. Polish `inviteMember` CF + team form fields; Firestore rules by permission stay out of scope.

**Tech Stack:** React 18, React Router 6, MUI 5, Vitest, Firebase Auth Admin (Cloud Functions v2), existing `getEffectivePermissions` / `MemberPermissionKey` in `src/api/firestore/members.ts`.

**Spec:** `docs/superpowers/specs/2026-11-16-team-permission-guard-design.md`

## Global Constraints

- Auth method remains Firebase (`CONFIG.auth.method = 'firebase'`).
- Do not invent client-side `role: 'admin'` when claims are missing.
- UI strings for Forbidden stay on existing i18n keys `permission.deniedTitle` / `permission.deniedBody`.
- Do not change Firestore security rules in this plan.
- Do not combine `roles` and `permission` props on the same `PermissionGuard` instance.
- Default operator permissions when empty: `pos`, `customers`, `cash_close`, `batches_read`.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/auth/guard/resolve-permission-access.ts` | Pure allow/deny decision (testable) |
| `src/auth/guard/resolve-permission-access.test.ts` | Vitest cases for guard logic |
| `src/auth/guard/permission-guard.tsx` | React wrapper → Forbidden UI or children |
| `src/auth/guard/index.ts` | Re-export |
| `src/routes/sections/dashboard.tsx` | Wire guards on route groups |
| `src/sections/team/view/team-list-view.tsx` | Explicit autocomplete attrs on email/password |
| `functions/index.js` | `inviteMember` displayName update + default operador perms |
| `docs/agents/antigravity-erp-handoff.md` | Note slice A done + deferred rules |

---

### Task 1: Pure `resolvePermissionAccess` (TDD)

**Files:**
- Create: `src/auth/guard/resolve-permission-access.ts`
- Create: `src/auth/guard/resolve-permission-access.test.ts`

**Interfaces:**
- Consumes: `MemberPermissionKey`, `getEffectivePermissions` from `src/api/firestore/members`; `TenantRole` from `src/auth/firebase-claims`
- Produces:

```ts
export type PermissionAccessInput = {
  platformAdmin?: boolean;
  role?: TenantRole | string | null;
  permissions?: string[] | null;
  requirePlatformAdmin?: boolean;
  roles?: TenantRole[];
  permission?: MemberPermissionKey | MemberPermissionKey[];
};

export function resolvePermissionAccess(input: PermissionAccessInput): boolean;
```

- [ ] **Step 1: Write the failing tests**

Create `src/auth/guard/resolve-permission-access.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { resolvePermissionAccess } from './resolve-permission-access';

describe('resolvePermissionAccess', () => {
  it('allows platformAdmin when requirePlatformAdmin', () => {
    expect(
      resolvePermissionAccess({
        platformAdmin: true,
        requirePlatformAdmin: true,
      })
    ).toBe(true);
  });

  it('denies non-platformAdmin when requirePlatformAdmin', () => {
    expect(
      resolvePermissionAccess({
        platformAdmin: false,
        role: 'admin',
        requirePlatformAdmin: true,
      })
    ).toBe(false);
  });

  it('allows platformAdmin for any module permission', () => {
    expect(
      resolvePermissionAccess({
        platformAdmin: true,
        permission: 'dre',
      })
    ).toBe(true);
  });

  it('allows admin role for any permission via getEffectivePermissions', () => {
    expect(
      resolvePermissionAccess({
        role: 'admin',
        permission: 'dre',
      })
    ).toBe(true);
  });

  it('allows operador only when custom permissions include key', () => {
    expect(
      resolvePermissionAccess({
        role: 'operador',
        permissions: ['pos'],
        permission: 'pos',
      })
    ).toBe(true);
    expect(
      resolvePermissionAccess({
        role: 'operador',
        permissions: ['pos'],
        permission: 'products',
      })
    ).toBe(false);
  });

  it('allows any-of when permission is an array', () => {
    expect(
      resolvePermissionAccess({
        role: 'operador',
        permissions: ['batches_read'],
        permission: ['batches_read', 'batches_write'],
      })
    ).toBe(true);
  });

  it('allows only listed roles when roles prop is set', () => {
    expect(
      resolvePermissionAccess({
        role: 'gestor',
        roles: ['admin', 'gestor'],
      })
    ).toBe(true);
    expect(
      resolvePermissionAccess({
        role: 'operador',
        roles: ['admin', 'gestor'],
      })
    ).toBe(false);
  });

  it('allows platformAdmin when roles prop is set', () => {
    expect(
      resolvePermissionAccess({
        platformAdmin: true,
        role: undefined,
        roles: ['admin', 'gestor'],
      })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `./node_modules/.bin/vitest run src/auth/guard/resolve-permission-access.test.ts`

Expected: FAIL (module not found / `resolvePermissionAccess` undefined)

- [ ] **Step 3: Implement helper**

Create `src/auth/guard/resolve-permission-access.ts`:

```ts
import type { TenantRole } from 'src/auth/firebase-claims';
import type { MemberPermissionKey } from 'src/api/firestore/members';

import { getEffectivePermissions } from 'src/api/firestore/members';

export type PermissionAccessInput = {
  platformAdmin?: boolean;
  role?: TenantRole | string | null;
  permissions?: string[] | null;
  requirePlatformAdmin?: boolean;
  roles?: TenantRole[];
  permission?: MemberPermissionKey | MemberPermissionKey[];
};

export function resolvePermissionAccess(input: PermissionAccessInput): boolean {
  const {
    platformAdmin,
    role,
    permissions,
    requirePlatformAdmin,
    roles,
    permission,
  } = input;

  if (requirePlatformAdmin) {
    return platformAdmin === true;
  }

  if (platformAdmin === true) {
    return true;
  }

  if (roles && roles.length > 0) {
    return typeof role === 'string' && (roles as string[]).includes(role);
  }

  if (permission == null) {
    return true;
  }

  const effective = getEffectivePermissions(role, permissions);
  const required = Array.isArray(permission) ? permission : [permission];
  return required.some((key) => effective.has(key));
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `./node_modules/.bin/vitest run src/auth/guard/resolve-permission-access.test.ts`

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/guard/resolve-permission-access.ts src/auth/guard/resolve-permission-access.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add resolvePermissionAccess helper for route guards

Pure allow/deny logic shared by PermissionGuard, covered by Vitest.
EOF
)"
```

---

### Task 2: `PermissionGuard` component + export

**Files:**
- Create: `src/auth/guard/permission-guard.tsx`
- Modify: `src/auth/guard/index.ts`

**Interfaces:**
- Consumes: `resolvePermissionAccess`, `useAuthContext`, Forbidden UI pattern from `RoleBasedGuard`
- Produces: `PermissionGuard` React component

- [ ] **Step 1: Implement `permission-guard.tsx`**

```tsx
import type { Theme, SxProps } from '@mui/material/styles';
import type { TenantRole } from 'src/auth/firebase-claims';
import type { MemberPermissionKey } from 'src/api/firestore/members';

import { m } from 'framer-motion';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

import { ForbiddenIllustration } from 'src/assets/illustrations';

import { useTranslate } from 'src/locales';

import { varBounce, MotionContainer } from 'src/components/animate';

import { useAuthContext } from 'src/auth/hooks';

import { resolvePermissionAccess } from './resolve-permission-access';

// ----------------------------------------------------------------------

export type PermissionGuardProps = {
  sx?: SxProps<Theme>;
  hasContent?: boolean;
  children: React.ReactNode;
  permission?: MemberPermissionKey | MemberPermissionKey[];
  roles?: TenantRole[];
  requirePlatformAdmin?: boolean;
};

export function PermissionGuard({
  sx,
  children,
  hasContent = true,
  permission,
  roles,
  requirePlatformAdmin,
}: PermissionGuardProps) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const allowed = resolvePermissionAccess({
    platformAdmin: Boolean(user?.platformAdmin),
    role: user?.role,
    permissions: user?.permissions as string[] | undefined,
    requirePlatformAdmin,
    roles,
    permission,
  });

  if (!allowed) {
    return hasContent ? (
      <Container component={MotionContainer} sx={{ textAlign: 'center', ...sx }}>
        <m.div variants={varBounce().in}>
          <Typography variant="h3" sx={{ mb: 2 }}>
            {t('permission.deniedTitle')}
          </Typography>
        </m.div>

        <m.div variants={varBounce().in}>
          <Typography sx={{ color: 'text.secondary' }}>
            {t('permission.deniedBody')}
          </Typography>
        </m.div>

        <m.div variants={varBounce().in}>
          <ForbiddenIllustration sx={{ my: { xs: 5, sm: 10 } }} />
        </m.div>
      </Container>
    ) : null;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Export from index**

Modify `src/auth/guard/index.ts` — add:

```ts
export * from './permission-guard';
```

(keep existing exports)

- [ ] **Step 3: Typecheck smoke**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | head -40`

Expected: no new errors in `src/auth/guard/permission-guard.tsx` (pre-existing project errors may remain; do not expand scope)

- [ ] **Step 4: Commit**

```bash
git add src/auth/guard/permission-guard.tsx src/auth/guard/index.ts
git commit -m "$(cat <<'EOF'
feat(auth): add PermissionGuard for dashboard route protection

Shows Forbidden when resolvePermissionAccess denies access.
EOF
)"
```

---

### Task 3: Wire guards in `dashboard.tsx`

**Files:**
- Modify: `src/routes/sections/dashboard.tsx`

**Interfaces:**
- Consumes: `PermissionGuard` from `src/auth/guard`
- Produces: route tree where each ERP module group is guarded per spec map

- [ ] **Step 1: Add import**

At top with other auth imports:

```ts
import { AuthGuard, ClaimsGuard, PermissionGuard } from 'src/auth/guard';
```

Ensure `Outlet` is already imported from `react-router-dom` (it is).

- [ ] **Step 2: Replace route groups**

Replace the `children` array under `path: 'dashboard'` so each guarded group uses a layout route with `Outlet`. Exact structure:

```tsx
children: [
  { element: <IndexPage />, index: true },

  {
    path: 'suppliers',
    element: (
      <PermissionGuard permission="suppliers">
        <Outlet />
      </PermissionGuard>
    ),
    children: [
      { element: <Navigate to={paths.dashboard.suppliers.list} replace />, index: true },
      { path: 'list', element: <SupplierListPage /> },
      { path: 'create', element: <SupplierCreatePage /> },
      { path: ':id/edit', element: <SupplierEditPage /> },
    ],
  },
  {
    path: 'customers',
    element: (
      <PermissionGuard permission="customers">
        <Outlet />
      </PermissionGuard>
    ),
    children: [
      { element: <Navigate to={paths.dashboard.customers.list} replace />, index: true },
      { path: 'list', element: <CustomerListPage /> },
      { path: 'create', element: <CustomerCreatePage /> },
      { path: ':id/edit', element: <CustomerEditPage /> },
    ],
  },
  {
    path: 'products',
    element: (
      <PermissionGuard permission="products">
        <Outlet />
      </PermissionGuard>
    ),
    children: [
      { element: <Navigate to={paths.dashboard.products.list} replace />, index: true },
      { path: 'list', element: <ProductListPage /> },
      { path: 'create', element: <ProductCreatePage /> },
      { path: ':id/edit', element: <ProductEditPage /> },
    ],
  },
  {
    path: 'processing',
    element: (
      <PermissionGuard permission="processing">
        <Outlet />
      </PermissionGuard>
    ),
    children: [
      { element: <Navigate to={paths.dashboard.processing.list} replace />, index: true },
      { path: 'list', element: <ProcessingListPage /> },
      { path: 'create', element: <ProcessingCreatePage /> },
      { path: ':id', element: <ProcessingDetailsPage /> },
    ],
  },
  {
    path: 'batches',
    children: [
      { element: <Navigate to={paths.dashboard.batches.list} replace />, index: true },
      {
        element: (
          <PermissionGuard permission="batches_read">
            <Outlet />
          </PermissionGuard>
        ),
        children: [
          { path: 'list', element: <BatchListPage /> },
          { path: 'movements', element: <StockMovementListPage /> },
        ],
      },
      {
        path: 'create',
        element: (
          <PermissionGuard permission="batches_write">
            <BatchCreatePage />
          </PermissionGuard>
        ),
      },
    ],
  },
  {
    path: 'pos',
    element: (
      <PermissionGuard permission="pos">
        <Outlet />
      </PermissionGuard>
    ),
    children: [
      { element: <PosCheckoutPage />, index: true },
      { path: 'sales', element: <SaleListPage /> },
      { path: 'sales/:id', element: <SaleDetailsPage /> },
    ],
  },
  {
    path: 'cash',
    children: [
      {
        index: true,
        element: (
          <PermissionGuard permission="cash_close">
            <CashSessionPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'dre',
        element: (
          <PermissionGuard permission="dre">
            <DrePage />
          </PermissionGuard>
        ),
      },
    ],
  },
  {
    path: 'team',
    element: (
      <PermissionGuard roles={['admin', 'gestor']}>
        <Outlet />
      </PermissionGuard>
    ),
    children: [
      { element: <Navigate to={paths.dashboard.team.list} replace />, index: true },
      { path: 'list', element: <TeamListPage /> },
    ],
  },
  {
    path: 'account',
    children: [
      { element: <Navigate to={paths.dashboard.account.general} replace />, index: true },
      { path: 'general', element: <AccountPage /> },
      { path: 'change-password', element: <AccountPage /> },
    ],
  },
  {
    path: 'enterprises',
    element: (
      <PermissionGuard requirePlatformAdmin>
        <Outlet />
      </PermissionGuard>
    ),
    children: [
      { element: <Navigate to={paths.dashboard.enterprises.list} replace />, index: true },
      { path: 'list', element: <EnterpriseListPage /> },
      { path: 'create', element: <EnterpriseCreatePage /> },
      { path: ':id/edit', element: <EnterpriseEditPage /> },
      { path: ':id', element: <EnterpriseDetailsPage /> },
    ],
  },

  { path: '*', element: <Navigate to={paths.dashboard.root} replace /> },
],
```

Keep the existing `layoutContent` / `AuthGuard` / `ClaimsGuard` wrapper unchanged.

- [ ] **Step 3: Manual smoke (dev server)**

With an operador that has only `pos` in `members/{uid}.permissions`:

1. Open `/dashboard/pos` → checkout loads  
2. Open `/dashboard/products/list` → Forbidden  
3. Open `/dashboard/cash/dre` → Forbidden  
4. Open `/dashboard/team/list` → Forbidden  

Expected: matches acceptance tests 1–3 in the spec.

- [ ] **Step 4: Commit**

```bash
git add src/routes/sections/dashboard.tsx
git commit -m "$(cat <<'EOF'
feat(routes): gate ERP dashboard modules with PermissionGuard

Stops URL bypass when nav already hides unauthorized items.
EOF
)"
```

---

### Task 4: Team invite autocomplete + CF displayName / default perms

**Files:**
- Modify: `src/sections/team/view/team-list-view.tsx` (invite Field.Text ~lines 381–393)
- Modify: `functions/index.js` (`inviteMember`)

**Interfaces:**
- Consumes: existing `inviteMember` callable payload `{ email, enterpriseId, role, tempPassword?, displayName?, permissions? }`
- Produces: Auth `displayName` always updated when provided; operador empty perms → default four keys

- [ ] **Step 1: UI autocomplete attrs**

In the invite form, change the email and password fields to:

```tsx
<Field.Text
  name="displayName"
  label="Nome do colaborador"
  autoComplete="name"
/>
<Field.Text
  name="email"
  label="E-mail de login"
  autoComplete="off"
/>
{/* role Field.Select unchanged */}
<Field.Text
  name="tempPassword"
  label="Senha inicial de acesso"
  type="password"
  placeholder="Mínimo 6 caracteres"
  autoComplete="new-password"
/>
```

Note: `RHFTextField` spreads `...other` after default `inputProps`, so `autoComplete` on `Field.Text` applies to the MUI `TextField` root (forwards to input). If browser still autofills, also pass:

```tsx
inputProps={{ autoComplete: 'new-password' }}
```

on the password field (overrides the default `off` object).

- [ ] **Step 2: Update `inviteMember` in `functions/index.js`**

Near the top of the invite logic (after parsing `permissions`), define:

```js
const DEFAULT_OPERATOR_PERMISSIONS = [
  'pos',
  'customers',
  'cash_close',
  'batches_read',
];
```

After the `getUserByEmail` / `createUser` block (where `user` is resolved), **before** `setCustomUserClaims`:

```js
if (displayName) {
  if (!created && user.displayName !== displayName) {
    await auth.updateUser(user.uid, { displayName });
    user = await auth.getUser(user.uid);
  }
}
```

Replace the member payload permissions section with:

```js
const memberPayload = {
  email,
  role,
  displayName: displayName || user.displayName || '',
  invitedBy: request.auth.uid,
  invitedAt: nowIso(),
  updatedAt: nowIso(),
  active: true,
};

if (role === 'operador') {
  memberPayload.permissions =
    permissions && permissions.length > 0
      ? permissions
      : DEFAULT_OPERATOR_PERMISSIONS;
} else if (permissions && permissions.length > 0) {
  memberPayload.permissions = permissions;
}
```

Keep the existing `set(..., { merge: true })` and return payload.

- [ ] **Step 3: Deploy functions**

Run (from repo root, with service account / project already configured as in prior sessions):

```bash
cd functions && npm run deploy -- --only functions:inviteMember
```

If the project uses `firebase deploy --only functions:inviteMember` from root, use that instead. Expected: deploy success for `inviteMember`.

- [ ] **Step 4: Smoke invite → account**

1. As admin, invite user with displayName `Maria Teste`, only `pos` checked.  
2. Sign in as that user.  
3. Open `/dashboard/account/general` → name shows `Maria Teste`.  
4. Confirm email/password invite fields have `autocomplete="off"` / `new-password` in DOM.

- [ ] **Step 5: Commit**

```bash
git add src/sections/team/view/team-list-view.tsx functions/index.js
git commit -m "$(cat <<'EOF'
fix(team): invite autocomplete off and sync displayName defaults

Update Auth displayName for existing users and persist operador default permissions.
EOF
)"
```

---

### Task 5: Handoff note + verification

**Files:**
- Modify: `docs/agents/antigravity-erp-handoff.md` (short “feito / pendente” bullets)

- [ ] **Step 1: Update handoff**

Add under done:

- Slice A: `PermissionGuard` on ERP routes; team invite autocomplete; `inviteMember` displayName + operador default perms.

Add under pending:

- Firestore rules by `MemberPermissionKey` (harden data plane).
- Slice B BrasilAPI CEP/CNPJ; enterprise/account PII fields.
- Slice C AP/AR, DRE date filters, seller ranking.

- [ ] **Step 2: Re-run unit tests**

Run: `./node_modules/.bin/vitest run src/auth/guard/resolve-permission-access.test.ts`

Expected: PASS

- [ ] **Step 3: Commit handoff**

```bash
git add docs/agents/antigravity-erp-handoff.md
git commit -m "$(cat <<'EOF'
docs(handoff): record team PermissionGuard slice A complete
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `PermissionGuard` + Forbidden UI | Task 2 |
| Route map (pos, customers, cash/dre, batches read/write, products, suppliers, processing, team roles, enterprises platformAdmin) | Task 3 |
| Invite autocomplete off / new-password | Task 4 |
| displayName → Auth + members | Task 4 |
| Operador empty perms → defaults | Task 4 |
| Account prefilled smoke | Task 4 |
| Firestore rules deferred | Explicit non-goal / handoff |
| Unit tests for access logic | Task 1 |

## Self-review notes

- No TBD placeholders.
- `resolvePermissionAccess` signatures match between Task 1 and Task 2.
- Cash and batches nesting matches spec (separate keys, not one parent requiring both).
- Deploy step is environment-dependent; if deploy blocked, leave CF committed and note in handoff that deploy is required before invite smoke.

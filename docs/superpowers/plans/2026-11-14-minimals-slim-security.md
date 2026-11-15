# Minimals 6.0.1 Slim + Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slim Minimals 6.0.1 to a JWT + ERP shell, then harden session/auth handling — without upgrading to kit 7.x.

**Architecture:** Keep vendor `theme`/`layouts`/shared components; delete unused auth providers and demo surfaces; centralize ERP tenant params and auth session clearing; AuthGuard already wraps dashboard — remove admin role fallback and add 401 interceptor.

**Tech Stack:** React 18, Vite 5, MUI 5, React Router 6, axios, sessionStorage JWT, Vitest (new, for pure helpers only)

**Spec:** `docs/superpowers/specs/2026-11-14-minimals-slim-security-design.md`

## Global Constraints

- Stay on Minimals kit **6.0.1** — no React 19 / MUI 7+ / Vite 8 upgrade in this plan.
- Auth method remains **`jwt` only** (`CONFIG.auth.method: 'jwt'`).
- Canonical storage keys: **`jwt_access_token`** and **`user`** — both cleared on logout and 401.
- Never invent role **`admin`** when role is missing.
- Do not overwrite or relocate `src/api` / `src/core` ERP domain into a new tree.
- Do not delete shared `src/components/*` without a zero-usage check from ERP + remaining shell.
- Prefer `yarn` (project lockfile); run `yarn build` as the integration gate after destructive tasks.
- Commit in slices; do not commit unrelated dirty files (`package-lock.json`, unrelated `main.tsx` / `yarn.lock` noise) unless part of the task.

## File map (planned)

| File | Responsibility |
|------|----------------|
| `src/auth/session/erp-session.ts` | Typed read/clear of `user` + tenant params; `resolveUserRole` |
| `src/auth/session/erp-session.test.ts` | Unit tests for session helpers |
| `src/auth/context/jwt/utils.ts` | Token session + call shared clear; no `alert` |
| `src/auth/context/jwt/auth-provider.tsx` | No admin fallback; use `resolveUserRole` |
| `src/auth/context/jwt/action.ts` | Sign-in/out use shared clear helpers |
| `src/utils/axios.ts` | 401 interceptor; use shared tenant params |
| `src/core/services/serviceRequest.ts` | Use shared tenant params (delete local duplicate) |
| `src/App.tsx` | JwtAuthProvider only; drop CheckoutProvider if checkout demos removed |
| `src/config-global.ts` | Narrow `auth.method` type to `'jwt'` (optional but preferred) |
| `src/routes/sections/index.tsx` | `/` → dashboard redirect; drop auth-demo/components/main marketing |
| `src/routes/sections/auth.tsx` | JWT routes only |
| `src/routes/sections/dashboard.tsx` | ERP routes only under AuthGuard |
| `src/layouts/config-nav-dashboard.tsx` | ERP nav only |
| `src/routes/paths.ts` | Drop demo/auth-extra paths; keep ERP + jwt + errors |
| `vitest.config.ts` + `package.json` scripts | Test runner for helpers |

---

### Task 1: Vitest + ERP session helpers

**Files:**
- Create: `vitest.config.ts`
- Create: `src/auth/session/erp-session.ts`
- Create: `src/auth/session/erp-session.test.ts`
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)

**Interfaces:**
- Consumes: `sessionStorage` keys `user`, `jwt_access_token` (string constants exported)
- Produces:
  - `export const USER_STORAGE_KEY = 'user'`
  - `export const JWT_STORAGE_KEY = 'jwt_access_token'` (re-export or mirror `STORAGE_KEY` — keep `src/auth/context/jwt/constant.ts` as source of truth for JWT key; import it here to avoid drift)
  - `export type ErpSessionParams = { ideEmpr: string | number; ideSucu: string | number; ideUsua: string | number; idePerf: string | number; login: string; ip: string; device?: string }`
  - `export function readStoredUser(): Record<string, unknown> | null`
  - `export function getErpSessionParams(): ErpSessionParams` — throws `Error('Incomplete ERP session')` if required fields missing
  - `export function tryGetErpSessionParams(): ErpSessionParams | null`
  - `export function clearClientAuthStorage(): void` — removes `user` and JWT key
  - `export function resolveUserRole(user: Record<string, unknown> | null | undefined): string | null` — returns `user.role` if non-empty string, else `null` (never `'admin'`)

- [ ] **Step 1: Add Vitest**

```bash
yarn add -D vitest
```

Add to `package.json` scripts:

```json
"test": "vitest run"
```

Create `vitest.config.ts`:

```ts
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      src: path.join(process.cwd(), 'src'),
    },
  },
});
```

- [ ] **Step 2: Write failing tests**

Create `src/auth/session/erp-session.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearClientAuthStorage,
  getErpSessionParams,
  resolveUserRole,
  tryGetErpSessionParams,
  USER_STORAGE_KEY,
} from './erp-session';
import { STORAGE_KEY } from '../context/jwt/constant';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  // @ts-expect-error minimal sessionStorage mock
  globalThis.sessionStorage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  };
});

describe('resolveUserRole', () => {
  it('returns null when role missing (does not invent admin)', () => {
    expect(resolveUserRole({})).toBeNull();
    expect(resolveUserRole({ role: '' })).toBeNull();
    expect(resolveUserRole(null)).toBeNull();
  });

  it('returns role when present', () => {
    expect(resolveUserRole({ role: 'editor' })).toBe('editor');
  });
});

describe('getErpSessionParams', () => {
  it('throws when user storage missing', () => {
    expect(() => getErpSessionParams()).toThrow(/Incomplete ERP session/);
  });

  it('returns mapped params when complete', () => {
    sessionStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({
        ide_empr: 1,
        ide_sucu: 2,
        ide_usua: 3,
        ide_perf: 4,
        login: 'demo',
        ip: '10.0.0.1',
        device: 'web',
      })
    );
    expect(getErpSessionParams()).toEqual({
      ideEmpr: 1,
      ideSucu: 2,
      ideUsua: 3,
      idePerf: 4,
      login: 'demo',
      ip: '10.0.0.1',
      device: 'web',
    });
  });

  it('tryGet returns null instead of throw', () => {
    expect(tryGetErpSessionParams()).toBeNull();
  });
});

describe('clearClientAuthStorage', () => {
  it('removes user and jwt keys', () => {
    sessionStorage.setItem(USER_STORAGE_KEY, '{}');
    sessionStorage.setItem(STORAGE_KEY, 'token');
    clearClientAuthStorage();
    expect(sessionStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
yarn test
```

Expected: FAIL (module `./erp-session` missing or exports missing).

- [ ] **Step 4: Implement helpers**

Create `src/auth/session/erp-session.ts`:

```ts
import { STORAGE_KEY } from 'src/auth/context/jwt/constant';

export const USER_STORAGE_KEY = 'user';

export type ErpSessionParams = {
  ideEmpr: string | number;
  ideSucu: string | number;
  ideUsua: string | number;
  idePerf: string | number;
  login: string;
  ip: string;
  device?: string;
};

export function readStoredUser(): Record<string, unknown> | null {
  const raw = sessionStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function getErpSessionParams(): ErpSessionParams {
  const user = readStoredUser();
  if (
    !user ||
    user.ide_empr == null ||
    user.ide_sucu == null ||
    user.ide_usua == null ||
    user.ide_perf == null ||
    !user.login
  ) {
    throw new Error('Incomplete ERP session');
  }
  return {
    ideEmpr: user.ide_empr as string | number,
    ideSucu: user.ide_sucu as string | number,
    ideUsua: user.ide_usua as string | number,
    idePerf: user.ide_perf as string | number,
    login: String(user.login),
    ip: (user.ip as string) || '127.0.0.1',
    device: user.device as string | undefined,
  };
}

export function tryGetErpSessionParams(): ErpSessionParams | null {
  try {
    return getErpSessionParams();
  } catch {
    return null;
  }
}

export function clearClientAuthStorage(): void {
  sessionStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

export function resolveUserRole(user: Record<string, unknown> | null | undefined): string | null {
  const role = user?.role;
  return typeof role === 'string' && role.trim() ? role : null;
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
yarn test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json yarn.lock vitest.config.ts src/auth/session/erp-session.ts src/auth/session/erp-session.test.ts
git commit -m "$(cat <<'EOF'
feat: add ERP session helpers with vitest coverage

Centralize tenant params, role resolution without admin default, and auth storage clearing.
EOF
)"
```

---

### Task 2: JWT-only App wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/config-global.ts` (narrow auth method type to `'jwt'`)

**Interfaces:**
- Consumes: `JwtAuthProvider` only
- Produces: App always mounts JWT auth; `CONFIG.auth.method` typed as `'jwt'`

- [ ] **Step 1: Simplify `App.tsx`**

Replace auth provider selection with:

```tsx
import { AuthProvider } from 'src/auth/context/jwt';
```

Remove Auth0/Amplify/Supabase/Firebase imports and the `CONFIG.auth.method` ternary. Keep providers for settings/theme/i18n/snackbar/progress. Leave `CheckoutProvider` for now (removed in Task 5 if checkout routes go).

- [ ] **Step 2: Narrow config type**

In `src/config-global.ts`, change:

```ts
auth: {
  method: 'jwt';
  skip: boolean;
  redirectPath: string;
};
```

And set `method: 'jwt'` (already). Remove union of other methods from the type.

- [ ] **Step 3: Typecheck**

```bash
yarn build
```

Expected: may still pass if other auth folders exist unused; fix only type errors introduced here.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/config-global.ts
git commit -m "$(cat <<'EOF'
refactor: wire App to JWT auth provider only

Drop multi-provider selection so unused auth stacks can be deleted next.
EOF
)"
```

---

### Task 3: Slim auth routes to JWT

**Files:**
- Modify: `src/routes/sections/auth.tsx` — keep only Jwt block + export
- Modify: `src/routes/paths.ts` — keep `auth.jwt`; remove amplify/firebase/auth0/supabase/authDemo path trees
- Delete directories:
  - `src/auth/context/amplify/`
  - `src/auth/context/firebase/`
  - `src/auth/context/supabase/`
  - `src/auth/context/auth0/`
  - `src/pages/auth/amplify/`
  - `src/pages/auth/firebase/`
  - `src/pages/auth/supabase/`
  - `src/pages/auth/auth0/`
  - `src/sections/auth/amplify/`
  - `src/sections/auth/firebase/`
  - `src/sections/auth/supabase/`
  - `src/sections/auth/auth0/` (if present)
  - `src/lib/firebase.ts`
  - `src/lib/supabase.ts`
- Modify: any `src/sections/auth/index.ts` barrel to export JWT only

**Interfaces:**
- Consumes: Jwt pages under `src/pages/auth/jwt/*`
- Produces: `authRoutes` with path `auth` → children only `jwt`

- [ ] **Step 1: Rewrite `auth.tsx` to JWT-only**

Final shape (full file):

```tsx
import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import { AuthSplitLayout } from 'src/layouts/auth-split';
import { SplashScreen } from 'src/components/loading-screen';
import { GuestGuard } from 'src/auth/guard';

const Jwt = {
  SignInPage: lazy(() => import('src/pages/auth/jwt/sign-in')),
  SignUpPage: lazy(() => import('src/pages/auth/jwt/sign-up')),
};

export const authRoutes = [
  {
    path: 'auth',
    element: (
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
    ),
    children: [
      {
        path: 'jwt',
        children: [
          {
            path: 'sign-in',
            element: (
              <GuestGuard>
                <AuthSplitLayout section={{ title: 'Hi, Welcome back' }}>
                  <Jwt.SignInPage />
                </AuthSplitLayout>
              </GuestGuard>
            ),
          },
          {
            path: 'sign-up',
            element: (
              <GuestGuard>
                <AuthSplitLayout>
                  <Jwt.SignUpPage />
                </AuthSplitLayout>
              </GuestGuard>
            ),
          },
        ],
      },
    ],
  },
];
```

- [ ] **Step 2: Trim `paths.auth` to jwt only; remove `authDemo`**

Keep `paths.auth.jwt.signIn` / `signUp`. Delete amplify/firebase/auth0/supabase and `authDemo` objects. Fix any remaining imports that reference removed paths (grep).

```bash
rg "auth\.(amplify|firebase|auth0|supabase)|authDemo|AUTH_DEMO" src -g '*.{ts,tsx}'
```

Expected after fixes: no matches (except possibly comments — remove those too).

- [ ] **Step 3: Delete unused auth provider/page/section folders listed above**

```bash
rm -rf src/auth/context/amplify src/auth/context/firebase src/auth/context/supabase src/auth/context/auth0
rm -rf src/pages/auth/amplify src/pages/auth/firebase src/pages/auth/supabase src/pages/auth/auth0
rm -rf src/sections/auth/amplify src/sections/auth/firebase src/sections/auth/supabase
rm -f src/lib/firebase.ts src/lib/supabase.ts
# delete auth0 section dir if exists
```

Fix barrels/`auth-guard.tsx` sign-in path map to jwt-only (remove other method keys or leave only jwt).

- [ ] **Step 4: Build**

```bash
yarn build
```

Expected: SUCCESS (or fix leftover imports until SUCCESS).

- [ ] **Step 5: Commit**

```bash
git add -A src/routes/sections/auth.tsx src/routes/paths.ts src/auth src/pages/auth src/sections/auth src/lib src/auth/guard
git commit -m "$(cat <<'EOF'
refactor: remove non-JWT auth providers and routes

Keep only JWT sign-in/sign-up to shrink the auth surface.
EOF
)"
```

---

### Task 4: Slim router entry (drop demos / marketing)

**Files:**
- Modify: `src/routes/sections/index.tsx`
- Delete: `src/routes/sections/auth-demo.tsx`
- Delete: `src/routes/sections/components.tsx` (after confirming only used by showcase)
- Modify or delete: `src/routes/sections/main.tsx` — remove if all marketing routes removed; otherwise keep only error pages (403/404/500) + maintenance if needed

**Interfaces:**
- Produces: Router with `/` → `<Navigate to={CONFIG.auth.redirectPath} replace />`, plus `authRoutes`, `dashboardRoutes`, error routes

- [ ] **Step 1: Rewrite `src/routes/sections/index.tsx`**

```tsx
import { lazy, Suspense } from 'react';
import { Navigate, useRoutes } from 'react-router-dom';

import { CONFIG } from 'src/config-global';
import { SplashScreen } from 'src/components/loading-screen';

import { authRoutes } from './auth';
import { dashboardRoutes } from './dashboard';

const Page404 = lazy(() => import('src/pages/error/404'));
const Page403 = lazy(() => import('src/pages/error/403'));
const Page500 = lazy(() => import('src/pages/error/500'));

export function Router() {
  return useRoutes([
    {
      path: '/',
      element: <Navigate to={CONFIG.auth.redirectPath} replace />,
    },
    ...authRoutes,
    ...dashboardRoutes,
    {
      path: 'error',
      children: [
        { path: '403', element: <Suspense fallback={<SplashScreen />}><Page403 /></Suspense> },
        { path: '404', element: <Suspense fallback={<SplashScreen />}><Page404 /></Suspense> },
        { path: '500', element: <Suspense fallback={<SplashScreen />}><Page500 /></Suspense> },
      ],
    },
    { path: '404', element: <Suspense fallback={<SplashScreen />}><Page404 /></Suspense> },
    { path: '*', element: <Navigate to="/404" replace /> },
  ]);
}
```

Adjust page import paths if the project uses different error page locations (`rg "pages/error" src`).

- [ ] **Step 2: Remove `authDemoRoutes` / `componentsRoutes` / `mainRoutes` imports and delete unused route module files**

- [ ] **Step 3: Build**

```bash
yarn build
```

Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/sections/
git commit -m "$(cat <<'EOF'
refactor: redirect root to dashboard and drop demo routers

Remove auth-demo and components showcase from the route tree.
EOF
)"
```

---

### Task 5: Slim dashboard routes + nav to ERP only

**Files:**
- Modify: `src/routes/sections/dashboard.tsx` — keep AuthGuard layout; keep index dashboard page if used; keep ERP children only (`auditoria`, `sistema`, `usuarios`, `productos` / inventario paths as currently wired)
- Modify: `src/layouts/config-nav-dashboard.tsx` — Overview: App only (or remove Overview); Management: Administración, Inventario, Auditoria if linked
- Modify: `src/routes/paths.ts` — remove unused dashboard demo path trees after grep proves safe
- Modify: `src/App.tsx` — remove `CheckoutProvider` if checkout section unused

**Interfaces:**
- Consumes: ERP page lazy imports already in `dashboard.tsx` lines ~70–89
- Produces: `dashboardRoutes` children = ERP modules + optional blank index only

- [ ] **Step 1: Strip demo lazy imports and children from `dashboard.tsx`**

Keep:
- `IndexPage` (dashboard home) OR replace index with Navigate to first ERP route — prefer keep `IndexPage` if it is the app overview ERP uses
- ERP blocks: `auditoria`, `sistema`, `usuarios`, productos routes (whatever path names exist today: `productos` etc.)
- Remove: ecommerce/analytics/banking/booking/file/course, product/order/invoice/user/blog/job/tour demos, file-manager, chat, mail, calendar, kanban, permission, params, blank — unless ERP imports them (calendar API exists — **keep calendar route only if `src/api/calendar.ts` is used by an ERP page**; else remove route but keep `src/api/calendar.ts`)

After edit, file should not import deleted demo pages.

- [ ] **Step 2: Rewrite `config-nav-dashboard.tsx` navData**

Example target:

```tsx
export const navData = [
  {
    subheader: 'Overview',
    items: [{ title: 'App', path: paths.dashboard.root, icon: ICONS.dashboard }],
  },
  {
    subheader: 'Management',
    items: [
      {
        title: 'Administración',
        path: paths.dashboard.sistema.empresa,
        icon: ICONS.user,
        children: [
          { title: 'Empresa', path: paths.dashboard.sistema.empresa },
          { title: 'Sucursales', path: paths.dashboard.sistema.sucursal },
          { title: 'Usuarios', path: paths.dashboard.sistema.usuarios.list },
        ],
      },
      {
        title: 'Inventario',
        path: paths.dashboard.inventario.productos.list,
        icon: ICONS.product,
        children: [
          { title: 'Productos', path: paths.dashboard.inventario.productos.list },
        ],
      },
      {
        title: 'Auditoría',
        path: paths.dashboard.auditoria.root,
        icon: ICONS.lock,
        children: [
          { title: 'Eventos', path: `${paths.dashboard.root}/auditoria/eventos-auditoria` },
        ],
      },
    ],
  },
];
```

Fix Auditoría path to match the real route in `dashboard.tsx` (`eventos-auditoria`). Add `paths.dashboard.auditoria.eventosAuditoria` if cleaner.

- [ ] **Step 3: Grep for broken path references; trim `paths.ts` demo trees only when unused**

```bash
rg "paths\.dashboard\.(user|product|invoice|order|job|tour|general|mail|chat|kanban)" src -g '*.{ts,tsx}'
```

Remove or keep paths based on remaining references. Prefer deleting dead path keys once zero refs.

- [ ] **Step 4: Remove `CheckoutProvider` from `App.tsx` if `src/sections/checkout` has no remaining imports**

```bash
rg "checkout" src -g '*.{ts,tsx}' -i
```

- [ ] **Step 5: Build**

```bash
yarn build
```

Expected: SUCCESS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/sections/dashboard.tsx src/layouts/config-nav-dashboard.tsx src/routes/paths.ts src/App.tsx
git commit -m "$(cat <<'EOF'
refactor: keep ERP-only dashboard routes and navigation

Remove Minimals demo modules from the dashboard shell.
EOF
)"
```

---

### Task 6: Delete orphan demo pages/sections (inventory-gated)

**Files:**
- Delete unused trees under `src/pages/` and `src/sections/` that Task 4–5 no longer import
- Do **not** delete: `src/pages/sistema`, `src/pages/inventario`, `src/pages/auditoria`, `src/api`, `src/core`, JWT auth pages, dashboard index if still routed, layouts, theme, shared components still imported

**Interfaces:**
- Consumes: import graph after Task 5
- Produces: smaller tree; build green

- [ ] **Step 1: Generate unused-page candidates**

```bash
# list page entry files still imported from routes
rg "import\('src/pages/" src/routes -g '*.{ts,tsx}'
```

Anything under `src/pages` not in that list (except shared) is a delete candidate. Same for `src/sections/_examples`, `src/pages/components`, `src/pages/auth-demo`, marketing pages (`about-us`, `pricing`, etc.).

- [ ] **Step 2: Delete confirmed orphans in batches**

Example batch (adjust after inventory):

```bash
rm -rf src/sections/_examples src/pages/components src/pages/auth-demo
rm -rf src/pages/about-us src/pages/contact-us src/pages/faqs src/pages/pricing src/pages/payment
rm -rf src/pages/coming-soon src/pages/maintenance src/pages/blank
# demo dashboard pages folders no longer routed:
rm -rf src/pages/dashboard/ecommerce src/pages/dashboard/analytics src/pages/dashboard/banking
# ...repeat only for folders with zero imports
```

After each large batch:

```bash
yarn build
```

- [ ] **Step 3: Shared components — delete only with zero imports**

```bash
# example check before deleting a component folder
rg "from 'src/components/walktour" src -g '*.{ts,tsx}'
```

If zero hits outside the folder itself, delete. If any hit remains, keep.

- [ ] **Step 4: Final build**

```bash
yarn build
```

Expected: SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: delete unused Minimals demo pages and sections

Remove orphan template surfaces left after ERP-only routing.
EOF
)"
```

Only stage deletions/related fixes — avoid adding `package-lock.json` if the project uses yarn.

---

### Task 7: Remove orphan npm dependencies

**Files:**
- Modify: `package.json` / `yarn.lock`

**Interfaces:**
- Produces: no `@auth0/*`, `firebase`, `@supabase/*`, `aws-amplify` unless still imported

- [ ] **Step 1: Confirm zero imports**

```bash
rg "@auth0/|from 'firebase|@supabase/|aws-amplify|from \"firebase" src -g '*.{ts,tsx}'
```

Expected: no matches.

- [ ] **Step 2: Remove packages**

```bash
yarn remove @auth0/auth0-react firebase @supabase/supabase-js aws-amplify
```

Also remove other deps only if Task 6 deleted all consumers (e.g. mapbox only if map demos gone — **verify with rg first**; do not remove mapbox/fullcalendar/etc. blindly).

- [ ] **Step 3: Build**

```bash
yarn build
```

Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add package.json yarn.lock
git commit -m "$(cat <<'EOF'
chore: drop unused auth provider dependencies

Remove Auth0, Firebase, Supabase, and Amplify packages after JWT-only slim.
EOF
)"
```

---

### Task 8: Security — session clear, 401 interceptor, no admin role

**Files:**
- Modify: `src/auth/context/jwt/utils.ts`
- Modify: `src/auth/context/jwt/auth-provider.tsx`
- Modify: `src/auth/context/jwt/action.ts`
- Modify: `src/utils/axios.ts`
- Modify: `src/core/services/serviceRequest.ts`
- Modify: `src/auth/guard/auth-guard.tsx` if it still references multi-auth path map

**Interfaces:**
- Consumes: `clearClientAuthStorage`, `tryGetErpSessionParams`, `resolveUserRole` from Task 1
- Produces: 401 → clear storage + redirect jwt sign-in; user.role only if present

- [ ] **Step 1: Update `setSession` / expiry in `utils.ts`**

Replace `tokenExpired` alert flow with:

```ts
import { paths } from 'src/routes/paths';
import axios from 'src/utils/axios';
import { clearClientAuthStorage } from 'src/auth/session/erp-session';
import { STORAGE_KEY } from './constant';

export function tokenExpired(exp: number) {
  const timeLeft = exp * 1000 - Date.now();
  if (timeLeft <= 0) {
    clearClientAuthStorage();
    delete axios.defaults.headers.common.Authorization;
    window.location.href = paths.auth.jwt.signIn;
    return;
  }
  setTimeout(() => {
    clearClientAuthStorage();
    delete axios.defaults.headers.common.Authorization;
    window.location.href = paths.auth.jwt.signIn;
  }, timeLeft);
}

export async function setSession(accessToken: string | null) {
  if (accessToken) {
    sessionStorage.setItem(STORAGE_KEY, accessToken);
    axios.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    const decodedToken = jwtDecode(accessToken);
    if (decodedToken && 'exp' in decodedToken) {
      tokenExpired(decodedToken.exp as number);
    } else {
      throw new Error('Invalid access token!');
    }
  } else {
    clearClientAuthStorage();
    delete axios.defaults.headers.common.Authorization;
  }
}
```

Keep existing `jwtDecode` / `isValidToken` (adapt imports). Ensure `setSession(null)` clears **both** keys via `clearClientAuthStorage`.

- [ ] **Step 2: Fix `auth-provider.tsx` role**

```tsx
import { resolveUserRole } from 'src/auth/session/erp-session';

// inside useMemo:
user: state.user
  ? {
      ...state.user,
      role: resolveUserRole(state.user as Record<string, unknown>),
    }
  : null,
```

Do **not** use `?? 'admin'`. Downstream UI that requires a string role must handle `null` (show denied / hide admin actions).

- [ ] **Step 3: Fix `action.ts` signOut / signIn**

On signOut failure or success, always `clearClientAuthStorage()` + `setSession(null)`. Prefer:

```ts
export const signOut = async (): Promise<void> => {
  try {
    await axios.post(endpoints.auth.logout);
  } finally {
    await setSession(null);
  }
};
```

Keep writing `user` into sessionStorage on successful sign-in as today.

- [ ] **Step 4: Axios 401 interceptor + shared params**

In `src/utils/axios.ts`:

```ts
import { paths } from 'src/routes/paths';
import { clearClientAuthStorage, tryGetErpSessionParams } from 'src/auth/session/erp-session';

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      clearClientAuthStorage();
      delete axiosInstance.defaults.headers.common.Authorization;
      if (window.location.pathname !== paths.auth.jwt.signIn) {
        window.location.href = paths.auth.jwt.signIn;
      }
    }
    return Promise.reject((error.response && error.response.data) || 'Something went wrong!');
  }
);

export const defaultParams = (): Record<string, unknown> => tryGetErpSessionParams() ?? {};
```

Remove the duplicated `sessionStorage.getItem('user')` body from `defaultParams`.

In `src/core/services/serviceRequest.ts`, replace local `getDefaultParams` with:

```ts
import { tryGetErpSessionParams } from 'src/auth/session/erp-session';

function getDefaultParams() {
  return tryGetErpSessionParams() ?? {};
}
```

- [ ] **Step 5: Run unit tests + build**

```bash
yarn test && yarn build
```

Expected: PASS / SUCCESS.

- [ ] **Step 6: Manual smoke (checklist)**

1. Login JWT → lands on dashboard.
2. Reload → still authenticated.
3. Clear `jwt_access_token` manually → next guarded nav redirects to sign-in.
4. Logout → both storage keys gone.
5. (If API can force 401) confirm redirect + cleared keys.

- [ ] **Step 7: Commit**

```bash
git add src/auth/context/jwt/utils.ts src/auth/context/jwt/auth-provider.tsx src/auth/context/jwt/action.ts src/utils/axios.ts src/core/services/serviceRequest.ts src/auth/guard
git commit -m "$(cat <<'EOF'
fix: harden JWT session clearing and stop admin role fallback

Unify ERP session params, handle 401 logout, and avoid inventing roles.
EOF
)"
```

---

### Task 9: Role guard policy + backend checklist note

**Files:**
- Modify: ERP route wrappers only if backend already returns `user.role` usable values — otherwise document skip
- Create: `docs/superpowers/specs/2026-11-14-backend-auth-checklist.md` (short checklist from design)

**Interfaces:**
- Consumes: `resolveUserRole`, `RoleBasedGuard`
- Produces: either guarded usuarios routes **or** explicit checklist stating RoleBasedGuard deferred

- [ ] **Step 1: Inspect `/api/auth/check-status` / login payload for `role`**

If role is absent in current API responses, **do not** invent client-side roles. Skip wiring `RoleBasedGuard` and write the checklist doc stating AuthGuard-only + backend follow-up.

If role exists (e.g. `admin` | `user`), wrap `usuarios` children:

```tsx
import { RoleBasedGuard } from 'src/auth/guard';
import { useAuthContext } from 'src/auth/hooks';

// inside a small wrapper component:
function UsuariosGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const role = typeof user?.role === 'string' ? user.role : '';
  return (
    <RoleBasedGuard acceptRoles={['admin']} currentRole={role} hasContent>
      {children}
    </RoleBasedGuard>
  );
}
```

Use real role strings from the API — do not hardcode blindly without confirming values.

- [ ] **Step 2: Write backend checklist doc**

```markdown
# Backend auth checklist (ERP)

- Validate JWT on every protected endpoint.
- Derive/verify ideEmpr, ideSucu, ideUsua, idePerf server-side; do not trust client body alone.
- Return an explicit role (or permission list) on login / check-status if front RoleBasedGuard should activate.
- Enforce permissions for usuarios / sistema / inventario mutations.
```

- [ ] **Step 3: Build**

```bash
yarn build
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-11-14-backend-auth-checklist.md src/routes/sections/dashboard.tsx
git commit -m "$(cat <<'EOF'
docs: add backend auth checklist and optional role guards

Record server validation requirements; wire RoleBasedGuard only when API roles exist.
EOF
)"
```

---

### Task 10: Final verification against success criteria

**Files:** none new (verification only); update plan checkboxes as done

- [ ] **Step 1: Automated gates**

```bash
yarn test && yarn build
```

Expected: PASS / SUCCESS.

- [ ] **Step 2: Grep regressions**

```bash
rg "auth0|amplify|supabase|firebase|auth-demo|_examples|\\?\\? 'admin'|\\?\\? \"admin\"" src -g '*.{ts,tsx}' -i
```

Expected: no hits for removed stacks / admin fallback (firebase/supabase strings only if still in comments — remove comments).

- [ ] **Step 3: Manual smoke**

- Nav shows only ERP items
- `/` redirects to dashboard
- Login / logout / 401 behavior from Task 8

- [ ] **Step 4: Confirm non-goals untouched**

- `package.json` still shows kit intent 6.0.1 / React 18 / MUI 5 / Vite 5 (no major upgrade)
- `src/api` and `src/core` still present

No commit required if nothing changed; if grep cleanup edits were needed, commit:

```bash
git commit -m "$(cat <<'EOF'
chore: finish slim/security verification cleanups
EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Architecture shell vs ERP | Tasks 2–6 |
| Aggressive removal demos/auth | Tasks 3–7 |
| JWT only | Tasks 2–3, 7 |
| `/` redirect away from marketing home | Task 4 |
| Storage keys `jwt_access_token` + `user` | Tasks 1, 8 |
| No admin role default | Tasks 1, 8 |
| Unify tenant params | Tasks 1, 8 |
| 401 clear + redirect | Task 8 |
| AuthGuard on ERP (already) + RoleBasedGuard if roles | Task 9 |
| Backend checklist | Task 9 |
| 7.x deferred / not executed | Global constraints + no upgrade task |
| Success criteria / smoke | Task 10 |

No TBD placeholders. Helper names consistent: `clearClientAuthStorage`, `tryGetErpSessionParams`, `resolveUserRole`, `USER_STORAGE_KEY`.

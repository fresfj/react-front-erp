# Firebase Tenant Offline RBAC Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-tenant Firestore Custom Claims (`empresaId` + `role`), IndexedDB offline persistence, offline banner (i18n), and role-gated nav/routes — without changing existing HTTP/`FormTable` ERP screens.

**Architecture:** Bootstrap on current Firebase Auth shell. Persist Firestore via `initializeFirestore` + `persistentLocalCache` (Firebase JS SDK v13; replaces obsolete `enableIndexedDbPersistence`). Claims parsed into AuthContext. Nav already supports `roles` + `slotProps.currentRole` — wire them. Rules + Admin seed script live outside the Vite bundle.

**Tech Stack:** React 18, Vite 5, MUI 5, Firebase JS `^13.3.0`, i18next (`pt|en|es`), Vitest, Firestore Security Rules, optional `firebase-admin` (dev script only).

**Spec:** `docs/superpowers/specs/2026-11-14-firebase-tenant-offline-rbac-design.md`

## Global Constraints

- `CONFIG.auth.method` stays `'firebase'`.
- Never invent `role: 'admin'` when claim/role is missing (same rule as slim-security).
- Roles MVP only: `admin` | `gerente` | `vendedor`.
- Tenant path: `empresas/{empresaId}/...`; claim `empresaId` must match path segment.
- New UI strings only via i18n keys in `pt`, `en`, `es` (`src/locales/langs/{pt,en,es}/`).
- Do not migrate or rewrite `src/api` / `FormTable` / Empresa / Produto in this plan.
- No Cloud Functions in this plan (claims seeded by Admin SDK script).
- Prefer direct Firebase imports (`firebase/firestore`, `firebase/auth`); no new barrel that re-exports the whole SDK.
- Prefer `yarn` (project lockfile). Gate: `yarn test` then `yarn build` after Tasks 1–6.
- Commit per task; do not commit `.env`, service account JSON, or secrets.

## File map

| File | Responsibility |
|------|----------------|
| `src/auth/firebase-claims.ts` | Pure parse/validate of Custom Claims |
| `src/auth/firebase-claims.test.ts` | Unit tests for claims helpers |
| `src/lib/firebase.ts` | Init Auth + Firestore with persistent local cache |
| `src/auth/context/firebase/auth-provider.tsx` | Attach `empresaId` + claim `role` to context user |
| `src/auth/guard/claims-guard.tsx` | Block dashboard children when claims missing |
| `src/auth/guard/role-based-guard.tsx` | i18n for forbidden copy |
| `src/auth/guard/index.ts` | Re-export ClaimsGuard |
| `src/hooks/use-offline-status.ts` | `isOffline` from `navigator.onLine` + events |
| `src/hooks/use-offline-status.test.ts` | Unit tests for offline derivation helper |
| `src/layouts/components/offline-banner.tsx` | Alert using i18n |
| `src/layouts/dashboard/layout.tsx` | Mount banner; pass `currentRole` into nav |
| `src/layouts/config-nav-dashboard.tsx` | Example `roles` on Auditoria; i18n titles later optional |
| `src/routes/sections/dashboard.tsx` | Wrap ERP routes with ClaimsGuard |
| `src/locales/langs/{pt,en,es}/common.json` | Offline + claims + permission strings |
| `firestore.rules` | Tenant isolation by claim |
| `scripts/set-firebase-claims.mjs` | Dev Admin SDK claim seed |
| `scripts/README-firebase-claims.md` | How to run seed + force token refresh |

---

### Task 1: Firebase claims helpers (TDD)

**Files:**
- Create: `src/auth/firebase-claims.ts`
- Create: `src/auth/firebase-claims.test.ts`

**Interfaces:**
- Consumes: Firebase `ParsedToken` shape as `Record<string, unknown>` (from `getIdTokenResult().claims`)
- Produces:
  - `export type TenantRole = 'admin' | 'gerente' | 'vendedor'`
  - `export const TENANT_ROLES: readonly TenantRole[]`
  - `export type FirebaseTenantClaims = { empresaId: string; role: TenantRole }`
  - `export function isTenantRole(value: unknown): value is TenantRole`
  - `export function parseFirebaseTenantClaims(claims: Record<string, unknown> | null | undefined): FirebaseTenantClaims | null`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  isTenantRole,
  parseFirebaseTenantClaims,
} from './firebase-claims';

describe('isTenantRole', () => {
  it('accepts only admin|gerente|vendedor', () => {
    expect(isTenantRole('admin')).toBe(true);
    expect(isTenantRole('gerente')).toBe(true);
    expect(isTenantRole('vendedor')).toBe(true);
    expect(isTenantRole('super_admin')).toBe(false);
    expect(isTenantRole('')).toBe(false);
    expect(isTenantRole(null)).toBe(false);
  });
});

describe('parseFirebaseTenantClaims', () => {
  it('returns null when empresaId or role missing/invalid', () => {
    expect(parseFirebaseTenantClaims(undefined)).toBeNull();
    expect(parseFirebaseTenantClaims({})).toBeNull();
    expect(parseFirebaseTenantClaims({ empresaId: 'e1' })).toBeNull();
    expect(parseFirebaseTenantClaims({ role: 'admin' })).toBeNull();
    expect(parseFirebaseTenantClaims({ empresaId: 'e1', role: 'boss' })).toBeNull();
    expect(parseFirebaseTenantClaims({ empresaId: '', role: 'admin' })).toBeNull();
  });

  it('returns empresaId + role when valid', () => {
    expect(parseFirebaseTenantClaims({ empresaId: 'emp-1', role: 'vendedor' })).toEqual({
      empresaId: 'emp-1',
      role: 'vendedor',
    });
  });

  it('coerces numeric empresaId to string', () => {
    expect(parseFirebaseTenantClaims({ empresaId: 42, role: 'admin' })).toEqual({
      empresaId: '42',
      role: 'admin',
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test src/auth/firebase-claims.test.ts`

Expected: FAIL (module not found / cannot resolve `./firebase-claims`)

- [ ] **Step 3: Implement helpers**

```ts
export type TenantRole = 'admin' | 'gerente' | 'vendedor';

export const TENANT_ROLES = ['admin', 'gerente', 'vendedor'] as const;

export type FirebaseTenantClaims = {
  empresaId: string;
  role: TenantRole;
};

export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && (TENANT_ROLES as readonly string[]).includes(value);
}

export function parseFirebaseTenantClaims(
  claims: Record<string, unknown> | null | undefined
): FirebaseTenantClaims | null {
  if (!claims) return null;

  const rawEmpresa = claims.empresaId;
  const empresaId =
    typeof rawEmpresa === 'string' || typeof rawEmpresa === 'number'
      ? String(rawEmpresa).trim()
      : '';

  if (!empresaId) return null;
  if (!isTenantRole(claims.role)) return null;

  return { empresaId, role: claims.role };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test src/auth/firebase-claims.test.ts`

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/auth/firebase-claims.ts src/auth/firebase-claims.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add Firebase tenant claims parsers

Pure helpers for empresaId + admin|gerente|vendedor validation before wiring AuthProvider.
EOF
)"
```

---

### Task 2: Firestore persistent local cache

**Files:**
- Modify: `src/lib/firebase.ts`

**Interfaces:**
- Consumes: `CONFIG.firebase.*`, `hasFirebaseConfig`
- Produces: same exports `firebaseApp`, `AUTH`, `DATABASE`, `FIRESTORE` — but `FIRESTORE` must use persistent IndexedDB cache when config exists

**Note:** Spec mentioned `enableIndexedDbPersistence` (DeepSeek). On Firebase JS v13 that API is obsolete. Implement the same requirement with `initializeFirestore` + `persistentLocalCache` + `persistentMultipleTabManager` so multi-tab works without `failed-precondition` single-tab traps.

- [ ] **Step 1: Replace `getFirestore` init with persistent cache**

Replace Firestore creation block so it looks like:

```ts
import type { FirebaseApp } from 'firebase/app';
import type { Auth as AuthType } from 'firebase/auth';
import type { Database as DatabaseType } from 'firebase/database';
import type { Firestore as FirestoreType } from 'firebase/firestore';

import { getAuth } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

import { CONFIG } from 'src/config-global';

const hasFirebaseConfig = Boolean(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);

const firebaseOptions = {
  apiKey: CONFIG.firebase.apiKey,
  authDomain: CONFIG.firebase.authDomain,
  databaseURL: CONFIG.firebase.databaseURL,
  projectId: CONFIG.firebase.projectId,
  storageBucket: CONFIG.firebase.storageBucket,
  messagingSenderId: CONFIG.firebase.messagingSenderId,
  appId: CONFIG.firebase.appId,
  measurementId: CONFIG.firebase.measurementId,
};

export const firebaseApp: FirebaseApp = hasFirebaseConfig
  ? initializeApp(firebaseOptions)
  : ({} as FirebaseApp);

export const AUTH: AuthType = hasFirebaseConfig ? getAuth(firebaseApp) : ({} as AuthType);

export const DATABASE: DatabaseType = hasFirebaseConfig
  ? getDatabase(firebaseApp)
  : ({} as DatabaseType);

function createFirestore(): FirestoreType {
  if (!hasFirebaseConfig) {
    return {} as FirestoreType;
  }

  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    // Already initialized (HMR) or unsupported environment — fall back
    console.warn('Firestore persistent cache init skipped:', error);
    const { getFirestore } = require('firebase/firestore') as typeof import('firebase/firestore');
    return getFirestore(firebaseApp);
  }
}

export const FIRESTORE: FirestoreType = createFirestore();
```

**Do not use `require` in ESM if lint forbids it.** Prefer static import of `getFirestore` and use it only in the catch:

```ts
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

function createFirestore(): FirestoreType {
  if (!hasFirebaseConfig) {
    return {} as FirestoreType;
  }

  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.warn('Firestore persistent cache init skipped:', error);
    return getFirestore(firebaseApp);
  }
}
```

- [ ] **Step 2: Manual smoke**

Run: `yarn dev`

Expected: App boots; no crash in console from Firestore init. Optional: Application → IndexedDB shows Firestore DBs after first authenticated read (verified in Task 5/7).

- [ ] **Step 3: Commit**

```bash
git add src/lib/firebase.ts
git commit -m "$(cat <<'EOF'
feat(firebase): enable Firestore persistent multi-tab cache

Use initializeFirestore + persistentLocalCache so PDV/offline modules can sync via IndexedDB.
EOF
)"
```

---

### Task 3: Attach claims to Firebase AuthProvider

**Files:**
- Modify: `src/auth/context/firebase/auth-provider.tsx`
- Modify: `src/auth/session/erp-session.ts` (only if needed — prefer claims module; keep `resolveUserRole` as fallback for JWT path)
- Modify: `src/auth/session/erp-session.test.ts` only if `resolveUserRole` behavior changes

**Interfaces:**
- Consumes: `parseFirebaseTenantClaims`, `user.getIdTokenResult()`
- Produces: context `user` includes:
  - `empresaId: string | null`
  - `role: string | null` — from claim via `parseFirebaseTenantClaims`, else `null` (never invent admin)
  - `claimsValid: boolean`

- [ ] **Step 1: Update `buildUserState` to read token claims**

In `auth-provider.tsx`, change `buildUserState` to:

```ts
import { parseFirebaseTenantClaims } from 'src/auth/firebase-claims';

async function buildUserState(user: NonNullable<AuthState['user']>) {
  let profileData: Record<string, unknown> = {};

  try {
    const userProfile = doc(FIRESTORE, 'users', user.uid);
    const docSnap = await getDoc(userProfile);
    profileData = (docSnap.data() as Record<string, unknown>) || {};
  } catch (profileError) {
    console.warn('Firebase profile lookup skipped:', profileError);
  }

  const accessToken = await user.getIdToken();
  const tokenResult = await user.getIdTokenResult();
  const tenantClaims = parseFirebaseTenantClaims(
    tokenResult.claims as Record<string, unknown>
  );

  return {
    ...user,
    ...profileData,
    accessToken,
    empresaId: tenantClaims?.empresaId ?? null,
    role: tenantClaims?.role ?? null,
    claimsValid: Boolean(tenantClaims),
  };
}
```

- [ ] **Step 2: Fix memoized user mapping — do not call `resolveUserRole` in a way that overrides claim null**

Replace the memoized user branch so role comes from built state (already set), not a invented fallback:

```ts
user: state.user
  ? {
      ...state.user,
      id: state.user?.uid,
      accessToken: state.user?.accessToken,
      displayName: state.user?.displayName,
      photoURL: state.user?.photoURL,
      role: state.user?.role ?? null,
      empresaId: state.user?.empresaId ?? null,
      claimsValid: Boolean(state.user?.claimsValid),
    }
  : null,
```

Remove unused `resolveUserRole` import from this file if no longer referenced.

- [ ] **Step 3: Typecheck**

Run: `yarn tsc --noEmit`

Expected: exit 0 (or only pre-existing unrelated errors — fix any new ones in files you touched)

- [ ] **Step 4: Commit**

```bash
git add src/auth/context/firebase/auth-provider.tsx
git commit -m "$(cat <<'EOF'
feat(auth): expose Firebase empresaId and role from custom claims

AuthProvider reads getIdTokenResult claims; missing claims stay null without inventing admin.
EOF
)"
```

---

### Task 4: ClaimsGuard + i18n strings

**Files:**
- Create: `src/auth/guard/claims-guard.tsx`
- Modify: `src/auth/guard/index.ts`
- Modify: `src/auth/guard/role-based-guard.tsx`
- Modify: `src/routes/sections/dashboard.tsx`
- Modify: `src/locales/langs/pt/common.json`
- Modify: `src/locales/langs/en/common.json`
- Modify: `src/locales/langs/es/common.json`

**Interfaces:**
- Consumes: `useAuthContext()`, `useTranslate('common')`
- Produces: `ClaimsGuard` — if authenticated Firebase user with `claimsValid === false`, show blocking message; else render children. While `loading`, render null or existing splash pattern from AuthGuard.

- [ ] **Step 1: Add i18n keys to all three locales**

Add under root of each `common.json` (keep existing keys):

`pt/common.json`:
```json
"offline": {
  "mode": "Você está offline. Dados podem vir do cache local.",
  "syncPending": "Sincronizando com a nuvem…"
},
"claims": {
  "missingTitle": "Conta sem empresa",
  "missingBody": "Seu usuário não tem empresaId/role configurados. Peça ao administrador para definir as permissões e entre novamente.",
  "signOut": "Sair"
},
"permission": {
  "deniedTitle": "Sem permissão",
  "deniedBody": "Você não tem permissão para acessar esta página."
}
```

`en/common.json`:
```json
"offline": {
  "mode": "You are offline. Data may come from the local cache.",
  "syncPending": "Syncing with the cloud…"
},
"claims": {
  "missingTitle": "Account has no company",
  "missingBody": "Your user has no empresaId/role claims. Ask an admin to set permissions, then sign in again.",
  "signOut": "Sign out"
},
"permission": {
  "deniedTitle": "Permission denied",
  "deniedBody": "You do not have permission to access this page."
}
```

`es/common.json`:
```json
"offline": {
  "mode": "Estás sin conexión. Los datos pueden venir de la caché local.",
  "syncPending": "Sincronizando con la nube…"
},
"claims": {
  "missingTitle": "Cuenta sin empresa",
  "missingBody": "Tu usuario no tiene claims empresaId/role. Pide al administrador que configure permisos e inicia sesión de nuevo.",
  "signOut": "Salir"
},
"permission": {
  "deniedTitle": "Sin permiso",
  "deniedBody": "No tienes permiso para acceder a esta página."
}
```

- [ ] **Step 2: Create `ClaimsGuard`**

```tsx
import type { Theme, SxProps } from '@mui/material/styles';

import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useTranslate } from 'src/locales';

import { toast } from 'src/components/snackbar';

import { useAuthContext } from 'src/auth/hooks';
import { signOut } from 'src/auth/context/firebase/action';

// ----------------------------------------------------------------------

type Props = {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
};

export function ClaimsGuard({ children, sx }: Props) {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user, loading, authenticated } = useAuthContext();

  if (loading) {
    return null;
  }

  if (!authenticated) {
    return <>{children}</>;
  }

  if (user?.claimsValid) {
    return <>{children}</>;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace(paths.auth.firebase.signIn);
    } catch (error) {
      console.error(error);
      toast.error(String(error));
    }
  };

  return (
    <Container sx={{ textAlign: 'center', py: 10, ...sx }}>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('claims.missingTitle')}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3 }}>
        {t('claims.missingBody')}
      </Typography>
      <Button variant="contained" onClick={handleSignOut}>
        {t('claims.signOut')}
      </Button>
    </Container>
  );
}
```

- [ ] **Step 3: Export from `src/auth/guard/index.ts`**

```ts
export * from './auth-guard';
export * from './guest-guard';
export * from './role-based-guard';
export * from './claims-guard';
```

- [ ] **Step 4: Wrap dashboard routes**

In `src/routes/sections/dashboard.tsx`, import `ClaimsGuard` and wrap the element tree that already sits inside `AuthGuard` (children of AuthGuard), e.g.:

```tsx
<AuthGuard>
  <ClaimsGuard>
    <DashboardLayout>
      <Suspense fallback={...}>
        <Outlet />
      </Suspense>
    </DashboardLayout>
  </ClaimsGuard>
</AuthGuard>
```

Match the file’s existing structure; do not duplicate layouts.

- [ ] **Step 5: i18n `RoleBasedGuard` copy**

Update `role-based-guard.tsx` titles to use `useTranslate('common')` with `permission.deniedTitle` / `permission.deniedBody` instead of hardcoded English.

- [ ] **Step 6: Manual check**

Sign in with a Firebase user **without** claims → see missing-claims screen (i18n). Sign out works → `/auth/firebase/sign-in`.

- [ ] **Step 7: Commit**

```bash
git add src/auth/guard/claims-guard.tsx src/auth/guard/index.ts src/auth/guard/role-based-guard.tsx src/routes/sections/dashboard.tsx src/locales/langs/pt/common.json src/locales/langs/en/common.json src/locales/langs/es/common.json
git commit -m "$(cat <<'EOF'
feat(auth): gate dashboard on Firebase tenant claims

Block users missing empresaId/role and localize permission/offline claim copy.
EOF
)"
```

---

### Task 5: Offline status hook + banner

**Files:**
- Create: `src/auth/offline-status.ts` (pure helper — easier to unit test than the hook)
- Create: `src/auth/offline-status.test.ts`
- Create: `src/hooks/use-offline-status.ts`
- Create: `src/layouts/components/offline-banner.tsx`
- Modify: `src/layouts/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `navigator.onLine`, `online`/`offline` window events; i18n `offline.mode`
- Produces:
  - `export function readNavigatorOnline(online: boolean | undefined): boolean`
  - `useOfflineStatus(): { isOffline: boolean }`
  - `OfflineBanner` component

- [ ] **Step 1: Failing tests for pure helper**

```ts
import { describe, expect, it } from 'vitest';

import { readNavigatorOnline } from './offline-status';

describe('readNavigatorOnline', () => {
  it('treats undefined as online (SSR / unknown)', () => {
    expect(readNavigatorOnline(undefined)).toBe(true);
  });

  it('mirrors boolean navigator.onLine', () => {
    expect(readNavigatorOnline(true)).toBe(true);
    expect(readNavigatorOnline(false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `yarn test src/auth/offline-status.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement helper + hook + banner**

`src/auth/offline-status.ts`:
```ts
export function readNavigatorOnline(online: boolean | undefined): boolean {
  if (online === undefined) return true;
  return online;
}
```

`src/hooks/use-offline-status.ts`:
```ts
import { useEffect, useState } from 'react';

import { readNavigatorOnline } from 'src/auth/offline-status';

export function useOfflineStatus(): { isOffline: boolean } {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    return !readNavigatorOnline(navigator.onLine);
  });

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    setIsOffline(!readNavigatorOnline(navigator.onLine));

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOffline };
}
```

`src/layouts/components/offline-banner.tsx`:
```tsx
import Alert from '@mui/material/Alert';

import { useTranslate } from 'src/locales';

import { useOfflineStatus } from 'src/hooks/use-offline-status';

export function OfflineBanner() {
  const { t } = useTranslate('common');
  const { isOffline } = useOfflineStatus();

  if (!isOffline) {
    return null;
  }

  return (
    <Alert severity="warning" sx={{ borderRadius: 0 }}>
      {t('offline.mode')}
    </Alert>
  );
}
```

- [ ] **Step 4: Mount banner in dashboard layout**

In `src/layouts/dashboard/layout.tsx`, replace the hidden info `Alert` in `slots.topArea` with `<OfflineBanner />` (import from `../components/offline-banner`).

- [ ] **Step 5: Run unit tests**

Run: `yarn test src/auth/offline-status.test.ts`

Expected: PASS

- [ ] **Step 6: Manual check**

DevTools → Network → Offline → warning banner appears with PT (or current lang) copy. Back online → banner hides.

- [ ] **Step 7: Commit**

```bash
git add src/auth/offline-status.ts src/auth/offline-status.test.ts src/hooks/use-offline-status.ts src/layouts/components/offline-banner.tsx src/layouts/dashboard/layout.tsx
git commit -m "$(cat <<'EOF'
feat(ui): show i18n offline banner in dashboard

Wire navigator online/offline into layout Alert for PDV-ready cache awareness.
EOF
)"
```

---

### Task 6: Wire nav `currentRole` + example role filters

**Files:**
- Modify: `src/layouts/dashboard/layout.tsx`
- Modify: `src/layouts/dashboard/nav-vertical.tsx` (only if `slotProps` not forwarded — verify `{...other}` already passes through)
- Modify: `src/layouts/dashboard/nav-horizontal.tsx` / `nav-mobile.tsx` same check
- Modify: `src/layouts/config-nav-dashboard.tsx`

**Interfaces:**
- Consumes: `useAuthContext().user?.role`
- Produces: nav `slotProps={{ currentRole: user?.role ?? undefined }}` on vertical/horizontal/mobile sections

Nav item type already has `roles?: string[]` and filters in `nav-list.tsx`.

- [ ] **Step 1: Pass `currentRole` from layout**

In `DashboardLayout`:

```tsx
import { useAuthContext } from 'src/auth/hooks';

// inside component:
const { user } = useAuthContext();
const currentRole = typeof user?.role === 'string' ? user.role : undefined;

const navSlotProps = { currentRole };
```

Pass `slotProps={navSlotProps}` into `NavVertical`, `NavHorizontal`, and `NavMobile` (each already accepts `NavSectionProps`).

- [ ] **Step 2: Tag Auditoria for admin/gerente only (example)**

In `config-nav-dashboard.tsx`:

```ts
{
  title: 'Auditoria',
  path: paths.dashboard.auditoria.root,
  icon: ICONS.lock,
  roles: ['admin', 'gerente'],
  children: [{ title: 'Eventos', path: paths.dashboard.auditoria.eventosAuditoria, roles: ['admin', 'gerente'] }],
},
```

Leave Administração / Estoque without `roles` so all tenant roles still see them (HTTP ERP coexistence).

- [ ] **Step 3: Manual check**

User claim `role: vendedor` → Auditoria hidden. `admin` / `gerente` → visible.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/dashboard/layout.tsx src/layouts/config-nav-dashboard.tsx src/layouts/dashboard/nav-mobile.tsx src/layouts/dashboard/nav-horizontal.tsx
git commit -m "$(cat <<'EOF'
feat(nav): filter dashboard items by Firebase claim role

Pass currentRole into nav slotProps and restrict Auditoria to admin/gerente.
EOF
)"
```

(Only add files you actually changed.)

---

### Task 7: Firestore rules + claims seed script

**Files:**
- Create: `firestore.rules`
- Create: `scripts/set-firebase-claims.mjs`
- Create: `scripts/README-firebase-claims.md`
- Modify: `package.json` — add script `"claims:set": "node scripts/set-firebase-claims.mjs"` and optional devDependency `firebase-admin` **only if** you install it for the script (document either path)

**Interfaces:**
- Consumes: service account path via `GOOGLE_APPLICATION_CREDENTIALS`, CLI args `uid`, `empresaId`, `role`
- Produces: `auth.setCustomUserClaims(uid, { empresaId, role })`

- [ ] **Step 1: Write `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function tenantRoleOk() {
      return request.auth.token.role in ['admin', 'gerente', 'vendedor'];
    }

    function sameEmpresa(empresaId) {
      return request.auth.token.empresaId == empresaId;
    }

    match /empresas/{empresaId}/{document=**} {
      allow read, write: if signedIn() && sameEmpresa(empresaId) && tenantRoleOk();
    }

    match /empresas/{empresaId} {
      allow read, write: if signedIn() && sameEmpresa(empresaId) && tenantRoleOk();
    }

    // Legacy kit profile path — authenticated owner only (optional keep)
    match /users/{userId} {
      allow read, write: if signedIn() && request.auth.uid == userId;
    }
  }
}
```

- [ ] **Step 2: Write seed script**

`scripts/set-firebase-claims.mjs`:

```js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

const TENANT_ROLES = new Set(['admin', 'gerente', 'vendedor']);

function usage() {
  console.log(`Usage:
  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json yarn claims:set -- --uid <UID> --empresaId <ID> --role <admin|gerente|vendedor>

After success, the user must refresh the ID token (sign out/in or getIdToken(true)).`);
}

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const uid = arg('uid');
const empresaId = arg('empresaId');
const role = arg('role');

if (!uid || !empresaId || !role || !TENANT_ROLES.has(role)) {
  usage();
  process.exit(1);
}

if (!getApps().length) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path.');
    process.exit(1);
  }
  initializeApp({
    credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))),
  });
}

const auth = getAuth();
await auth.setCustomUserClaims(uid, { empresaId: String(empresaId), role });
console.log('Claims set:', { uid, empresaId: String(empresaId), role });
console.log('User must refresh ID token before ClaimsGuard will pass.');
```

- [ ] **Step 3: README**

`scripts/README-firebase-claims.md` — document:
1. Create Firebase service account; download JSON; **never commit it**.
2. `yarn add -D firebase-admin` once (if not in package.json).
3. Run claims:set command.
4. User signs out/in (or call `getIdToken(true)`).
5. Deploy rules: `firebase deploy --only firestore:rules` (if Firebase CLI linked).

- [ ] **Step 4: Add npm script**

In `package.json` scripts:
```json
"claims:set": "node scripts/set-firebase-claims.mjs"
```

Install if needed: `yarn add -D firebase-admin`

- [ ] **Step 5: Manual acceptance (with real project)**

1. Create Firestore doc `empresas/{empresaId}` `{ "nome": "Demo", "ativo": true }`.
2. Set claims for a test uid.
3. Sign in → ClaimsGuard passes; `user.empresaId` matches.
4. Rules deny read of another `empresas/otherId`.
5. DevTools Offline → banner; after one online read, cached doc still readable.

- [ ] **Step 6: Commit (no secrets)**

```bash
git add firestore.rules scripts/set-firebase-claims.mjs scripts/README-firebase-claims.md package.json yarn.lock
git commit -m "$(cat <<'EOF'
feat(firebase): add tenant firestore rules and claims seed script

Isolate empresas/{empresaId} by auth token claims for the offline PDV foundation.
EOF
)"
```

---

### Task 8: Verification gate

**Files:** none new

- [ ] **Step 1: Unit tests**

Run: `yarn test`

Expected: PASS (including `firebase-claims`, `offline-status`, existing `erp-session`)

- [ ] **Step 2: Lint touched areas**

Run: `yarn eslint src/auth/firebase-claims.ts src/auth/context/firebase/auth-provider.tsx src/auth/guard/claims-guard.tsx src/hooks/use-offline-status.ts src/layouts/components/offline-banner.tsx src/lib/firebase.ts`

Expected: 0 errors

- [ ] **Step 3: Production build**

Run: `yarn build`

Expected: `tsc && vite build` succeeds

- [ ] **Step 4: Final commit only if verification fixed files**

If lint/build required fixes, commit those fixes with message:
`fix: satisfy lint/build after tenant offline foundation`

Otherwise no empty commit.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Persistent offline Firestore | Task 2 (`persistentLocalCache`) |
| Offline banner i18n | Tasks 4 (keys) + 5 |
| Claims `empresaId` + `role` on session | Tasks 1 + 3 |
| Block missing claims | Task 4 |
| Rules tenant isolation | Task 7 |
| Nav / RoleGuard by role | Tasks 4 (i18n RoleBasedGuard) + 6 |
| Seed claims without Cloud Functions | Task 7 |
| Keep FormTable/HTTP untouched | Global constraint; no task edits those |
| pt/en/es strings | Task 4 |
| No invented admin role | Tasks 1 + 3 |
| Vercel: narrow offline boolean / direct imports | Tasks 2 + 5 |

**Persistence API note:** Spec text said `enableIndexedDbPersistence`; plan uses supported v13 API that fulfills the same offline requirement (documented in Task 2).

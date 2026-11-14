# Design: Minimals 6.0.1 slim + security (ERP shell)

**Date:** 2026-11-14  
**Status:** Approved for implementation planning  
**Repo:** `fresfj/react-front-erp` (`@minimal-kit/vite-ts` **6.0.1**)  
**Approach:** Slim in place — aggressive template removal, then security hardening; Minimals **7.x deferred**

## Context

Local kit is **Minimals Vite TypeScript v6.0.1** (released 2024-06-16). Official current kit is **v7.7.0** (2026-05-11: Vite 8, MUI 9, React 19). Full Minimals source is commercial (MUI Store / minimals.cc), not a public GitHub kit. This project has no 7.x zip available now and will **not** purchase/upgrade in this cycle.

Custom ERP value lives in `src/api`, `src/core`, and pages under `sistema` / `inventario` / `auditoria` / `usuarios`, with JWT auth against a backend (`VITE_SERVER_URL`).

## Goals

1. Architecture first: clear vendor shell vs ERP product surface.
2. Aggressively remove unused Minimals demos and unused auth providers.
3. Harden front-end auth/session/context handling.
4. Document a future 6.0.1 → 7.7.0 playbook without executing it.

## Non-goals

- Upgrading to React 19, MUI 7/9, or Vite 8 in this cycle.
- Rewriting theme/layouts from scratch.
- Backend implementation (only a validation checklist for the API team).
- Extracting ERP into a new repo or `src/erp` mega-move.

## Architecture

| Layer | Location | Rule |
|-------|----------|------|
| Shell UI | `src/theme`, `src/layouts`, used `src/components` | Vendor Minimals — do not rewrite; delete only unused |
| Auth | `src/auth` — **JWT only** | Single provider + real guards |
| ERP | `src/api`, `src/core`, ERP pages + dashboard routes | Product code |
| Integration | `src/utils/axios`, `src/core/services/serviceRequest` | Single HTTP path + tenant context |

**Boundary:** Business domain stays in `api` / `core` / ERP pages. Theme and layouts remain “vendor” so a future 7.x overlay touches fewer product files.

**Auth config:** Keep `CONFIG.auth.method: 'jwt'`. Remove Amplify, Firebase, Supabase, and Auth0 code paths and dependencies.

**Entry route:** After slim, `/` redirects to `CONFIG.auth.redirectPath` (dashboard) when authenticated policy requires it — do not keep the marketing `HomePage` as the default entry unless product explicitly needs it.

**Session storage keys (canonical):** `jwt_access_token` (Bearer) and `user` (ERP tenant/profile JSON). Both cleared on logout and 401.

## Removals (aggressive slim)

### Keep

- JWT auth (context, pages, sign-in/sign-up views)
- ERP routes/pages: `sistema`, `inventario`, `auditoria`, `usuarios`
- `src/api`, `src/core`
- Dashboard layout pieces used by ERP
- Theme + shared components still imported by ERP/layout (table, hook-form, upload, etc.)
- Error pages (403 / 404 / 500)

### Remove

- Auth providers and UI: Amplify, Firebase, Supabase, Auth0
- `auth-demo` routes and pages
- `sections/_examples`, `pages/components`, `componentsRoutes`
- Marketing / showcase surfaces not required by ERP (e.g. template home marketing, about, pricing, payment, faqs, contact, shop/blog demos) — **only after import inventory confirms zero ERP use**
- Demo entries in `config-nav-dashboard` (Ecommerce, Banking, User demo, Order, etc.); nav shows ERP only
- Paths and `_mock` assets used only by demos
- Orphan dependencies after purge (`aws-amplify`, `firebase`, `@supabase/supabase-js`, `@auth0/auth0-react`, etc.)

### Safe process

1. Import inventory: ERP and remaining shell → what they still reference.
2. Cut routes and nav first.
3. Delete unused folders.
4. `yarn build` + smoke: login + 2–3 ERP screens.
5. Commit in slices (auth / demos / nav / deps).

Do **not** delete shared `src/components/*` without a zero-usage check.

## Security

| Risk | Change |
|------|--------|
| `role` defaults to `'admin'` when missing | Missing role → unauthorized (never invent admin) |
| Tenant fields (`ideEmpr`, etc.) from `sessionStorage` only | Single typed session source; document that **backend must validate** tenant/user claims |
| Duplicated `defaultParams` in `axios.ts` and `serviceRequest.ts` | One shared typed helper; fail clearly if session incomplete |
| `tokenExpired` via `setTimeout` + `alert` | Clean logout + redirect; axios **401** interceptor clears session |
| Multi-auth bundle | Eliminated in slim phase |
| Weak / unused role guard | `AuthGuard` on all ERP dashboard routes; `RoleBasedGuard` on modules that already have backend roles (usuarios, sistema admin screens). If roles are not yet returned by API, wire AuthGuard only and document RoleBasedGuard as follow-up — do not invent roles on the client |

### Front-end scope

- Typed session: access token + user; clear both on logout and 401.
- Axios 401 → clear session → redirect to JWT sign-in.
- Remove admin role fallback.
- Unify tenant/context params helper.
- Guards on sensitive ERP routes.

### Backend checklist (out of scope to implement here)

- Validate JWT on every protected endpoint.
- Derive or verify `ideEmpr` / `ideSucu` / `ideUsua` / `idePerf` server-side; do not trust client body alone.
- Enforce permissions for sensitive ERP actions.

### Manual verification

- Login success; reload with valid token.
- Expired / invalid token → login.
- Forced 401 → session cleared.
- Route without required role → denied.
- Logout clears storage keys used by auth and ERP context.

## Future upgrade playbook (7.x — not this cycle)

When Plus/Extended zip **7.7.0** (or later) is available:

1. Branch `upgrade/minimals-7` from the slimmed 6.0.1 tree.
2. Selectively overlay vendor: `theme`, used `layouts` / `components`, tooling configs — **never** overwrite `api`, `core`, or ERP pages blindly.
3. Prefer stepped majors if needed (document checkpoints: last 6.x → 7.0 → 7.7), with build + smoke each step.
4. Re-apply ERP security patches if vendor files overwrite them.
5. Smoke: JWT login + critical ERP screens.

Version gap snapshot at design time:

| Item | This repo | Official kit |
|------|-----------|--------------|
| Kit | 6.0.1 | 7.7.0 |
| React | 18.3 | 19 |
| MUI | 5.15 | 9 |
| Vite | 5.3 | 8 |

## Success criteria (this cycle)

- Production build succeeds without demo/auth-extra routes.
- Dashboard nav is ERP-only.
- No default `admin` role; 401 clears session.
- Tenant/context params unified in one helper.
- This design + 7.x playbook lives under `docs/superpowers/specs/` (upgrade not executed).

## Implementation order

1. Inventory imports and classify vendor vs ERP.
2. Slim: auth extras → demos/routes/nav → orphan deps.
3. Security: session helper, interceptor, role fallback, guards.
4. Verify build + smoke checklist.
5. Stop; upgrade only when 7.x package exists.

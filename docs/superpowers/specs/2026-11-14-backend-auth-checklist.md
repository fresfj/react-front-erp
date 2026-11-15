# Backend auth checklist (ERP)

## Current API (client inspection)

- **`POST /api/auth/login`** — client persists `ide_empr`, `ide_sucu`, `ide_usua`, `ide_perf`, `login`, `nom_empr`, `ip`; no `role` field is stored or used.
- **`GET /api/auth/check-status`** — user object is merged into auth context as returned; `resolveUserRole` only accepts a non-empty string on `user.role` (never maps `ide_perf` to a role).
- **Front guard policy** — dashboard ERP routes remain **AuthGuard-only**. **RoleBasedGuard on `usuarios` is deferred** until login/check-status return an explicit `role` (or the client documents a stable role string contract).

## Backend follow-up

- Validate JWT on every protected endpoint.
- Derive/verify `ideEmpr`, `ideSucu`, `ideUsua`, `idePerf` server-side; do not trust client body alone.
- Return an explicit `role` (or permission list) on login / check-status if front `RoleBasedGuard` should activate (e.g. stable values such as `admin` | `user`, agreed with backend).
- Enforce permissions for usuarios / sistema / inventario mutations.

## Enabling RoleBasedGuard (when ready)

1. Add `role` to login and check-status JSON (`user.role`).
2. Confirm allowed values with backend (do not infer from `ide_perf` on the client).
3. Wrap `dashboard/usuarios` children in `RoleBasedGuard` with `acceptRoles` matching those values.
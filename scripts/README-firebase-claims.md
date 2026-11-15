# Firebase custom claims (tenant RBAC)

Use this script to set `empresaId` and `role` on a Firebase Auth user. The ERP reads these claims from the ID token (`ClaimsGuard`, Firestore rules).

## Prerequisites

1. **Service account** — In [Firebase Console](https://console.firebase.google.com/) → Project settings → Service accounts → Generate new private key. Save the JSON locally (e.g. `./serviceAccount.json`). **Never commit this file**; keep it out of git and CI artifacts.
2. **Admin SDK** — Install once: `yarn add -D firebase-admin`
3. **Firebase user UID** — From Authentication → Users, copy the UID for the test account.

## Set claims

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
  yarn claims:set -- --uid YOUR_UID --empresaId YOUR_EMPRESA_ID --role admin
```

Roles: `admin`, `gerente`, `vendedor`.

## After running the script

Custom claims are embedded in the **ID token**. The signed-in user must refresh it:

- Sign out and sign in again in the app, or
- In code: `await auth.currentUser?.getIdToken(true)`

Until the token is refreshed, `ClaimsGuard` will still see the old claims.

## Deploy Firestore rules

Rules live in `firestore.rules` at the repo root. With the [Firebase CLI](https://firebase.google.com/docs/cli) linked to this project:

```bash
firebase deploy --only firestore:rules
```

Ensure `firebase.json` points `firestore.rules` to this file if you add CLI config later.

## Manual smoke test

1. Create `empresas/{empresaId}` with `{ "nome": "Demo", "ativo": true }`.
2. Run `claims:set` for a test user with matching `empresaId`.
3. Sign in → claims match; cross-tenant `empresas/otherId` reads should be denied by rules.
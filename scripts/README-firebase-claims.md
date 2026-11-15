# Firebase custom claims (tenant RBAC)

Use these scripts to set `enterpriseId` and `role` on a Firebase Auth user. The ERP reads these claims from the ID token (`ClaimsGuard`, Firestore rules).

## Prerequisites

1. **Service account** — In [Firebase Console](https://console.firebase.google.com/) → Project settings → Service accounts → Generate new private key. Save the JSON locally (e.g. `./serviceAccount.json`). **Never commit this file**; keep it out of git and CI artifacts.
2. **Admin SDK** — Install once: `yarn add -D firebase-admin`
3. **Firebase user** — From Authentication → Users, copy the UID for targeted updates, or use an email for bootstrap.

## Bootstrap enterprise + admin claims

Creates or updates `enterprises/{enterpriseId}` and sets claims on the user found by email.

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
  yarn claims:bootstrap -- \
    --email YOU@example.com \
    --enterpriseId YOUR_ENTERPRISE_ID \
    --enterpriseName "My Enterprise" \
    --role admin
```

Roles: `admin`, `gestor`, `operador`.

## Set claims only (existing user)

```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
  yarn claims:set -- --uid YOUR_UID --enterpriseId YOUR_ENTERPRISE_ID --role admin
```

Roles: `admin`, `gestor`, `operador`.

## After running a script

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

1. Run `claims:bootstrap` (or create `enterprises/{enterpriseId}` with `{ "name": "Demo", "active": true }` and `claims:set`).
2. Sign in → claims match; cross-tenant `enterprises/otherId` reads should be denied by rules.
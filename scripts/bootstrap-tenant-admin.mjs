/**
 * Bootstrap: lookup Firebase user by email → create enterprises/{enterpriseId} → set custom claims.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     yarn claims:bootstrap -- --email fresfj@gmail.com --enterpriseId ent-fresfj \
 *     --enterpriseName "Empresa Fresfj" --role admin
 *
 * Service account must belong to the same project as VITE_FIREBASE_PROJECT_ID.
 * Never commit the JSON key.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const TENANT_ROLES = new Set(['admin', 'gestor', 'operador']);

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function usage() {
  console.log(`Usage:
  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \\
    yarn claims:bootstrap -- --email <email> --enterpriseId <id> [--enterpriseName <name>] [--role <admin|gestor|operador>]

Example:
  GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/checkout-shop-b5bb3-firebase-adminsdk-….json \\
    yarn claims:bootstrap -- --email fresfj@gmail.com --enterpriseId ent-fresfj \\
      --enterpriseName "Empresa Fresfj" --role admin
`);
}

const email = arg('email');
const enterpriseId = arg('enterpriseId');
const enterpriseName = arg('enterpriseName') || 'Admin Enterprise';
const role = arg('role') || 'admin';

if (!email || !enterpriseId || !TENANT_ROLES.has(role)) {
  usage();
  process.exit(1);
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the service account JSON for your Firebase project.');
  process.exit(1);
}

const sa = JSON.parse(readFileSync(credPath, 'utf8'));
console.log('Using service account project:', sa.project_id);

if (!getApps().length) {
  initializeApp({
    credential: cert(sa),
    projectId: sa.project_id,
  });
}

const auth = getAuth();
const db = getFirestore();

const user = await auth.getUserByEmail(email);
console.log('User found:', { uid: user.uid, email: user.email });

await db.doc(`enterprises/${enterpriseId}`).set(
  {
    name: enterpriseName,
    active: true,
    adminUid: user.uid,
    adminEmail: user.email,
    updatedAt: new Date().toISOString(),
  },
  { merge: true }
);
console.log('Firestore enterprise upserted:', `enterprises/${enterpriseId}`);

await auth.setCustomUserClaims(user.uid, { enterpriseId: String(enterpriseId), role });
console.log('Claims set:', { uid: user.uid, enterpriseId, role });
console.log('Done. Sign out and sign in again (or getIdToken(true)) so ClaimsGuard sees the new token.');
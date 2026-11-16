/**
 * Set platformAdmin: true on a user without dropping existing tenant claims.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     yarn claims:platform-admin -- --email fresfj@gmail.com
 *   # or --uid <UID>
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function usage() {
  console.log(`Usage:
  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \\
    yarn claims:platform-admin -- --email <email>
  # or --uid <UID>

Merges platformAdmin: true into existing custom claims (keeps enterpriseId/role).
`);
}

const email = arg('email');
const uidArg = arg('uid');

if (!email && !uidArg) {
  usage();
  process.exit(1);
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the service account JSON path.');
  console.error(
    'Download: https://console.firebase.google.com/project/checkout-shop-b5bb3/settings/serviceaccounts/adminsdk'
  );
  console.error('Save as ./serviceAccount.json (gitignored), then re-run.');
  process.exit(1);
}

let sa;
try {
  sa = JSON.parse(readFileSync(credPath, 'utf8'));
} catch (error) {
  if (error && error.code === 'ENOENT') {
    console.error(`File not found: ${credPath}`);
    console.error(
      'Download SA for checkout-shop-b5bb3:\n  https://console.firebase.google.com/project/checkout-shop-b5bb3/settings/serviceaccounts/adminsdk'
    );
    console.error('Then:\n  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json yarn claims:platform-admin -- --email YOU@example.com');
    process.exit(1);
  }
  throw error;
}

if (sa.project_id && sa.project_id !== 'checkout-shop-b5bb3') {
  console.warn(
    `Warning: SA project_id=${sa.project_id} (expected checkout-shop-b5bb3). Continuing anyway.`
  );
}

if (!getApps().length) {
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
}

const auth = getAuth();
const user = email ? await auth.getUserByEmail(email) : await auth.getUser(uidArg);
const existing = user.customClaims || {};
const next = { ...existing, platformAdmin: true };

await auth.setCustomUserClaims(user.uid, next);
console.log('Claims updated:', { uid: user.uid, email: user.email, claims: next });
console.log('Sign out/in (or getIdToken(true)) so the client sees platformAdmin.');

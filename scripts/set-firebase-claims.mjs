import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

const TENANT_ROLES = new Set(['admin', 'gestor', 'operador']);

function usage() {
  console.log(`Usage:
  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json yarn claims:set -- --uid <UID> --enterpriseId <ID> --role <admin|gestor|operador>

After success, the user must refresh the ID token (sign out/in or getIdToken(true)).`);
}

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const uid = arg('uid');
const enterpriseId = arg('enterpriseId');
const role = arg('role');

if (!uid || !enterpriseId || !role || !TENANT_ROLES.has(role)) {
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
await auth.setCustomUserClaims(uid, { enterpriseId: String(enterpriseId), role });
console.log('Claims set:', { uid, enterpriseId: String(enterpriseId), role });
console.log('User must refresh ID token before ClaimsGuard will pass.');
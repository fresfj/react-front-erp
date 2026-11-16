import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';

import { FIRESTORE, FUNCTIONS } from 'src/lib/firebase';

import type { TenantRole } from 'src/auth/firebase-claims';

// ----------------------------------------------------------------------

export type Enterprise = {
  id: string;
  name: string;
  active: boolean;
  adminEmail?: string | null;
  adminUid?: string | null;
  document?: string;
  tradeName?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  createdAt?: string;
  updatedAt?: string;
};

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

export type EnterpriseMember = {
  uid: string;
  email?: string;
  role?: TenantRole | string;
  displayName?: string;
  invitedAt?: string;
  updatedAt?: string;
};

function mapEnterprise(id: string, data: Record<string, unknown>): Enterprise {
  return {
    id,
    name: String(data.name ?? ''),
    active: data.active !== false,
    adminEmail: data.adminEmail != null ? String(data.adminEmail) : null,
    adminUid: data.adminUid != null ? String(data.adminUid) : null,
    document: optStr(data.document),
    tradeName: optStr(data.tradeName),
    phone: optStr(data.phone),
    zipCode: optStr(data.zipCode),
    address: optStr(data.address),
    addressNumber: optStr(data.addressNumber),
    complement: optStr(data.complement),
    neighborhood: optStr(data.neighborhood),
    city: optStr(data.city),
    state: optStr(data.state),
    createdAt: data.createdAt != null ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
  };
}

export type EnterpriseAddressInput = {
  document?: string;
  tradeName?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

export async function listEnterprisesClient(): Promise<Enterprise[]> {
  const snap = await getDocs(query(collection(FIRESTORE, 'enterprises'), orderBy('name')));
  return snap.docs.map((item) => mapEnterprise(item.id, item.data() as Record<string, unknown>));
}

export async function getEnterprise(id: string): Promise<Enterprise | null> {
  const snap = await getDoc(doc(FIRESTORE, 'enterprises', id));
  if (!snap.exists()) return null;
  return mapEnterprise(snap.id, snap.data() as Record<string, unknown>);
}

export async function listEnterpriseMembersClient(
  enterpriseId: string
): Promise<EnterpriseMember[]> {
  const snap = await getDocs(collection(FIRESTORE, 'enterprises', enterpriseId, 'members'));
  return snap.docs.map((item) => {
    const data = item.data() as Record<string, unknown>;
    return {
      uid: item.id,
      email: data.email != null ? String(data.email) : undefined,
      role: data.role != null ? String(data.role) : undefined,
      displayName: data.displayName != null ? String(data.displayName) : undefined,
      invitedAt: data.invitedAt != null ? String(data.invitedAt) : undefined,
      updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    };
  });
}

async function call<TReq extends object, TRes>(name: string, data: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq, TRes>(FUNCTIONS, name);
  const result = await fn(data);
  return result.data;
}

export function createEnterprise(
  input: {
    id: string;
    name: string;
    adminEmail?: string;
  } & EnterpriseAddressInput
) {
  return call<typeof input, Enterprise>('createEnterprise', input);
}

export function updateEnterprise(
  input: {
    id: string;
    name?: string;
    active?: boolean;
    adminEmail?: string;
  } & EnterpriseAddressInput
) {
  return call<typeof input, Enterprise>('updateEnterprise', input);
}

export function inviteMember(input: {
  email: string;
  enterpriseId: string;
  role: TenantRole;
  tempPassword?: string;
  displayName?: string;
  permissions?: string[];
}) {
  return call<
    typeof input,
    { uid: string; email: string; enterpriseId: string; role: string; created: boolean }
  >('inviteMember', input);
}

export function setMemberClaims(input: {
  uid: string;
  enterpriseId: string;
  role: TenantRole;
  permissions?: string[];
}) {
  return call<typeof input, { uid: string; enterpriseId: string; role: string }>(
    'setMemberClaims',
    input
  );
}

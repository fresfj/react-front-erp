import { doc, getDoc, setDoc } from 'firebase/firestore';

import { enterpriseCollection } from './paths';

// ----------------------------------------------------------------------

export type MemberProfile = {
  uid: string;
  displayName?: string;
  phone?: string;
  photoURL?: string;
  updatedAt: string;
};

export type MemberProfileInput = {
  displayName?: string;
  phone?: string;
  photoURL?: string;
};

function memberRef(enterpriseId: string, uid: string) {
  return doc(enterpriseCollection(enterpriseId, 'members'), uid);
}

function mapMember(uid: string, data: Record<string, unknown>): MemberProfile {
  return {
    uid,
    displayName: data.displayName != null ? String(data.displayName) : undefined,
    phone: data.phone != null ? String(data.phone) : undefined,
    photoURL: data.photoURL != null ? String(data.photoURL) : undefined,
    updatedAt: String(data.updatedAt ?? ''),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

// ----------------------------------------------------------------------

export async function getMember(
  enterpriseId: string,
  uid: string
): Promise<MemberProfile | null> {
  const snap = await getDoc(memberRef(enterpriseId, uid));
  if (!snap.exists()) {
    return null;
  }
  return mapMember(snap.id, snap.data() as Record<string, unknown>);
}

export async function setMember(
  enterpriseId: string,
  uid: string,
  data: MemberProfileInput
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: nowIso(),
  };

  if (data.displayName !== undefined) {
    payload.displayName = data.displayName;
  }
  if (data.phone !== undefined) {
    payload.phone = data.phone;
  }
  if (data.photoURL !== undefined) {
    payload.photoURL = data.photoURL;
  }

  await setDoc(memberRef(enterpriseId, uid), payload, { merge: true });
}

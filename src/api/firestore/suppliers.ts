import {
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';

import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';

// ----------------------------------------------------------------------

export type Supplier = {
  id: string;
  name: string;
  tradeName?: string;
  document?: string;
  stateRegistration?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  zipCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function supplierRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'suppliers'), id);
}

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

function mapSupplier(id: string, data: Record<string, unknown>): Supplier {
  return {
    id,
    name: String(data.name ?? ''),
    tradeName: optStr(data.tradeName),
    document: optStr(data.document),
    stateRegistration: optStr(data.stateRegistration),
    contactPerson: optStr(data.contactPerson),
    phone: optStr(data.phone),
    email: optStr(data.email),
    zipCode: optStr(data.zipCode),
    address: optStr(data.address),
    addressNumber: optStr(data.addressNumber),
    complement: optStr(data.complement),
    neighborhood: optStr(data.neighborhood),
    city: optStr(data.city),
    state: optStr(data.state),
    notes: optStr(data.notes),
    active: Boolean(data.active),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

// ----------------------------------------------------------------------

export async function listSuppliers(enterpriseId: string): Promise<Supplier[]> {
  const col = enterpriseCollection(enterpriseId, 'suppliers');
  const snap = await getDocs(col);
  return snap.docs.map((d) => mapSupplier(d.id, d.data() as Record<string, unknown>));
}

export async function getSupplier(enterpriseId: string, id: string): Promise<Supplier | null> {
  const snap = await getDoc(supplierRef(enterpriseId, id));
  if (!snap.exists()) {
    return null;
  }
  return mapSupplier(snap.id, snap.data() as Record<string, unknown>);
}

export async function createSupplier(
  enterpriseId: string,
  data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const col = enterpriseCollection(enterpriseId, 'suppliers');
  const timestamp = nowIso();
  const ref = await addDoc(
    col,
    omitUndefined({
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  );
  return ref.id;
}

export async function updateSupplier(
  enterpriseId: string,
  id: string,
  data: Partial<Supplier>
): Promise<void> {
  const updates = { ...data };
  delete updates.id;
  delete updates.createdAt;
  await updateDoc(
    supplierRef(enterpriseId, id),
    omitUndefined({
      ...updates,
      updatedAt: nowIso(),
    })
  );
}

export async function deactivateSupplier(enterpriseId: string, id: string): Promise<void> {
  await updateDoc(supplierRef(enterpriseId, id), {
    active: false,
    updatedAt: nowIso(),
  });
}

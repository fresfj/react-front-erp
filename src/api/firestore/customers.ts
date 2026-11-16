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

export type Customer = {
  id: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  zipCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  creditLimit?: number;
  currentDebt: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function customerRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'customers'), id);
}

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapCustomer(id: string, data: Record<string, unknown>): Customer {
  return {
    id,
    name: String(data.name ?? ''),
    document: optStr(data.document),
    phone: optStr(data.phone),
    email: optStr(data.email),
    zipCode: optStr(data.zipCode),
    address: optStr(data.address),
    addressNumber: optStr(data.addressNumber),
    complement: optStr(data.complement),
    neighborhood: optStr(data.neighborhood),
    city: optStr(data.city),
    state: optStr(data.state),
    creditLimit: typeof data.creditLimit === 'number' ? data.creditLimit : undefined,
    currentDebt: Number(data.currentDebt ?? 0),
    notes: optStr(data.notes),
    active: data.active !== false,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export function formatCustomerFullAddress(customer?: Partial<Customer> | null): string {
  if (!customer) return '';
  const parts = [
    customer.address,
    customer.addressNumber,
    customer.neighborhood,
    customer.city,
    customer.state,
    customer.zipCode,
  ].filter(Boolean);
  return parts.join(', ');
}

// ----------------------------------------------------------------------

export async function listCustomers(enterpriseId: string): Promise<Customer[]> {
  const col = enterpriseCollection(enterpriseId, 'customers');
  const snap = await getDocs(col);
  const rows = snap.docs.map((d) => mapCustomer(d.id, d.data() as Record<string, unknown>));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCustomer(enterpriseId: string, id: string): Promise<Customer | null> {
  const snap = await getDoc(customerRef(enterpriseId, id));
  if (!snap.exists()) return null;
  return mapCustomer(snap.id, snap.data() as Record<string, unknown>);
}

export async function createCustomer(
  enterpriseId: string,
  data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Customer> {
  const col = enterpriseCollection(enterpriseId, 'customers');
  const timestamp = nowIso();
  const payload = omitUndefined({
    ...data,
    currentDebt: data.currentDebt ?? 0,
    active: data.active ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const ref = await addDoc(col, payload);
  return mapCustomer(ref.id, payload as Record<string, unknown>);
}

export async function updateCustomer(
  enterpriseId: string,
  id: string,
  data: Partial<Customer>
): Promise<void> {
  const updates = { ...data };
  delete updates.id;
  delete updates.createdAt;
  await updateDoc(
    customerRef(enterpriseId, id),
    omitUndefined({
      ...updates,
      updatedAt: nowIso(),
    })
  );
}

export async function settleCustomerDebt(
  enterpriseId: string,
  customer: Customer,
  paidAmount: number
): Promise<void> {
  const nextDebt = Math.max(0, Math.round((customer.currentDebt - paidAmount) * 100) / 100);
  await updateDoc(customerRef(enterpriseId, customer.id), {
    currentDebt: nextDebt,
    updatedAt: nowIso(),
  });
}

export async function deactivateCustomer(enterpriseId: string, id: string): Promise<void> {
  await updateDoc(customerRef(enterpriseId, id), {
    active: false,
    updatedAt: nowIso(),
  });
}

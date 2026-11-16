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

export type FinancialCategory =
  | 'utilities_power'
  | 'utilities_internet'
  | 'rent'
  | 'supplier'
  | 'other';

export type FinancialRecurrence = 'none' | 'weekly' | 'monthly';
export type FinancialStatus = 'open' | 'paid' | 'cancelled';

export type Payable = {
  id: string;
  description: string;
  category: FinancialCategory;
  amount: number;
  startDate: string;
  dueDate: string;
  supplierId?: string;
  supplierName?: string;
  recurrence: FinancialRecurrence;
  status: FinancialStatus;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function payableRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'payables'), id);
}

function nowIso(): string {
  return new Date().toISOString();
}

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

function mapPayable(id: string, data: Record<string, unknown>): Payable {
  return {
    id,
    description: String(data.description ?? ''),
    category: (data.category as FinancialCategory) || 'other',
    amount: Number(data.amount ?? 0),
    startDate: String(data.startDate ?? ''),
    dueDate: String(data.dueDate ?? ''),
    supplierId: optStr(data.supplierId),
    supplierName: optStr(data.supplierName),
    recurrence: (data.recurrence as FinancialRecurrence) || 'none',
    status: (data.status as FinancialStatus) || 'open',
    active: data.active !== false,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export async function listPayables(enterpriseId: string): Promise<Payable[]> {
  const snap = await getDocs(enterpriseCollection(enterpriseId, 'payables'));
  return snap.docs
    .map((d) => mapPayable(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

export async function getPayable(enterpriseId: string, id: string): Promise<Payable | null> {
  const snap = await getDoc(payableRef(enterpriseId, id));
  if (!snap.exists()) return null;
  return mapPayable(snap.id, snap.data() as Record<string, unknown>);
}

export async function createPayable(
  enterpriseId: string,
  data: Omit<Payable, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Payable> {
  const timestamp = nowIso();
  const payload = omitUndefined({ ...data, createdAt: timestamp, updatedAt: timestamp });
  const ref = await addDoc(enterpriseCollection(enterpriseId, 'payables'), payload);
  return mapPayable(ref.id, payload as Record<string, unknown>);
}

export async function updatePayable(
  enterpriseId: string,
  id: string,
  data: Partial<Omit<Payable, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(
    payableRef(enterpriseId, id),
    omitUndefined({ ...data, updatedAt: nowIso() })
  );
}

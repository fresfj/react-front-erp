import {
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';

import type {
  FinancialCategory,
  FinancialRecurrence,
  FinancialStatus,
} from './payables';
import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';

// ----------------------------------------------------------------------

export type Receivable = {
  id: string;
  description: string;
  category: FinancialCategory;
  amount: number;
  startDate: string;
  dueDate: string;
  customerId?: string;
  customerName?: string;
  recurrence: FinancialRecurrence;
  status: FinancialStatus;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function receivableRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'receivables'), id);
}

function nowIso(): string {
  return new Date().toISOString();
}

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

function mapReceivable(id: string, data: Record<string, unknown>): Receivable {
  return {
    id,
    description: String(data.description ?? ''),
    category: (data.category as FinancialCategory) || 'other',
    amount: Number(data.amount ?? 0),
    startDate: String(data.startDate ?? ''),
    dueDate: String(data.dueDate ?? ''),
    customerId: optStr(data.customerId),
    customerName: optStr(data.customerName),
    recurrence: (data.recurrence as FinancialRecurrence) || 'none',
    status: (data.status as FinancialStatus) || 'open',
    active: data.active !== false,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export async function listReceivables(enterpriseId: string): Promise<Receivable[]> {
  const snap = await getDocs(enterpriseCollection(enterpriseId, 'receivables'));
  return snap.docs
    .map((d) => mapReceivable(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

export async function getReceivable(
  enterpriseId: string,
  id: string
): Promise<Receivable | null> {
  const snap = await getDoc(receivableRef(enterpriseId, id));
  if (!snap.exists()) return null;
  return mapReceivable(snap.id, snap.data() as Record<string, unknown>);
}

export async function createReceivable(
  enterpriseId: string,
  data: Omit<Receivable, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Receivable> {
  const timestamp = nowIso();
  const payload = omitUndefined({ ...data, createdAt: timestamp, updatedAt: timestamp });
  const ref = await addDoc(enterpriseCollection(enterpriseId, 'receivables'), payload);
  return mapReceivable(ref.id, payload as Record<string, unknown>);
}

export async function updateReceivable(
  enterpriseId: string,
  id: string,
  data: Partial<Omit<Receivable, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(
    receivableRef(enterpriseId, id),
    omitUndefined({ ...data, updatedAt: nowIso() })
  );
}

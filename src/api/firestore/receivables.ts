import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  arrayUnion,
  writeBatch,
} from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

import {
  splitInstallments,
  buildInstallmentDueDates,
} from 'src/sections/cash/installments';

import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';
import { NoOpenCashSessionError } from './cash-sessions';

import type { CashSession } from './cash-sessions';
import type {
  FinancialStatus,
  FinancialCategory,
  FinancialRecurrence,
} from './payables';

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
  parentId?: string;
  installmentIndex: number;
  installmentCount: number;
  active: boolean;
  refType?: string;
  refId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateReceivableInput = {
  description: string;
  category: FinancialCategory;
  /** Total amount to split across installments. */
  amount: number;
  startDate: string;
  dueDate: string;
  customerId?: string;
  customerName?: string;
  /** Current customer debt before create (for atomic bump). */
  customerCurrentDebt?: number;
  recurrence: FinancialRecurrence;
  installmentCount?: number;
  status?: FinancialStatus;
  active?: boolean;
};

function receivableRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'receivables'), id);
}

function customerRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'customers'), id);
}

function sessionRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'cashSessions'), id);
}

function nowIso(): string {
  return new Date().toISOString();
}

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mapReceivable(id: string, data: Record<string, unknown>): Receivable {
  const installmentCount = Math.max(1, Number(data.installmentCount ?? 1));
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
    parentId: optStr(data.parentId),
    installmentIndex: Math.max(1, Number(data.installmentIndex ?? 1)),
    installmentCount,
    active: data.active !== false,
    refType: optStr(data.refType),
    refId: optStr(data.refId),
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

/** @deprecated Prefer createReceivableWithInstallments */
export async function createReceivable(
  enterpriseId: string,
  data: Omit<Receivable, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Receivable> {
  const created = await createReceivableWithInstallments(enterpriseId, {
    description: data.description,
    category: data.category,
    amount: data.amount,
    startDate: data.startDate,
    dueDate: data.dueDate,
    customerId: data.customerId,
    customerName: data.customerName,
    recurrence: data.recurrence,
    installmentCount: data.installmentCount || 1,
    status: data.status,
    active: data.active,
  });
  return created[0];
}

export async function createReceivableWithInstallments(
  enterpriseId: string,
  input: CreateReceivableInput
): Promise<Receivable[]> {
  const recurrence = input.recurrence || 'none';
  const count =
    recurrence === 'none'
      ? 1
      : Math.min(24, Math.max(1, Math.floor(input.installmentCount || 1)));

  const amounts = splitInstallments(Number(input.amount), count);
  const dueDates =
    recurrence === 'none'
      ? [input.dueDate || input.startDate]
      : buildInstallmentDueDates(input.startDate, recurrence, count);

  const timestamp = nowIso();
  const col = enterpriseCollection(enterpriseId, 'receivables');
  const wb = writeBatch(FIRESTORE);
  const parentRef = doc(col);
  const created: Receivable[] = [];

  for (let i = 0; i < count; i += 1) {
    const ref = i === 0 ? parentRef : doc(col);
    const payload = omitUndefined({
      description: input.description.trim(),
      category: input.category,
      amount: amounts[i],
      startDate: input.startDate,
      dueDate: dueDates[i],
      customerId: input.customerId,
      customerName: input.customerName,
      recurrence,
      status: input.status || 'open',
      parentId: parentRef.id,
      installmentIndex: i + 1,
      installmentCount: count,
      active: input.active ?? true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    wb.set(ref, payload);
    created.push(mapReceivable(ref.id, payload as Record<string, unknown>));
  }

  if (input.customerId) {
    const total = round2(amounts.reduce((s, a) => s + a, 0));
    const currentDebt = Number(input.customerCurrentDebt ?? 0);
    wb.update(customerRef(enterpriseId, input.customerId), {
      currentDebt: round2(currentDebt + total),
      updatedAt: timestamp,
    });
  }

  await wb.commit();
  return created;
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

export async function markReceivablePaid(
  enterpriseId: string,
  receivable: Receivable,
  opts: {
    session: CashSession | null;
    createdBy?: string;
    customerCurrentDebt?: number;
  }
): Promise<void> {
  if (receivable.status !== 'open') {
    throw new Error('Receivable is not open');
  }
  if (!opts.session || opts.session.status !== 'open') {
    throw new NoOpenCashSessionError();
  }

  const timestamp = nowIso();
  const wb = writeBatch(FIRESTORE);

  wb.update(receivableRef(enterpriseId, receivable.id), {
    status: 'paid',
    updatedAt: timestamp,
  });

  if (receivable.customerId) {
    const currentDebt = Number(opts.customerCurrentDebt ?? 0);
    wb.update(customerRef(enterpriseId, receivable.customerId), {
      currentDebt: Math.max(0, round2(currentDebt - receivable.amount)),
      updatedAt: timestamp,
    });
  }

  const movementEntry = omitUndefined({
    id: `mov-${Date.now()}-${receivable.id.slice(0, 6)}`,
    type: 'RECEIPT' as const,
    amount: receivable.amount,
    reason: `Recebimento: ${receivable.description} (${receivable.installmentIndex}/${receivable.installmentCount})`,
    createdAt: timestamp,
    createdBy: opts.createdBy,
    refType: 'receivable' as const,
    refId: receivable.id,
  });

  wb.update(sessionRef(enterpriseId, opts.session.id), {
    movements: arrayUnion(movementEntry),
    updatedAt: timestamp,
  });

  await wb.commit();
}

export async function cancelReceivable(
  enterpriseId: string,
  receivable: Receivable,
  opts?: { customerCurrentDebt?: number }
): Promise<void> {
  if (receivable.status !== 'open') {
    throw new Error('Only open receivables can be cancelled');
  }

  const timestamp = nowIso();
  const wb = writeBatch(FIRESTORE);

  wb.update(receivableRef(enterpriseId, receivable.id), {
    status: 'cancelled',
    updatedAt: timestamp,
  });

  if (receivable.customerId) {
    const currentDebt = Number(opts?.customerCurrentDebt ?? 0);
    wb.update(customerRef(enterpriseId, receivable.customerId), {
      currentDebt: Math.max(0, round2(currentDebt - receivable.amount)),
      updatedAt: timestamp,
    });
  }

  await wb.commit();
}

export async function settleCustomerDebtWithSession(
  enterpriseId: string,
  customer: { id: string; name?: string; currentDebt: number },
  amount: number,
  opts: {
    session: CashSession | null;
    createdBy?: string;
    description?: string;
  }
): Promise<void> {
  if (!opts.session || opts.session.status !== 'open') {
    throw new NoOpenCashSessionError();
  }

  const timestamp = nowIso();
  const wb = writeBatch(FIRESTORE);

  // 1. Cria o receivable quitado
  const recCol = enterpriseCollection(enterpriseId, 'receivables');
  const newRecRef = doc(recCol);
  const roundAmount = round2(amount);

  wb.set(
    newRecRef,
    omitUndefined({
      description: opts.description || `Recebimento Débito / Fiado - ${customer.name || 'Cliente'}`,
      category: 'other' as const,
      amount: roundAmount,
      startDate: timestamp.slice(0, 10),
      dueDate: timestamp.slice(0, 10),
      customerId: customer.id,
      customerName: customer.name || 'Cliente balcão',
      recurrence: 'none' as const,
      installmentIndex: 1,
      installmentCount: 1,
      status: 'paid' as const,
      active: true,
      refType: 'customer_debt',
      refId: customer.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  );

  // 2. Abate dívida do cliente
  const nextDebt = Math.max(0, round2(customer.currentDebt - roundAmount));
  wb.update(customerRef(enterpriseId, customer.id), {
    currentDebt: nextDebt,
    updatedAt: timestamp,
  });

  // 3. Movimentação no Caixa (arrayUnion evita perda em baixas simultâneas)
  const movementEntry = omitUndefined({
    id: `mov-${Date.now()}-${newRecRef.id.slice(0, 6)}`,
    type: 'RECEIPT' as const,
    amount: roundAmount,
    reason: `Recebimento Débito: ${customer.name || 'Cliente'}`,
    createdAt: timestamp,
    createdBy: opts.createdBy,
    refType: 'receivable' as const,
    refId: newRecRef.id,
  });

  wb.update(sessionRef(enterpriseId, opts.session.id), {
    movements: arrayUnion(movementEntry),
    updatedAt: timestamp,
  });

  await wb.commit();
}

import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

import {
  splitInstallments,
  buildInstallmentDueDates,
} from 'src/sections/cash/installments';

import type { DreClass } from 'src/sections/cash/accrual-dre';

import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';
import type { CashSession } from './cash-sessions';
import { NoOpenCashSessionError } from './cash-sessions';

// ----------------------------------------------------------------------

export type FinancialCategory =
  | 'utilities_power'
  | 'utilities_internet'
  | 'rent'
  | 'supplier'
  | 'other';

export type FinancialRecurrence = 'none' | 'weekly' | 'monthly';
export type FinancialStatus = 'open' | 'paid' | 'cancelled';

export type { DreClass };

const DRE_CLASSES: DreClass[] = ['operating', 'cogs_inventory', 'other_income', 'ignore'];

function parseDreClass(raw: unknown): DreClass | undefined {
  if (typeof raw !== 'string') return undefined;
  return DRE_CLASSES.includes(raw as DreClass) ? (raw as DreClass) : undefined;
}

export type Payable = {
  id: string;
  description: string;
  category: FinancialCategory;
  amount: number;
  startDate: string;
  dueDate: string;
  /** YYYY-MM-DD; falls back to startDate when missing on legacy docs. */
  competenceDate: string;
  dreClass?: DreClass;
  supplierId?: string;
  supplierName?: string;
  recurrence: FinancialRecurrence;
  status: FinancialStatus;
  parentId?: string;
  installmentIndex: number;
  installmentCount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreatePayableInput = {
  description: string;
  category: FinancialCategory;
  amount: number;
  startDate: string;
  dueDate: string;
  competenceDate?: string;
  dreClass?: DreClass;
  supplierId?: string;
  supplierName?: string;
  recurrence: FinancialRecurrence;
  installmentCount?: number;
  status?: FinancialStatus;
  active?: boolean;
};

function payableRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'payables'), id);
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

function mapPayable(id: string, data: Record<string, unknown>): Payable {
  const installmentCount = Math.max(1, Number(data.installmentCount ?? 1));
  const startDate = String(data.startDate ?? '');
  return {
    id,
    description: String(data.description ?? ''),
    category: (data.category as FinancialCategory) || 'other',
    amount: Number(data.amount ?? 0),
    startDate,
    dueDate: String(data.dueDate ?? ''),
    competenceDate: String(data.competenceDate ?? startDate),
    dreClass: parseDreClass(data.dreClass),
    supplierId: optStr(data.supplierId),
    supplierName: optStr(data.supplierName),
    recurrence: (data.recurrence as FinancialRecurrence) || 'none',
    status: (data.status as FinancialStatus) || 'open',
    parentId: optStr(data.parentId),
    installmentIndex: Math.max(1, Number(data.installmentIndex ?? 1)),
    installmentCount,
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

/** @deprecated Prefer createPayableWithInstallments */
export async function createPayable(
  enterpriseId: string,
  data: Omit<Payable, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Payable> {
  const created = await createPayableWithInstallments(enterpriseId, {
    description: data.description,
    category: data.category,
    amount: data.amount,
    startDate: data.startDate,
    dueDate: data.dueDate,
    supplierId: data.supplierId,
    supplierName: data.supplierName,
    recurrence: data.recurrence,
    installmentCount: data.installmentCount || 1,
    status: data.status,
    active: data.active,
  });
  return created[0];
}

export async function createPayableWithInstallments(
  enterpriseId: string,
  input: CreatePayableInput
): Promise<Payable[]> {
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
  const col = enterpriseCollection(enterpriseId, 'payables');
  const wb = writeBatch(FIRESTORE);
  const parentRef = doc(col);
  const created: Payable[] = [];

  for (let i = 0; i < count; i += 1) {
    const ref = i === 0 ? parentRef : doc(col);
    const payload = omitUndefined({
      description: input.description.trim(),
      category: input.category,
      amount: amounts[i],
      startDate: input.startDate,
      dueDate: dueDates[i],
      competenceDate: input.competenceDate || input.startDate,
      dreClass: input.dreClass,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
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
    created.push(mapPayable(ref.id, payload as Record<string, unknown>));
  }

  await wb.commit();
  return created;
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

export async function markPayablePaid(
  enterpriseId: string,
  payable: Payable,
  opts: {
    session: CashSession | null;
    createdBy?: string;
  }
): Promise<void> {
  if (payable.status !== 'open') {
    throw new Error('Payable is not open');
  }
  if (!opts.session || opts.session.status !== 'open') {
    throw new NoOpenCashSessionError();
  }

  const timestamp = nowIso();
  const wb = writeBatch(FIRESTORE);

  wb.update(payableRef(enterpriseId, payable.id), {
    status: 'paid',
    updatedAt: timestamp,
  });

  const nextMovements = [
    ...opts.session.movements,
    omitUndefined({
      id: `mov-${Date.now()}`,
      type: 'PAYMENT' as const,
      amount: payable.amount,
      reason: `Pagamento: ${payable.description} (${payable.installmentIndex}/${payable.installmentCount})`,
      createdAt: timestamp,
      createdBy: opts.createdBy,
      refType: 'payable' as const,
      refId: payable.id,
    }),
  ];

  wb.update(sessionRef(enterpriseId, opts.session.id), {
    movements: nextMovements,
    updatedAt: timestamp,
  });

  await wb.commit();
}

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

export type CashMovementType = 'SUPPLY' | 'WITHDRAWAL' | 'RECEIPT' | 'PAYMENT';

export type CashMovementRefType = 'receivable' | 'payable';

export type CashMovement = {
  id: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  createdAt: string;
  createdBy?: string;
  refType?: CashMovementRefType;
  refId?: string;
};

function mapMovementType(raw: unknown): CashMovementType {
  if (raw === 'WITHDRAWAL') return 'WITHDRAWAL';
  if (raw === 'RECEIPT') return 'RECEIPT';
  if (raw === 'PAYMENT') return 'PAYMENT';
  return 'SUPPLY';
}

export type CashSessionTotalsByMethod = {
  cash: number;
  pix: number;
  credit_card: number;
  debit_card: number;
  store_credit: number;
  credit_tab: number;
};

export type CashSessionStatus = 'open' | 'closed';

export type CashSession = {
  id: string;
  code: string;
  operatorUid?: string;
  operatorEmail?: string;
  openingBalance: number;
  movements: CashMovement[];
  expectedTotals?: CashSessionTotalsByMethod;
  countedTotals?: CashSessionTotalsByMethod;
  expectedDrawerCash?: number;
  countedDrawerCash?: number;
  differenceAmount?: number; // positivo = sobra, negativo = quebra
  notes?: string;
  status: CashSessionStatus;
  openedAt: string;
  closedAt?: string;
  updatedAt: string;
};

function sessionRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'cashSessions'), id);
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapTotals(raw: unknown): CashSessionTotalsByMethod | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    cash: Number(r.cash ?? 0),
    pix: Number(r.pix ?? 0),
    credit_card: Number(r.credit_card ?? 0),
    debit_card: Number(r.debit_card ?? 0),
    store_credit: Number(r.store_credit ?? 0),
    credit_tab: Number(r.credit_tab ?? 0),
  };
}

function mapCashSession(id: string, data: Record<string, unknown>): CashSession {
  const status: CashSessionStatus = data.status === 'closed' ? 'closed' : 'open';
  const rawMovements = Array.isArray(data.movements) ? data.movements : [];

  return {
    id,
    code: String(data.code ?? ''),
    operatorUid: data.operatorUid != null ? String(data.operatorUid) : undefined,
    operatorEmail: data.operatorEmail != null ? String(data.operatorEmail) : undefined,
    openingBalance: Number(data.openingBalance ?? 0),
    movements: rawMovements.map((m) => {
      const item = m as Record<string, unknown>;
      return {
        id: String(item.id ?? ''),
        type: mapMovementType(item.type),
        amount: Number(item.amount ?? 0),
        reason: String(item.reason ?? ''),
        createdAt: String(item.createdAt ?? ''),
        createdBy: item.createdBy != null ? String(item.createdBy) : undefined,
        refType:
          item.refType === 'receivable' || item.refType === 'payable'
            ? item.refType
            : undefined,
        refId: item.refId != null ? String(item.refId) : undefined,
      };
    }),
    expectedTotals: mapTotals(data.expectedTotals),
    countedTotals: mapTotals(data.countedTotals),
    expectedDrawerCash:
      typeof data.expectedDrawerCash === 'number' ? data.expectedDrawerCash : undefined,
    countedDrawerCash:
      typeof data.countedDrawerCash === 'number' ? data.countedDrawerCash : undefined,
    differenceAmount:
      typeof data.differenceAmount === 'number' ? data.differenceAmount : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
    status,
    openedAt: String(data.openedAt ?? ''),
    closedAt: data.closedAt != null ? String(data.closedAt) : undefined,
    updatedAt: String(data.updatedAt ?? ''),
  };
}

// ----------------------------------------------------------------------

export async function listCashSessions(enterpriseId: string): Promise<CashSession[]> {
  const col = enterpriseCollection(enterpriseId, 'cashSessions');
  const snap = await getDocs(col);
  const rows = snap.docs.map((d) => mapCashSession(d.id, d.data() as Record<string, unknown>));
  return rows.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

export async function getOpenCashSession(enterpriseId: string): Promise<CashSession | null> {
  const rows = await listCashSessions(enterpriseId);
  return rows.find((s) => s.status === 'open') || null;
}

export class NoOpenCashSessionError extends Error {
  constructor(message = 'No open cash session') {
    super(message);
    this.name = 'NoOpenCashSessionError';
  }
}

export async function getCashSession(
  enterpriseId: string,
  id: string
): Promise<CashSession | null> {
  const snap = await getDoc(sessionRef(enterpriseId, id));
  if (!snap.exists()) return null;
  return mapCashSession(snap.id, snap.data() as Record<string, unknown>);
}

export async function openCashSession(
  enterpriseId: string,
  input: {
    code: string;
    openingBalance: number;
    operatorUid?: string;
    operatorEmail?: string;
    notes?: string;
  }
): Promise<string> {
  const col = enterpriseCollection(enterpriseId, 'cashSessions');
  const timestamp = nowIso();
  const ref = await addDoc(
    col,
    omitUndefined({
      code: input.code,
      openingBalance: input.openingBalance,
      operatorUid: input.operatorUid,
      operatorEmail: input.operatorEmail,
      movements: [],
      notes: input.notes,
      status: 'open',
      openedAt: timestamp,
      updatedAt: timestamp,
    })
  );
  return ref.id;
}

export async function addCashSessionMovement(
  enterpriseId: string,
  session: CashSession,
  movement: Omit<CashMovement, 'id' | 'createdAt'>
): Promise<void> {
  const timestamp = nowIso();
  const nextMovements: CashMovement[] = [
    ...session.movements,
    omitUndefined({
      ...movement,
      id: `mov-${Date.now()}`,
      createdAt: timestamp,
    }) as CashMovement,
  ];
  await updateDoc(sessionRef(enterpriseId, session.id), {
    movements: nextMovements,
    updatedAt: timestamp,
  });
}

export async function closeCashSessionBlind(
  enterpriseId: string,
  sessionId: string,
  payload: {
    expectedTotals: CashSessionTotalsByMethod;
    countedTotals: CashSessionTotalsByMethod;
    expectedDrawerCash: number;
    countedDrawerCash: number;
    differenceAmount: number;
    notes?: string;
  }
): Promise<void> {
  const timestamp = nowIso();
  await updateDoc(
    sessionRef(enterpriseId, sessionId),
    omitUndefined({
      ...payload,
      status: 'closed',
      closedAt: timestamp,
      updatedAt: timestamp,
    })
  );
}

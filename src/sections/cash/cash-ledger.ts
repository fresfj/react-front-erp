import type { Dayjs } from 'dayjs';
import type { CashSession } from 'src/api/firestore/cash-sessions';

import { isIsoInPeriodBounds } from 'src/components/period-filter';

// ----------------------------------------------------------------------

export type CashLedgerLineType =
  | 'OPENING'
  | 'SUPPLY'
  | 'WITHDRAWAL'
  | 'RECEIPT'
  | 'PAYMENT';

export type CashLedgerLine = {
  id: string;
  sessionId: string;
  sessionCode: string;
  type: CashLedgerLineType;
  amount: number;
  signedAmount: number;
  reason: string;
  createdAt: string;
  refType?: 'receivable' | 'payable';
  refId?: string;
  balanceAfter: number;
};

export type CashLedgerSummary = {
  inflow: number;
  outflow: number;
  net: number;
  lineCount: number;
};

export type CashLedgerBounds = { start?: Dayjs | null; end?: Dayjs | null };

const OPENING_REASON = 'Abertura de caixa';

function signedForType(type: CashLedgerLineType, amount: number): number {
  if (type === 'WITHDRAWAL' || type === 'PAYMENT') {
    return -Math.abs(amount);
  }
  return Math.abs(amount);
}

function typeRank(type: CashLedgerLineType): number {
  // Prefer OPENING before same-timestamp movements of the same session
  return type === 'OPENING' ? 0 : 1;
}

/**
 * Flattens cash sessions into a period-relative ledger with running balance.
 * Balance starts at 0 for the filtered window (not lifetime wallet).
 */
export function buildCashLedger(
  sessions: CashSession[],
  bounds?: CashLedgerBounds
): { lines: CashLedgerLine[]; summary: CashLedgerSummary } {
  const period = {
    start: bounds?.start ?? null,
    end: bounds?.end ?? null,
  };

  const raw: Omit<CashLedgerLine, 'balanceAfter'>[] = [];

  sessions.forEach((session) => {
    raw.push({
      id: `${session.id}:opening`,
      sessionId: session.id,
      sessionCode: session.code,
      type: 'OPENING',
      amount: Math.abs(session.openingBalance),
      signedAmount: signedForType('OPENING', session.openingBalance),
      reason: OPENING_REASON,
      createdAt: session.openedAt,
    });

    session.movements.forEach((m) => {
      const type = m.type as CashLedgerLineType;
      raw.push({
        id: `${session.id}:${m.id}`,
        sessionId: session.id,
        sessionCode: session.code,
        type,
        amount: Math.abs(m.amount),
        signedAmount: signedForType(type, m.amount),
        reason: m.reason || '',
        createdAt: m.createdAt,
        refType: m.refType,
        refId: m.refId,
      });
    });
  });

  const filtered = raw.filter((line) => isIsoInPeriodBounds(line.createdAt, period));

  filtered.sort((a, b) => {
    const ta = a.createdAt;
    const tb = b.createdAt;
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (a.sessionId !== b.sessionId) return a.sessionId < b.sessionId ? -1 : 1;
    return typeRank(a.type) - typeRank(b.type);
  });

  let running = 0;
  let inflow = 0;
  let outflow = 0;

  const lines: CashLedgerLine[] = filtered.map((line) => {
    running += line.signedAmount;
    if (line.signedAmount > 0) inflow += line.signedAmount;
    if (line.signedAmount < 0) outflow += Math.abs(line.signedAmount);
    return { ...line, balanceAfter: running };
  });

  return {
    lines,
    summary: {
      inflow,
      outflow,
      net: inflow - outflow,
      lineCount: lines.length,
    },
  };
}

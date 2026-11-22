import type { CashSession } from 'src/api/firestore/cash-sessions';

import dayjs from 'dayjs';
import { it, expect, describe } from 'vitest';

import { buildCashLedger } from './cash-ledger';

// ----------------------------------------------------------------------

function makeSession(overrides: Partial<CashSession> & Pick<CashSession, 'id'>): CashSession {
  return {
    code: 'CX-01',
    openingBalance: 0,
    movements: [],
    status: 'open',
    openedAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildCashLedger', () => {
  it('emits OPENING + movements with running balance and summary', () => {
    const session = makeSession({
      id: 'sess1',
      code: 'CX-100',
      openingBalance: 100,
      openedAt: '2026-11-10T10:00:00.000Z',
      movements: [
        {
          id: 'm1',
          type: 'SUPPLY',
          amount: 50,
          reason: 'Troco',
          createdAt: '2026-11-10T11:00:00.000Z',
        },
        {
          id: 'm2',
          type: 'WITHDRAWAL',
          amount: 30,
          reason: 'Sangria',
          createdAt: '2026-11-10T12:00:00.000Z',
        },
      ],
    });

    const { lines, summary } = buildCashLedger([session]);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      id: 'sess1:opening',
      type: 'OPENING',
      amount: 100,
      signedAmount: 100,
      balanceAfter: 100,
      sessionCode: 'CX-100',
    });
    expect(lines[1]).toMatchObject({
      id: 'sess1:m1',
      type: 'SUPPLY',
      signedAmount: 50,
      balanceAfter: 150,
    });
    expect(lines[2]).toMatchObject({
      id: 'sess1:m2',
      type: 'WITHDRAWAL',
      signedAmount: -30,
      balanceAfter: 120,
    });

    expect(summary).toMatchObject({
      inflow: 150,
      outflow: 30,
      net: 120,
      lineCount: 3,
    });
  });

  it('filters lines by period bounds on createdAt', () => {
    const session = makeSession({
      id: 'sess1',
      openingBalance: 100,
      openedAt: '2026-11-01T10:00:00.000Z',
      movements: [
        {
          id: 'm1',
          type: 'RECEIPT',
          amount: 40,
          reason: 'AR',
          createdAt: '2026-11-15T10:00:00.000Z',
          refType: 'receivable',
          refId: 'ar1',
        },
        {
          id: 'm2',
          type: 'PAYMENT',
          amount: 10,
          reason: 'AP',
          createdAt: '2026-11-20T10:00:00.000Z',
          refType: 'payable',
          refId: 'ap1',
        },
      ],
    });

    const bounds = {
      start: dayjs('2026-11-14').startOf('day'),
      end: dayjs('2026-11-16').endOf('day'),
    };

    const { lines, summary } = buildCashLedger([session], bounds);

    expect(lines.map((l) => l.type)).toEqual(['RECEIPT']);
    expect(lines[0].balanceAfter).toBe(140);
    expect(summary).toMatchObject({
      previousBalance: 100,
      inflow: 40,
      outflow: 0,
      net: 40,
      closingBalance: 140,
      lineCount: 1,
    });
  });

  it('includes zero opening balance row when in bounds', () => {
    const session = makeSession({
      id: 'sess0',
      openingBalance: 0,
      openedAt: '2026-11-10T08:00:00.000Z',
      movements: [],
    });

    const { lines, summary } = buildCashLedger([session]);

    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('OPENING');
    expect(lines[0].signedAmount).toBe(0);
    expect(summary.lineCount).toBe(1);
    expect(summary.net).toBe(0);
  });

  it('sorts chronologically across sessions', () => {
    const a = makeSession({
      id: 'a',
      code: 'CX-A',
      openingBalance: 10,
      openedAt: '2026-11-12T10:00:00.000Z',
      movements: [],
    });
    const b = makeSession({
      id: 'b',
      code: 'CX-B',
      openingBalance: 5,
      openedAt: '2026-11-11T10:00:00.000Z',
      movements: [],
    });

    const { lines } = buildCashLedger([a, b]);

    expect(lines.map((l) => l.sessionId)).toEqual(['b', 'a']);
    expect(lines[0].balanceAfter).toBe(5);
    expect(lines[1].balanceAfter).toBe(15);
  });
});

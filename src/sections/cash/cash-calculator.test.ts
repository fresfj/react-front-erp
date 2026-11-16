import type { Sale } from 'src/api/firestore/sales';

import { describe, expect, it } from 'vitest';

import {
  calculateDreReport,
  calculateCashSessionExpected,
  calculateBlindCloseDifference,
} from './cash-calculator';

const makeSale = (overrides: Partial<Sale>): Sale => ({
  id: 's1',
  code: 'VD-01',
  items: [],
  subtotal: 100,
  discountAmount: 5,
  discountPercent: 5,
  total: 95,
  totalCost: 45,
  grossProfit: 50,
  payments: [
    { method: 'cash', amount: 50 },
    { method: 'pix', amount: 50 },
  ],
  paidAmount: 100,
  changeAmount: 5,
  status: 'completed',
  createdAt: '2026-11-16T12:00:00Z',
  updatedAt: '2026-11-16T12:00:00Z',
  ...overrides,
});

describe('calculateCashSessionExpected & calculateBlindCloseDifference', () => {
  it('computes expected drawer cash with opening balance, net cash sales, supplies and withdrawals', () => {
    const res = calculateCashSessionExpected({
      openingBalance: 100,
      movements: [
        { id: 'm1', type: 'SUPPLY', amount: 30, reason: 'Troco', createdAt: '' },
        { id: 'm2', type: 'WITHDRAWAL', amount: 20, reason: 'Gelo', createdAt: '' },
      ],
      sales: [makeSale({})], // 50 cash - 5 change = 45 net cash
    });

    expect(res.netCashSales).toBe(45);
    expect(res.expectedTotals.pix).toBe(50);
    expect(res.totalSupplies).toBe(30);
    expect(res.totalWithdrawals).toBe(20);
    // 100 + 45 + 30 - 20 = 155
    expect(res.expectedDrawerCash).toBe(155);

    const diffShortage = calculateBlindCloseDifference({
      expectedDrawerCash: res.expectedDrawerCash,
      countedDrawerCash: 150,
    });
    expect(diffShortage).toEqual({ differenceAmount: -5, status: 'shortage' });
  });
});

describe('calculateDreReport', () => {
  it('calculates DRE lines (Gross Revenue, Discounts, Net Revenue, CMV, Gross Profit, Net Profit)', () => {
    const dre = calculateDreReport({
      sales: [makeSale({})],
      operatingExpenses: 15,
    });

    expect(dre.grossRevenue).toBe(100);
    expect(dre.discounts).toBe(5);
    expect(dre.netRevenue).toBe(95);
    expect(dre.cogs).toBe(45);
    expect(dre.grossProfit).toBe(50);
    expect(dre.operatingExpenses).toBe(15);
    expect(dre.netProfit).toBe(35);
  });
});

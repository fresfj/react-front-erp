import type { Sale } from 'src/api/firestore/sales';
import type { Payable } from 'src/api/firestore/payables';

import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { buildAccrualDre, resolvePayableDreClass } from './accrual-dre';

const bounds = {
  start: dayjs('2026-11-01').startOf('day'),
  end: dayjs('2026-11-30').endOf('day'),
};

const makeSale = (o: Partial<Sale> = {}): Sale =>
  ({
    id: 's1',
    code: 'VD-01',
    items: [],
    subtotal: 100,
    discountAmount: 5,
    discountPercent: 5,
    total: 95,
    totalCost: 45,
    grossProfit: 50,
    payments: [],
    paidAmount: 95,
    changeAmount: 0,
    status: 'completed',
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...o,
  }) as Sale;

const makePayable = (o: Partial<Payable> = {}): Payable =>
  ({
    id: 'p1',
    description: 'Rent',
    category: 'rent',
    amount: 20,
    startDate: '2026-11-05',
    dueDate: '2026-11-10',
    competenceDate: '2026-11-05',
    recurrence: 'none',
    status: 'open',
    installmentIndex: 1,
    installmentCount: 1,
    active: true,
    createdAt: '',
    updatedAt: '',
    ...o,
  }) as Payable;

describe('resolvePayableDreClass', () => {
  it('maps supplier → cogs_inventory by default', () => {
    expect(resolvePayableDreClass({ category: 'supplier' })).toBe('cogs_inventory');
  });

  it('honors explicit dreClass override', () => {
    expect(resolvePayableDreClass({ category: 'supplier', dreClass: 'operating' })).toBe(
      'operating'
    );
  });
});

describe('buildAccrualDre', () => {
  it('excludes cancelled sales and uses completed revenue/cogs', () => {
    const report = buildAccrualDre({
      sales: [makeSale({}), makeSale({ id: 's2', status: 'cancelled', total: 50, totalCost: 10 })],
      payables: [],
      bounds,
    });
    expect(report.salesCount).toBe(1);
    expect(report.netRevenue).toBe(95);
    expect(report.cogs).toBe(45);
    expect(report.grossProfit).toBe(50);
    expect(report.operatingExpenses).toBe(0);
    expect(report.netProfit).toBe(50);
  });

  it('includes open and paid AP equally; excludes cancelled', () => {
    const report = buildAccrualDre({
      sales: [makeSale({})],
      payables: [
        makePayable({ id: 'a', status: 'open', amount: 10 }),
        makePayable({ id: 'b', status: 'paid', amount: 5 }),
        makePayable({ id: 'c', status: 'cancelled', amount: 99 }),
      ],
      bounds,
    });
    expect(report.operatingExpenses).toBe(15);
    expect(report.netProfit).toBe(35);
  });

  it('falls back competenceDate → startDate', () => {
    const report = buildAccrualDre({
      sales: [],
      payables: [
        makePayable({
          competenceDate: undefined as unknown as string,
          startDate: '2026-11-08',
          amount: 7,
        }),
      ],
      bounds,
    });
    expect(report.operatingExpenses).toBe(7);
  });

  it('excludes supplier (cogs_inventory) from OpEx; includes rent', () => {
    const report = buildAccrualDre({
      sales: [makeSale({})],
      payables: [
        makePayable({ id: 'sup', category: 'supplier', amount: 100 }),
        makePayable({ id: 'rent', category: 'rent', amount: 20 }),
      ],
      bounds,
    });
    expect(report.operatingExpenses).toBe(20);
    expect(report.expenseLines).toEqual([
      expect.objectContaining({ category: 'rent', amount: 20 }),
    ]);
  });

  it('builds dailySeries with revenue/cogs/opex/netProfit', () => {
    const report = buildAccrualDre({
      sales: [makeSale({ createdAt: '2026-11-10T15:00:00.000Z' })],
      payables: [makePayable({ competenceDate: '2026-11-10', amount: 10 })],
      bounds,
    });
    const day = report.dailySeries.find((d) => d.date === '2026-11-10');
    expect(day).toEqual({
      date: '2026-11-10',
      revenue: 95,
      cogs: 45,
      operatingExpenses: 10,
      netProfit: 40,
    });
  });
});

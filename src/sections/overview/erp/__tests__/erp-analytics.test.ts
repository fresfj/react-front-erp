import type { Sale } from 'src/api/firestore/sales';
import type { Batch } from 'src/api/firestore/batches';
import type { Product } from 'src/api/firestore/products';
import type { Payable } from 'src/api/firestore/payables';
import type { Customer } from 'src/api/firestore/customers';
import type { ProcessingOrder } from 'src/api/firestore/processing-orders';

import dayjs from 'dayjs';
import { it, expect, describe } from 'vitest';

import {
  isLiterUnit,
  calcGrowthPercent,
  computeTopProducts,
  computeFiscalSummary,
  computeInventoryAlerts,
  computeChannelBreakdown,
  computeProductionMetrics,
  resolvePreviousPeriodBounds,
  computeTodayAndMonthForecast,
  computeTopIdentifiedCustomers,
} from '../erp-analytics';

// ----------------------------------------------------------------------

const BOUNDS_NOV = {
  start: dayjs('2026-11-01').startOf('day'),
  end: dayjs('2026-11-30').endOf('day'),
};

function makeSale(partial: Partial<Sale>): Sale {
  return {
    id: 's1',
    code: 'V-001',
    items: [],
    subtotal: 100,
    discountAmount: 0,
    discountPercent: 0,
    total: 100,
    totalCost: 40,
    grossProfit: 60,
    payments: [{ method: 'pix', amount: 100 }],
    paidAmount: 100,
    changeAmount: 0,
    status: 'completed',
    createdAt: '2026-11-10T14:00:00.000Z',
    updatedAt: '2026-11-10T14:00:00.000Z',
    ...partial,
  };
}

describe('erp-analytics', () => {
  it('detects liter unit variants and growth percentage', () => {
    expect(isLiterUnit('L')).toBe(true);
    expect(isLiterUnit('litro')).toBe(true);
    expect(isLiterUnit('Litros')).toBe(true);
    expect(isLiterUnit('kg')).toBe(false);

    expect(calcGrowthPercent(150, 100)).toBe(50);
    expect(calcGrowthPercent(80, 100)).toBe(-20);
    expect(calcGrowthPercent(100, 0)).toBe(100);
    expect(calcGrowthPercent(0, 0)).toBe(0);
  });

  it('resolves previous period bounds for comparison', () => {
    const prev = resolvePreviousPeriodBounds('7d', {
      start: dayjs('2026-11-10').startOf('day'),
      end: dayjs('2026-11-16').endOf('day'),
    });
    expect(prev?.start?.format('YYYY-MM-DD')).toBe('2026-11-03');
    expect(prev?.end?.format('YYYY-MM-DD')).toBe('2026-11-09');
    expect(resolvePreviousPeriodBounds('all', { start: null, end: null })).toBeNull();
  });

  it('computes channel breakdown (POS vs Online vs Table) and fiscal compliance', () => {
    const sales: Sale[] = [
      makeSale({ id: '1', total: 200, channel: 'pos', nfceStatus: 'authorized' }),
      makeSale({ id: '2', total: 100, channel: 'online', nfceStatus: 'pending' }),
      makeSale({ id: '4', total: 100, channel: 'table', nfceStatus: 'pending' }),
      makeSale({ id: '3', total: 50, channel: 'pos', status: 'cancelled' }),
    ];

    const channels = computeChannelBreakdown(sales, BOUNDS_NOV);
    expect(channels.posRevenue).toBe(200);
    expect(channels.onlineRevenue).toBe(100);
    expect(channels.tableRevenue).toBe(100);
    expect(channels.totalRevenue).toBe(400);
    expect(channels.posSharePercent).toBeCloseTo(50, 1);
    expect(channels.onlineSharePercent).toBeCloseTo(25, 1);
    expect(channels.tableSharePercent).toBeCloseTo(25, 1);

    const fiscal = computeFiscalSummary(sales, BOUNDS_NOV);
    expect(fiscal.authorizedCount).toBe(1);
    expect(fiscal.pendingCount).toBe(2);
    expect(fiscal.cancelledCount).toBe(1);
    expect(fiscal.compliancePercent).toBeCloseTo(33.3, 0);
  });

  it('computes top products and identified customers (excluding anonymous walk-ins)', () => {
    const sales: Sale[] = [
      makeSale({
        id: '1',
        customerId: 'c1',
        customerName: 'Maria Silva',
        total: 120,
        items: [
          {
            productId: 'p1',
            productName: 'Açaí Grosso',
            productSku: 'AC-01',
            unit: 'L',
            qty: 4,
            unitPrice: 30,
            unitCost: 12,
            lineTotal: 120,
          },
        ],
      }),
      makeSale({
        id: '2',
        customerName: 'Consumidor Final',
        total: 60,
        items: [
          {
            productId: 'p1',
            productName: 'Açaí Grosso',
            productSku: 'AC-01',
            unit: 'L',
            qty: 2,
            unitPrice: 30,
            unitCost: 12,
            lineTotal: 60,
          },
        ],
      }),
      makeSale({
        id: '3',
        customerId: 'c1',
        customerName: 'Maria Silva',
        total: 90,
        items: [
          {
            productId: 'p2',
            productName: 'Açaí Médio',
            productSku: 'AC-02',
            unit: 'L',
            qty: 3,
            unitPrice: 30,
            unitCost: 10,
            lineTotal: 90,
          },
        ],
      }),
    ];

    const customers: Customer[] = [
      {
        id: 'c1',
        name: 'Maria Silva',
        phone: '91999999999',
        currentDebt: 25,
        creditLimit: 500,
        active: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    const topProducts = computeTopProducts(sales, BOUNDS_NOV);
    expect(topProducts[0].productName).toBe('Açaí Grosso');
    expect(topProducts[0].qtySold).toBe(6);
    expect(topProducts[0].revenue).toBe(180);
    expect(topProducts[0].profit).toBe(108);

    const topCustomers = computeTopIdentifiedCustomers(sales, customers, BOUNDS_NOV);
    expect(topCustomers).toHaveLength(1);
    expect(topCustomers[0].customerName).toBe('Maria Silva');
    expect(topCustomers[0].ordersCount).toBe(2);
    expect(topCustomers[0].totalSpent).toBe(210);
    expect(topCustomers[0].currentDebt).toBe(25);
  });

  it('computes today, month-to-date and linear monthly growth forecast', () => {
    const ref = dayjs('2026-11-15T15:00:00.000Z');
    const sales: Sale[] = [
      makeSale({ id: 'prev', total: 1000, totalCost: 400, createdAt: '2026-10-10T12:00:00.000Z' }),
      makeSale({ id: 'm1', total: 600, totalCost: 200, createdAt: '2026-11-05T12:00:00.000Z' }),
      makeSale({ id: 'today', total: 150, totalCost: 50, createdAt: '2026-11-15T10:00:00.000Z' }),
    ];
    const payables: Payable[] = [];

    const forecast = computeTodayAndMonthForecast({ sales, payables, referenceDate: ref });
    expect(forecast.todayRevenue).toBe(150);
    expect(forecast.monthRevenue).toBe(750);
    expect(forecast.daysElapsedInMonth).toBe(15);
    expect(forecast.daysInMonth).toBe(30);
    expect(forecast.projectedMonthRevenue).toBe(1500);
    expect(forecast.projectedGrowthPercent).toBe(50);
  });

  it('computes production metrics in liters, yield ratio, and produced vs sold', () => {
    const orders: ProcessingOrder[] = [
      {
        id: 'po1',
        code: 'OP-001',
        rawProductId: 'raw1',
        rawProductName: 'Açaí Bruto',
        rawProductSku: 'RAW-01',
        rawUnit: 'kg',
        rawQtyUsed: 100,
        rawUnitCost: 8,
        rawTotalCost: 800,
        extraCost: 100,
        totalCost: 900,
        totalOutputQty: 150,
        outputs: [
          {
            productId: 'p1',
            productName: 'Açaí Grosso',
            productSku: 'AC-01',
            unit: 'L',
            qty: 90,
            weightFactor: 1.2,
            allocatedTotalCost: 600,
            allocatedUnitCost: 6.67,
            batchId: 'b1',
            lotCode: 'LOT-1',
          },
          {
            productId: 'p2',
            productName: 'Açaí Médio',
            productSku: 'AC-02',
            unit: 'L',
            qty: 60,
            weightFactor: 1,
            allocatedTotalCost: 300,
            allocatedUnitCost: 5,
            batchId: 'b2',
            lotCode: 'LOT-2',
          },
        ],
        status: 'completed',
        createdAt: '2026-11-10T08:00:00.000Z',
        updatedAt: '2026-11-10T08:00:00.000Z',
      },
    ];

    const sales: Sale[] = [
      makeSale({
        items: [
          {
            productId: 'p1',
            productName: 'Açaí Grosso',
            productSku: 'AC-01',
            unit: 'L',
            qty: 40,
            unitPrice: 28,
            unitCost: 6.67,
            lineTotal: 1120,
          },
        ],
      }),
    ];

    const batches: Batch[] = [
      {
        id: 'b1',
        lotCode: 'LOT-1',
        productId: 'p1',
        productName: 'Açaí Grosso',
        productSku: 'AC-01',
        productType: 'finished',
        unit: 'L',
        initialQty: 90,
        remainingQty: 50,
        unitCost: 6.67,
        expiresAt: '2026-11-18',
        active: true,
        createdAt: '2026-11-10T08:00:00.000Z',
        updatedAt: '2026-11-10T08:00:00.000Z',
      },
    ];

    const prod = computeProductionMetrics({ orders, sales, batches, bounds: BOUNDS_NOV });
    expect(prod.litersProduced).toBe(150);
    expect(prod.rawQtyUsed).toBe(100);
    expect(prod.avgYieldRatio).toBe(1.5);
    expect(prod.avgUnitCost).toBe(6);
    expect(prod.litersSoldInPeriod).toBe(40);
    expect(prod.byProduct[0].producedQty).toBe(90);
    expect(prod.byProduct[0].soldQty).toBe(40);
    expect(prod.byProduct[0].stockRemaining).toBe(50);

    const products: Product[] = [
      {
        id: 'p1',
        name: 'Açaí Grosso',
        sku: 'AC-01',
        type: 'finished',
        unit: 'L',
        minStock: 80,
        active: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    const alerts = computeInventoryAlerts({
      products,
      batches,
      referenceDate: dayjs('2026-11-15'),
      expiryThresholdDays: 7,
    });
    expect(alerts.lowStock).toHaveLength(1);
    expect(alerts.expiringBatches).toHaveLength(1);
    expect(alerts.expiringBatches[0].daysUntilExpiry).toBe(3);
  });
});

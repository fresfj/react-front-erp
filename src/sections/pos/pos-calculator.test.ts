import type { Batch } from 'src/api/firestore/batches';

import { it, expect, describe } from 'vitest';

import {
  pickFifoBatch,
  generateSaleCode,
  calculatePosTotals,
} from './pos-calculator';

const makeBatch = (overrides: Partial<Batch>): Batch => ({
  id: 'b1',
  lotCode: 'LOTE-1',
  productId: 'p1',
  productName: 'Açaí Médio 1L',
  productSku: 'ACAI-MED',
  productType: 'finished',
  unit: 'L',
  initialQty: 40,
  remainingQty: 20,
  unitCost: 6.875,
  active: true,
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

describe('pickFifoBatch', () => {
  it('picks the oldest active batch with remainingQty > 0 for the target product', () => {
    const batches: Batch[] = [
      makeBatch({
        id: 'newer',
        lotCode: 'LOTE-NEW',
        createdAt: '2026-11-15T10:00:00.000Z',
        remainingQty: 30,
      }),
      makeBatch({
        id: 'empty-oldest',
        lotCode: 'LOTE-EMPTY',
        createdAt: '2026-11-01T10:00:00.000Z',
        remainingQty: 0,
      }),
      makeBatch({
        id: 'oldest-available',
        lotCode: 'LOTE-FIFO',
        createdAt: '2026-11-05T10:00:00.000Z',
        remainingQty: 12,
      }),
    ];

    const chosen = pickFifoBatch(batches, 'p1');
    expect(chosen?.id).toBe('oldest-available');
    expect(chosen?.lotCode).toBe('LOTE-FIFO');
  });

  it('returns null when no batch has available stock', () => {
    const batches: Batch[] = [
      makeBatch({ remainingQty: 0 }),
      makeBatch({ active: false, remainingQty: 10 }),
    ];
    expect(pickFifoBatch(batches, 'p1')).toBeNull();
  });
});

describe('calculatePosTotals', () => {
  it('computes subtotal, totalCost, grossProfit, and change across multiple payments', () => {
    const summary = calculatePosTotals({
      items: [
        { productId: 'p1', qty: 2, unitPrice: 25, unitCost: 10 }, // 50 sale, 20 cost
        { productId: 'p2', qty: 1, unitPrice: 30, unitCost: 12 }, // 30 sale, 12 cost
      ],
      discountAmount: 4, // 5% of 80
      payments: [
        { method: 'pix', amount: 50 },
        { method: 'cash', amount: 30 },
      ],
      role: 'operador',
    });

    expect(summary.subtotal).toBe(80);
    expect(summary.discountAmount).toBe(4);
    expect(summary.discountPercent).toBe(5);
    expect(summary.discountAllowed).toBe(true);
    expect(summary.total).toBe(76);
    expect(summary.totalCost).toBe(32);
    expect(summary.grossProfit).toBe(44);
    expect(summary.paidAmount).toBe(80);
    expect(summary.changeAmount).toBe(4);
    expect(summary.isPaymentComplete).toBe(true);
  });

  it('blocks discount > 5% for operador but allows it for gestor/admin', () => {
    const items = [{ productId: 'p1', qty: 1, unitPrice: 100, unitCost: 40 }];

    const opResult = calculatePosTotals({
      items,
      discountAmount: 10, // 10%
      payments: [{ method: 'cash', amount: 90 }],
      role: 'operador',
    });
    expect(opResult.discountAllowed).toBe(false);

    const managerResult = calculatePosTotals({
      items,
      discountAmount: 10, // 10%
      payments: [{ method: 'cash', amount: 90 }],
      role: 'gestor',
    });
    expect(managerResult.discountAllowed).toBe(true);
  });
});

describe('generateSaleCode', () => {
  it('generates deterministic VD-YYYYMMDD-XXXX code', () => {
    const d = new Date('2026-11-16T12:00:00Z');
    expect(generateSaleCode(d, '99A')).toBe('VD-20261116-99A');
  });
});

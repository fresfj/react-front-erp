import { it, expect, describe } from 'vitest';

import {
  normalizeStoreSlug,
  isWithinOpeningHours,
  resolveOnlineStoreOpen,
  buildOnlineOrderTotals,
  mapOnlineOrderToCreateSaleInput,
} from './online-store-domain';

describe('normalizeStoreSlug', () => {
  it('lowercases, strips accents, kebab', () => {
    expect(normalizeStoreSlug('  Açai da Praça!! ')).toBe('acai-da-praca');
  });
});

describe('isWithinOpeningHours', () => {
  it('true when now inside weekday window', () => {
    // Wednesday 2026-11-18 14:00 America/Sao_Paulo
    const now = new Date('2026-11-18T17:00:00.000Z');
    const hours = [{ day: 3, open: '10:00', close: '22:00' }];
    expect(isWithinOpeningHours(hours, now, 'America/Sao_Paulo')).toBe(true);
  });

  it('false when day marked closed', () => {
    const now = new Date('2026-11-18T17:00:00.000Z');
    const hours = [{ day: 3, open: '10:00', close: '22:00', closed: true }];
    expect(isWithinOpeningHours(hours, now, 'America/Sao_Paulo')).toBe(false);
  });
});

describe('resolveOnlineStoreOpen', () => {
  const base = {
    hasEntitlement: true,
    enabled: true,
    hours: [{ day: 3, open: '10:00', close: '22:00' }] as const,
    now: new Date('2026-11-18T17:00:00.000Z'),
    hasOpenCash: true,
    timeZone: 'America/Sao_Paulo',
  };

  it('open when all gates pass', () => {
    expect(resolveOnlineStoreOpen({ ...base, hours: [...base.hours] }).isOpen).toBe(true);
  });

  it('closedReason plan', () => {
    expect(resolveOnlineStoreOpen({ ...base, hours: [...base.hours], hasEntitlement: false })).toEqual({
      isOpen: false,
      closedReason: 'plan',
    });
  });

  it('closedReason no_open_cash', () => {
    expect(resolveOnlineStoreOpen({ ...base, hours: [...base.hours], hasOpenCash: false })).toEqual({
      isOpen: false,
      closedReason: 'no_open_cash',
    });
  });
});

describe('buildOnlineOrderTotals', () => {
  it('sums lines + delivery fee', () => {
    expect(buildOnlineOrderTotals([{ qty: 2, unitPrice: 10 }, { qty: 1, unitPrice: 5 }], 3)).toEqual({
      subtotal: 25,
      total: 28,
    });
  });
});

describe('mapOnlineOrderToCreateSaleInput', () => {
  it('maps payment on delivery and channel fields', () => {
    const sale = mapOnlineOrderToCreateSaleInput(
      {
        customerName: 'Ana',
        customerPhone: '11999999999',
        customerAddress: 'Rua A, 1',
        deliveryType: 'delivery',
        deliveryFee: 5,
        paymentMethod: 'pix',
        items: [
          {
            productId: 'p1',
            productName: 'Açaí',
            productSku: 'AC1',
            unit: 'un',
            qty: 1,
            unitPrice: 20,
            lineTotal: 20,
            notes: 'sem granola',
          },
        ],
        subtotal: 20,
        total: 25,
        notes: 'interfone 12',
      },
      { cashSessionId: 'cs1', code: 'OL-1', sellerUid: 'u1' }
    );
    expect(sale.total).toBe(25);
    expect(sale.deliveryFee).toBe(5);
    expect(sale.payments[0]).toMatchObject({ method: 'pix', amount: 25 });
    expect(sale.channel).toBe('online');
    expect(sale.cashSessionId).toBe('cs1');
  });
});

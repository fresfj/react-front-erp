import type { Sale } from 'src/api/firestore/sales';

import { it, expect, describe } from 'vitest';

import { aggregateSellerRanking } from './seller-ranking';

function sale(partial: Partial<Sale> & Pick<Sale, 'id' | 'total'>): Sale {
  return {
    code: partial.code || 'S1',
    status: partial.status || 'completed',
    items: [],
    payments: [],
    subtotal: partial.total,
    discountAmount: 0,
    discountPercent: 0,
    totalCost: partial.totalCost ?? 0,
    changeAmount: 0,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...partial,
  } as Sale;
}

describe('aggregateSellerRanking', () => {
  it('groups by sellerUid and sorts by netTotal desc', () => {
    const rows = aggregateSellerRanking([
      sale({ id: '1', total: 100, sellerUid: 'a', sellerEmail: 'a@x.com', totalCost: 40 }),
      sale({ id: '2', total: 50, sellerUid: 'b', sellerEmail: 'b@x.com', totalCost: 10 }),
      sale({ id: '3', total: 200, sellerUid: 'a', sellerEmail: 'a@x.com', totalCost: 80 }),
      sale({ id: '4', total: 999, status: 'cancelled', sellerUid: 'a', totalCost: 0 }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].sellerUid).toBe('a');
    expect(rows[0].salesCount).toBe(2);
    expect(rows[0].netTotal).toBe(300);
    expect(rows[0].grossProfit).toBe(180);
    expect(rows[1].sellerUid).toBe('b');
  });
});

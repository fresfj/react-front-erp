import { it, expect, describe } from 'vitest';

import { summarizeSellerDay, getLocalDayBoundsIso } from '../seller-day-stats';

// ----------------------------------------------------------------------

describe('seller-day-stats', () => {
  it('getLocalDayBoundsIso returns start before end covering now', () => {
    const now = new Date('2026-11-19T15:00:00');
    const { startIso, endIso } = getLocalDayBoundsIso(now);
    expect(startIso < endIso).toBe(true);
    expect(startIso <= now.toISOString()).toBe(true);
    expect(endIso >= now.toISOString()).toBe(true);
  });

  it('summarizeSellerDay counts all store sales in day and online statuses', () => {
    const { startIso, endIso } = getLocalDayBoundsIso(new Date('2026-11-19T12:00:00'));
    const result = summarizeSellerDay({
      dayStartIso: startIso,
      dayEndIso: endIso,
      sales: [
        { createdAt: '2026-11-19T10:00:00.000Z', grandTotal: 100 },
        { createdAt: '2026-11-18T10:00:00.000Z', grandTotal: 50 },
      ],
      onlineOrders: [
        { status: 'pending', createdAt: '2026-11-19T11:00:00.000Z' },
        { status: 'accepted', createdAt: '2026-11-19T11:30:00.000Z' },
        { status: 'delivered', createdAt: '2026-11-19T09:00:00.000Z' },
      ],
    });
    expect(result.salesCount).toBe(1);
    expect(result.salesTotal).toBe(100);
    expect(result.pendingOnlineCount).toBe(1);
    expect(result.inProgressOnlineCount).toBe(1);
    expect(result.openOnlineOrders).toHaveLength(2);
  });
});

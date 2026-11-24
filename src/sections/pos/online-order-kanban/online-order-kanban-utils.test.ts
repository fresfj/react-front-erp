import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { it, expect, describe } from 'vitest';

import {
  getOrderSlaInfo,
  buildOrderJourney,
  groupOrdersByColumn,
  buildWhatsappPhoneUrl,
  resolveKanbanTransition,
  filterOrdersByKanbanPeriod,
} from './online-order-kanban-utils';

// ----------------------------------------------------------------------

function makeOrder(overrides: Partial<OnlineOrder> = {}): OnlineOrder {
  return {
    id: 'ord-1',
    code: 'OL-20261121-ABCD',
    status: 'pending',
    fulfillmentStatus: 'pending',
    customerName: 'Maria Silva',
    customerPhone: '(11) 99999-1234',
    deliveryType: 'delivery',
    deliveryFee: 5,
    paymentMethod: 'pix',
    paymentChannel: 'online',
    paymentStatus: 'awaiting_confirmation',
    items: [
      {
        productId: 'p1',
        productName: 'Açaí 500ml',
        productSku: 'AC-500',
        unit: 'un',
        qty: 2,
        unitPrice: 20,
        lineTotal: 40,
      },
    ],
    subtotal: 40,
    total: 45,
    createdAt: '2026-11-21T12:00:00.000Z',
    updatedAt: '2026-11-21T12:00:00.000Z',
    ...overrides,
  };
}

describe('online-order-kanban-utils', () => {
  describe('resolveKanbanTransition', () => {
    it('allows pending -> preparing via accept action', () => {
      const res = resolveKanbanTransition(makeOrder(), 'preparing');
      expect(res).toEqual({ allowed: true, action: 'accept' });
    });

    it('blocks pending -> out_for_delivery or delivered directly', () => {
      expect(resolveKanbanTransition(makeOrder(), 'out_for_delivery')).toEqual({
        allowed: false,
        reason: 'must_accept_first',
      });
      expect(resolveKanbanTransition(makeOrder(), 'delivered')).toEqual({
        allowed: false,
        reason: 'must_accept_first',
      });
    });

    it('blocks reverting an accepted order back to pending', () => {
      const accepted = makeOrder({ status: 'accepted', fulfillmentStatus: 'preparing' });
      expect(resolveKanbanTransition(accepted, 'pending')).toEqual({
        allowed: false,
        reason: 'cannot_revert_to_pending',
      });
    });

    it('allows advancing accepted order across fulfillment columns', () => {
      const accepted = makeOrder({ status: 'accepted', fulfillmentStatus: 'accepted' });
      expect(resolveKanbanTransition(accepted, 'out_for_delivery')).toEqual({
        allowed: true,
        action: 'update_status',
        target: 'out_for_delivery',
      });
    });
  });

  describe('filterOrdersByKanbanPeriod', () => {
    it('keeps active orders from yesterday when filtering by today', () => {
      const now = new Date(2026, 10, 21, 12, 0, 0);
      const yesterdayActive = makeOrder({
        id: 'y-active',
        status: 'accepted',
        fulfillmentStatus: 'preparing',
        createdAt: new Date(2026, 10, 20, 22, 0, 0).toISOString(),
      });
      const yesterdayDelivered = makeOrder({
        id: 'y-done',
        status: 'accepted',
        fulfillmentStatus: 'delivered',
        createdAt: new Date(2026, 10, 20, 18, 0, 0).toISOString(),
      });
      const todayDelivered = makeOrder({
        id: 't-done',
        status: 'accepted',
        fulfillmentStatus: 'delivered',
        createdAt: new Date(2026, 10, 21, 9, 0, 0).toISOString(),
      });

      const filtered = filterOrdersByKanbanPeriod(
        [yesterdayActive, yesterdayDelivered, todayDelivered],
        'today',
        now
      );

      expect(filtered.map((o) => o.id)).toEqual(['y-active', 't-done']);
    });
  });

  describe('groupOrdersByColumn', () => {
    it('sorts active columns FIFO (oldest first) and excludes rejected orders', () => {
      const older = makeOrder({ id: 'old', createdAt: '2026-11-21T10:00:00.000Z' });
      const newer = makeOrder({ id: 'new', createdAt: '2026-11-21T11:00:00.000Z' });
      const rejected = makeOrder({ id: 'rej', status: 'rejected', fulfillmentStatus: 'rejected' });

      const grouped = groupOrdersByColumn([newer, older, rejected]);
      expect(grouped.pending.map((o) => o.id)).toEqual(['old', 'new']);
      expect(grouped.preparing).toHaveLength(0);
    });

    it('applies optimistic status overrides cleanly', () => {
      const pending = makeOrder({ id: 'p1', status: 'pending', fulfillmentStatus: 'pending' });
      const grouped = groupOrdersByColumn([pending], { p1: 'preparing' });
      expect(grouped.pending).toHaveLength(0);
      expect(grouped.preparing).toHaveLength(1);
      expect(grouped.preparing[0].fulfillmentStatus).toBe('preparing');
    });
  });

  describe('getOrderSlaInfo', () => {
    it('computes normal, warning and overdue severities against estimatedMinutes', () => {
      const created = '2026-11-21T12:00:00.000Z';
      const baseMs = Date.parse(created);
      const order = makeOrder({ createdAt: created, status: 'accepted', fulfillmentStatus: 'preparing' });

      expect(getOrderSlaInfo(order, 40, baseMs + 10 * 60000).severity).toBe('normal');
      expect(getOrderSlaInfo(order, 40, baseMs + 30 * 60000).severity).toBe('warning');
      expect(getOrderSlaInfo(order, 40, baseMs + 45 * 60000).severity).toBe('overdue');
    });

    it('freezes elapsed time when order is delivered instead of ticking with nowMs', () => {
      const created = '2026-11-21T12:00:00.000Z';
      const delivered = '2026-11-21T12:24:00.000Z';
      const baseMs = Date.parse(created);
      const done = makeOrder({
        createdAt: created,
        deliveredAt: delivered,
        updatedAt: delivered,
        status: 'accepted',
        fulfillmentStatus: 'delivered',
      });

      const info = getOrderSlaInfo(done, 40, baseMs + 180 * 60000);
      expect(info.severity).toBe('normal');
      expect(info.isFinished).toBe(true);
      expect(info.elapsedMinutes).toBe(24);
      expect(info.label).toBe('24 min');
    });
  });

  describe('buildOrderJourney', () => {
    it('builds ordered timeline with step deltas', () => {
      const order = makeOrder({
        status: 'accepted',
        fulfillmentStatus: 'delivered',
        createdAt: '2026-11-21T19:00:00.000Z',
        acceptedAt: '2026-11-21T19:02:00.000Z',
        preparingAt: '2026-11-21T19:05:00.000Z',
        dispatchedAt: '2026-11-21T19:20:00.000Z',
        deliveredAt: '2026-11-21T19:35:00.000Z',
      });

      const journey = buildOrderJourney(order);
      expect(journey.map((j) => j.key)).toEqual([
        'created',
        'accepted',
        'preparing',
        'dispatched',
        'delivered',
      ]);
      expect(journey[1].deltaMinutes).toBe(2);
      expect(journey[2].deltaMinutes).toBe(3);
      expect(journey[3].deltaMinutes).toBe(15);
      expect(journey[4].deltaMinutes).toBe(15);
    });
  });

  describe('buildWhatsappPhoneUrl', () => {
    it('formats Brazilian phone numbers with country code 55', () => {
      expect(buildWhatsappPhoneUrl('(11) 99999-1234')).toBe('https://wa.me/5511999991234');
      expect(buildWhatsappPhoneUrl('123')).toBeNull();
    });
  });
});

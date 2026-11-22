import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { it, expect, describe } from 'vitest';

import {
  formatKitchenTimer,
  getKitchenSlaLevel,
  buildProductionSummary,
  filterAndSortKitchenOrders,
  computeKitchenDemandSummary,
} from '../kitchen-kds-domain';

function makeOrder(partial: Partial<OnlineOrder>): OnlineOrder {
  return {
    id: 'o1',
    code: 'OL-001',
    status: 'accepted',
    fulfillmentStatus: 'accepted',
    customerName: 'Cliente',
    customerPhone: '41999990000',
    deliveryType: 'delivery',
    deliveryFee: 0,
    paymentMethod: 'pix',
    paymentChannel: 'online',
    paymentStatus: 'confirmed',
    items: [],
    subtotal: 0,
    total: 0,
    createdAt: '2026-11-22T12:00:00.000Z',
    updatedAt: '2026-11-22T12:00:00.000Z',
    ...partial,
  };
}

describe('kitchen-kds-domain', () => {
  it('filtra apenas pedidos aceitos e em preparo ordenados por ordem de chegada (FIFO)', () => {
    const orders = [
      makeOrder({ id: 'pending', status: 'pending', fulfillmentStatus: 'pending' }),
      makeOrder({ id: 'newer', fulfillmentStatus: 'preparing', createdAt: '2026-11-22T12:10:00.000Z' }),
      makeOrder({ id: 'older', fulfillmentStatus: 'accepted', createdAt: '2026-11-22T12:02:00.000Z' }),
      makeOrder({ id: 'done', fulfillmentStatus: 'delivered', createdAt: '2026-11-22T11:50:00.000Z' }),
    ];

    const queue = filterAndSortKitchenOrders(orders);
    expect(queue.map((o) => o.id)).toEqual(['older', 'newer']);
  });

  it('formata o cronômetro da cozinha corretamente', () => {
    expect(formatKitchenTimer(65)).toBe('01:05');
    expect(formatKitchenTimer(3661)).toBe('01:01:01');
  });

  it('classifica o semáforo SLA corretamente', () => {
    expect(getKitchenSlaLevel(5, 20)).toBe('on_time');
    expect(getKitchenSlaLevel(12, 20)).toBe('warning');
    expect(getKitchenSlaLevel(19, 20)).toBe('delayed');
  });

  it('calcula demanda e resumo consolidado de produção em lote', () => {
    const nowMs = Date.parse('2026-11-22T12:25:00.000Z');
    const orders = [
      makeOrder({
        id: '1',
        fulfillmentStatus: 'accepted',
        createdAt: '2026-11-22T12:00:00.000Z',
        items: [
          { productId: 'p1', productName: 'Açaí Grosso 1L', productSku: 'A1', unit: 'L', qty: 2, unitPrice: 28, lineTotal: 56 },
        ],
      }),
      makeOrder({
        id: '2',
        fulfillmentStatus: 'preparing',
        createdAt: '2026-11-22T12:15:00.000Z',
        items: [
          { productId: 'p1', productName: 'Açaí Grosso 1L', productSku: 'A1', unit: 'L', qty: 3, unitPrice: 28, lineTotal: 84 },
          { productId: 'p2', productName: 'Açaí Fino 1L', productSku: 'A2', unit: 'L', qty: 1, unitPrice: 16, lineTotal: 16 },
        ],
      }),
    ];

    const summary = computeKitchenDemandSummary(orders, nowMs, 20);
    expect(summary.queueCount).toBe(2);
    expect(summary.totalItems).toBe(6);
    expect(summary.delayedCount).toBe(1);
    expect(summary.demandLevel).toBe('high');

    const batch = buildProductionSummary(orders);
    expect(batch[0]).toEqual({
      key: 'p1',
      productName: 'Açaí Grosso 1L',
      totalQty: 5,
      orderCount: 2,
    });
    expect(batch[1].totalQty).toBe(1);
  });
});

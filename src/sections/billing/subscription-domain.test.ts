import { describe, expect, it } from 'vitest';

import {
  shouldDowngradeAfterGrace,
  mapAsaasPaymentEventToStatus,
  buildFreeSubscription,
} from './subscription-domain';

describe('shouldDowngradeAfterGrace', () => {
  it('returns false when pastDueSince is null', () => {
    expect(shouldDowngradeAfterGrace(null, 7, new Date('2026-11-17T12:00:00.000Z'))).toBe(false);
  });

  it('returns false inside grace window', () => {
    expect(
      shouldDowngradeAfterGrace(
        '2026-11-15T12:00:00.000Z',
        7,
        new Date('2026-11-17T12:00:00.000Z')
      )
    ).toBe(false);
  });

  it('returns true after graceDays elapsed', () => {
    expect(
      shouldDowngradeAfterGrace(
        '2026-11-01T12:00:00.000Z',
        7,
        new Date('2026-11-17T12:00:00.000Z')
      )
    ).toBe(true);
  });
});

describe('mapAsaasPaymentEventToStatus', () => {
  it('maps PAYMENT_RECEIVED to active', () => {
    expect(mapAsaasPaymentEventToStatus('PAYMENT_RECEIVED')).toBe('active');
  });

  it('maps PAYMENT_CONFIRMED to active', () => {
    expect(mapAsaasPaymentEventToStatus('PAYMENT_CONFIRMED')).toBe('active');
  });

  it('maps PAYMENT_OVERDUE to past_due', () => {
    expect(mapAsaasPaymentEventToStatus('PAYMENT_OVERDUE')).toBe('past_due');
  });

  it('maps unknown to null', () => {
    expect(mapAsaasPaymentEventToStatus('SOMETHING_ELSE')).toBeNull();
  });
});

describe('buildFreeSubscription', () => {
  it('returns active free shape', () => {
    const sub = buildFreeSubscription('plan_free', '2026-11-17T00:00:00.000Z');
    expect(sub.planCode).toBe('free');
    expect(sub.status).toBe('active');
    expect(sub.asaasSubscriptionId).toBeNull();
  });
});

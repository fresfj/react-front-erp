export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';
export type PlanCode = 'free' | 'pro' | 'ultra';

export function shouldDowngradeAfterGrace(
  pastDueSince: string | null | undefined,
  graceDays: number,
  now: Date
): boolean {
  if (!pastDueSince) return false;
  const start = Date.parse(pastDueSince);
  if (Number.isNaN(start)) return false;
  const days = Math.max(0, Number(graceDays) || 0);
  const elapsedMs = now.getTime() - start;
  return elapsedMs >= days * 24 * 60 * 60 * 1000;
}

export function mapAsaasPaymentEventToStatus(event: string): SubscriptionStatus | null {
  switch (event) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED':
      return 'active';
    case 'PAYMENT_OVERDUE':
      return 'past_due';
    default:
      return null;
  }
}

export function buildFreeSubscription(planId: string, nowIso: string) {
  return {
    planId,
    planCode: 'free' as const,
    status: 'active' as const,
    billingCycle: 'monthly' as const,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    pastDueSince: null,
    asaasCustomerId: null,
    asaasSubscriptionId: null,
    paymentMethod: null,
    updatedAt: nowIso,
  };
}

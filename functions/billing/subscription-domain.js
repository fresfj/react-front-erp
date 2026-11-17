function shouldDowngradeAfterGrace(pastDueSince, graceDays, now) {
  if (!pastDueSince) return false;
  const start = Date.parse(pastDueSince);
  if (Number.isNaN(start)) return false;
  const days = Math.max(0, Number(graceDays) || 0);
  const elapsedMs = now.getTime() - start;
  return elapsedMs >= days * 24 * 60 * 60 * 1000;
}

function mapAsaasPaymentEventToStatus(event) {
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

function buildFreeSubscription(planId, nowIso) {
  return {
    planId,
    planCode: 'free',
    status: 'active',
    billingCycle: 'monthly',
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

module.exports = {
  shouldDowngradeAfterGrace,
  mapAsaasPaymentEventToStatus,
  buildFreeSubscription,
};

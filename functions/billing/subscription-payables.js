// ----------------------------------------------------------------------
// Sync Active Plan / Subscription Billing → Contas a Pagar (payables)
// ----------------------------------------------------------------------

const PT_MONTHS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function nowIso() {
  return new Date().toISOString();
}

function formatMonthLabelPt(yyyyMm) {
  const parts = String(yyyyMm || '').split('-');
  if (parts.length < 2) return String(yyyyMm || '');
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return String(yyyyMm || '');
  return `${PT_MONTHS[monthIdx]}/${year}`;
}

function mapAsaasInvoiceToPayableStatus(asaasStatus) {
  const norm = String(asaasStatus || '').toUpperCase();
  if (norm === 'CONFIRMED' || norm === 'RECEIVED' || norm === 'RECEIVED_IN_CASH') {
    return 'paid';
  }
  if (norm === 'REFUNDED' || norm === 'REFUND_REQUESTED' || norm === 'DELETED') {
    return 'cancelled';
  }
  return 'open';
}

function resolveDueDateForMonth(yyyyMm, referenceIso) {
  const [yStr, mStr] = String(yyyyMm).split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let day = new Date().getUTCDate();
  if (referenceIso && /^\d{4}-\d{2}-\d{2}/.test(String(referenceIso))) {
    const parsedDay = Number(String(referenceIso).slice(8, 10));
    if (parsedDay >= 1 && parsedDay <= 31) day = parsedDay;
  }
  const clamped = Math.min(Math.max(1, day), maxDay);
  return `${yStr}-${mStr}-${String(clamped).padStart(2, '0')}`;
}

async function resolvePlanForSubscription(db, sub) {
  if (!sub || typeof sub !== 'object') return null;
  if (sub.planId) {
    const snap = await db.doc(`plans/${sub.planId}`).get();
    if (snap.exists) return { id: snap.id, ...snap.data() };
  }
  const code = String(sub.planCode || '').trim().toLowerCase();
  if (!code) return null;
  const q = await db.collection('plans').where('code', '==', code).limit(1).get();
  if (!q.empty) return { id: q.docs[0].id, ...q.docs[0].data() };
  return null;
}

async function syncInvoiceToPayable({
  db,
  enterpriseId,
  planName,
  planCode,
  billingMode,
  invoice,
}) {
  const asaasPaymentId = String(invoice?.asaasPaymentId || invoice?.id || '').trim();
  const amount = Number(invoice?.value || 0);
  if (!asaasPaymentId || amount <= 0) {
    return null;
  }

  const payableId = `sub_${asaasPaymentId}`;
  const payableRef = db.doc(`enterprises/${enterpriseId}/payables/${payableId}`);
  const existing = await payableRef.get();
  const now = nowIso();

  const dueDate =
    invoice?.dueDate && /^\d{4}-\d{2}-\d{2}/.test(String(invoice.dueDate))
      ? String(invoice.dueDate).slice(0, 10)
      : now.slice(0, 10);
  const monthKey = dueDate.slice(0, 7);
  const labelName = String(planName || planCode || 'Assinatura').trim();
  const status = mapAsaasInvoiceToPayableStatus(invoice?.status);

  const payload = {
    description: `Assinatura Plano ${labelName} (${formatMonthLabelPt(monthKey)})`,
    category: 'subscription',
    amount,
    startDate: dueDate,
    dueDate,
    competenceDate: dueDate,
    dreClass: 'operating',
    supplierName: `Plano ${labelName} — Assinatura`,
    recurrence: billingMode === 'one_time' ? 'none' : 'monthly',
    status,
    installmentIndex: 1,
    installmentCount: 1,
    active: true,
    source: 'subscription',
    planCode: String(planCode || '').toLowerCase(),
    planName: labelName,
    asaasPaymentId,
    billingCycle: 'monthly',
    ...(invoice?.paidAt ? { paidAt: String(invoice.paidAt) } : {}),
    updatedAt: now,
    ...(existing.exists ? {} : { createdAt: now }),
  };

  await payableRef.set(payload, { merge: true });
  return { id: payableId, monthKey, status, amount };
}

async function syncEnterpriseSubscriptionPayables({
  db,
  enterpriseId,
  enterpriseData,
  now = new Date(),
}) {
  const entRef = db.doc(`enterprises/${enterpriseId}`);
  const enterprise = enterpriseData || (await entRef.get()).data();
  if (!enterprise) {
    return {
      enterpriseId,
      skippedReason: 'enterprise_not_found',
      invoicesSynced: 0,
      monthlyCreated: false,
    };
  }

  const enterpriseName = String(enterprise.tradeName || enterprise.name || enterpriseId);
  const sub = enterprise.subscription || {};
  const subStatus = String(sub.status || '').toLowerCase();
  const plan = await resolvePlanForSubscription(db, sub);
  const planCode = String(plan?.code || sub.planCode || 'free').toLowerCase();
  const planName = String(plan?.name || (planCode ? planCode.toUpperCase() : 'Free'));
  const priceMonthly = Number(plan?.priceMonthly || 0);
  const billingMode = String(sub.billingMode || 'recurring');

  // 1. Sync any paid/open subscriptionInvoices with value > 0
  const invSnap = await entRef.collection('subscriptionInvoices').get();
  const coveredMonths = new Set();
  let invoicesSynced = 0;

  for (const docSnap of invSnap.docs) {
    const inv = docSnap.data() || {};
    const invValue = Number(inv.value || 0);
    if (invValue <= 0) continue;

    // Only include invoices from paid plans (or already paid invoices)
    const invStatus = mapAsaasInvoiceToPayableStatus(inv.status);
    if (planCode === 'free' && invStatus !== 'paid') continue;

    const synced = await syncInvoiceToPayable({
      db,
      enterpriseId,
      planName,
      planCode,
      billingMode,
      invoice: { ...inv, asaasPaymentId: inv.asaasPaymentId || docSnap.id },
    });
    if (synced) {
      invoicesSynced += 1;
      coveredMonths.add(synced.monthKey);
    }
  }

  // 2. If enterprise has NO active/past_due paid plan (e.g. Free or canceled), do NOT create monthly payable
  const isPaidPlan = planCode !== 'free' && priceMonthly > 0;
  const isTrackableStatus =
    subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due';

  if (!isPaidPlan || !isTrackableStatus) {
    return {
      enterpriseId,
      enterpriseName,
      planCode,
      planName,
      subscriptionStatus: subStatus || 'none',
      invoicesSynced,
      monthlyCreated: false,
      skippedReason: !isPaidPlan ? 'free_or_no_paid_plan' : `status_${subStatus || 'none'}`,
    };
  }

  // 3. Monthly recurrence entry for the current month if no invoice already covers this month
  const currentYm = now.toISOString().slice(0, 7);
  if (coveredMonths.has(currentYm)) {
    return {
      enterpriseId,
      enterpriseName,
      planCode,
      planName,
      subscriptionStatus: subStatus,
      invoicesSynced,
      monthlyCreated: false,
      skippedReason: 'covered_by_invoice',
    };
  }

  const payableId = `sub_plan_${planCode}_${currentYm.replace('-', '')}`;
  const payableRef = entRef.collection('payables').doc(payableId);
  const existing = await payableRef.get();
  const dueDate = resolveDueDateForMonth(
    currentYm,
    sub.currentPeriodStart || sub.currentPeriodEnd
  );
  const status = subStatus === 'active' ? 'paid' : 'open';
  const ts = nowIso();

  await payableRef.set(
    {
      description: `Assinatura Plano ${planName} (${formatMonthLabelPt(currentYm)})`,
      category: 'subscription',
      amount: priceMonthly,
      startDate: dueDate,
      dueDate,
      competenceDate: dueDate,
      dreClass: 'operating',
      supplierName: `Plano ${planName} — Assinatura`,
      recurrence: billingMode === 'one_time' ? 'none' : 'monthly',
      status,
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
      source: 'subscription',
      planCode,
      planName,
      billingCycle: 'monthly',
      ...(status === 'paid' && !existing.data()?.paidAt ? { paidAt: ts } : {}),
      updatedAt: ts,
      ...(existing.exists ? {} : { createdAt: ts }),
    },
    { merge: true }
  );

  return {
    enterpriseId,
    enterpriseName,
    planCode,
    planName,
    subscriptionStatus: subStatus,
    invoicesSynced,
    monthlyCreated: true,
    payableId,
    amount: priceMonthly,
    status,
  };
}

module.exports = {
  formatMonthLabelPt,
  mapAsaasInvoiceToPayableStatus,
  syncInvoiceToPayable,
  syncEnterpriseSubscriptionPayables,
};

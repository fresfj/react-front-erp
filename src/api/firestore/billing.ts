import type { Plan, PlanCode } from './plans';

import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, getDocs } from 'firebase/firestore';

import { FIRESTORE, FUNCTIONS } from 'src/lib/firebase';

import { enterpriseCollection } from './paths';

// ----------------------------------------------------------------------

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';
export type BillingPaymentMethod = 'pix' | 'boleto' | 'credit_card';

export type EnterpriseSubscription = {
  planId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  billingCycle: 'monthly';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: string | null;
  asaasCustomerId: string | null;
  asaasSubscriptionId: string | null;
  paymentMethod: BillingPaymentMethod | null;
  updatedAt: string;
};

export type PlatformBillingSettings = {
  graceDays: number;
  asaasEnv: 'sandbox' | 'production';
  asaasApiKeyConfigured: boolean;
  asaasWebhookTokenConfigured: boolean;
  updatedAt: string;
  updatedByUid?: string;
};

export type SubscriptionInvoice = {
  id: string;
  asaasPaymentId: string;
  status: string;
  value: number;
  dueDate: string;
  paidAt: string | null;
  invoiceUrl: string | null;
  billingType: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicBillingConfig = {
  graceDays: number;
};

function mapSubscription(data: Record<string, unknown>): EnterpriseSubscription {
  const codeRaw = String(data.planCode ?? 'free');
  const planCode: PlanCode =
    codeRaw === 'pro' || codeRaw === 'ultra' || codeRaw === 'free' ? codeRaw : 'free';
  const statusRaw = String(data.status ?? 'active');
  const status: SubscriptionStatus =
    statusRaw === 'past_due' ||
    statusRaw === 'canceled' ||
    statusRaw === 'incomplete' ||
    statusRaw === 'active'
      ? statusRaw
      : 'active';
  const pmRaw = data.paymentMethod != null ? String(data.paymentMethod) : null;
  const paymentMethod: BillingPaymentMethod | null =
    pmRaw === 'pix' || pmRaw === 'boleto' || pmRaw === 'credit_card' ? pmRaw : null;

  return {
    planId: String(data.planId ?? ''),
    planCode,
    status,
    billingCycle: 'monthly',
    currentPeriodStart:
      data.currentPeriodStart != null ? String(data.currentPeriodStart) : null,
    currentPeriodEnd: data.currentPeriodEnd != null ? String(data.currentPeriodEnd) : null,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
    pastDueSince: data.pastDueSince != null ? String(data.pastDueSince) : null,
    asaasCustomerId: data.asaasCustomerId != null ? String(data.asaasCustomerId) : null,
    asaasSubscriptionId:
      data.asaasSubscriptionId != null ? String(data.asaasSubscriptionId) : null,
    paymentMethod,
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export function mapEnterpriseSubscription(
  data: unknown
): EnterpriseSubscription | undefined {
  if (!data || typeof data !== 'object') return undefined;
  return mapSubscription(data as Record<string, unknown>);
}

function mapInvoice(id: string, data: Record<string, unknown>): SubscriptionInvoice {
  return {
    id,
    asaasPaymentId: String(data.asaasPaymentId ?? id),
    status: String(data.status ?? ''),
    value: Number(data.value ?? 0),
    dueDate: String(data.dueDate ?? ''),
    paidAt: data.paidAt != null ? String(data.paidAt) : null,
    invoiceUrl: data.invoiceUrl != null ? String(data.invoiceUrl) : null,
    billingType: String(data.billingType ?? ''),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

function mapBillingSettings(data: Record<string, unknown>): PlatformBillingSettings {
  return {
    graceDays: Number(data.graceDays ?? 7),
    asaasEnv: data.asaasEnv === 'production' ? 'production' : 'sandbox',
    asaasApiKeyConfigured: Boolean(data.asaasApiKeyConfigured),
    asaasWebhookTokenConfigured: Boolean(data.asaasWebhookTokenConfigured),
    updatedAt: String(data.updatedAt ?? ''),
    updatedByUid: data.updatedByUid != null ? String(data.updatedByUid) : undefined,
  };
}

async function call<TReq extends object, TRes>(name: string, data: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq, TRes>(FUNCTIONS, name);
  const result = await fn(data);
  return result.data;
}

export async function getBillingSettings(): Promise<PlatformBillingSettings | null> {
  const snap = await getDoc(doc(FIRESTORE, 'platformSettings', 'billing'));
  if (!snap.exists()) return null;
  return mapBillingSettings(snap.data() as Record<string, unknown>);
}

export async function listSubscriptionInvoices(
  enterpriseId: string
): Promise<SubscriptionInvoice[]> {
  const snap = await getDocs(enterpriseCollection(enterpriseId, 'subscriptionInvoices'));
  return snap.docs.map((item) =>
    mapInvoice(item.id, item.data() as Record<string, unknown>)
  );
}

export function saveBillingSettings(input: {
  graceDays: number;
  asaasEnv: 'sandbox' | 'production';
  asaasApiKey?: string;
  asaasWebhookToken?: string;
}) {
  return call<typeof input, PlatformBillingSettings>('saveBillingSettings', input);
}

export function upsertPlan(
  input: Omit<Plan, 'createdAt' | 'updatedAt'> & { id?: string }
) {
  return call<typeof input, Plan>('upsertPlan', input);
}

export function deactivatePlan(planId: string) {
  return call<{ planId: string }, void>('deactivatePlan', { planId });
}

export function startSubscription(input: {
  enterpriseId: string;
  planId: string;
  paymentMethod: BillingPaymentMethod;
  creditCardToken?: string;
}) {
  return call<
    typeof input,
    { subscription: EnterpriseSubscription; paymentUrl?: string | null }
  >('startSubscription', input);
}

export function cancelSubscriptionAtPeriodEnd(enterpriseId: string) {
  return call<{ enterpriseId: string }, EnterpriseSubscription>(
    'cancelSubscriptionAtPeriodEnd',
    { enterpriseId }
  );
}

export function getPublicBillingConfig() {
  return call<Record<string, never>, PublicBillingConfig>('getPublicBillingConfig', {});
}

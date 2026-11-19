import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';

import { FIRESTORE, FUNCTIONS } from 'src/lib/firebase';

import { enterpriseCollection } from './paths';

import type { Plan, PlanCode } from './plans';

// ----------------------------------------------------------------------

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';
export type BillingPaymentMethod = 'pix' | 'credit_card' | 'boleto';

export type CreditCardInput = {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
};

export type BillingAddressInput = {
  name?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

export type PersistedBillingCard = {
  id: string;
  cardType: 'visa' | 'mastercard';
  cardNumber: string;
  holderName: string;
  expiryMonth: string;
  expiryYear: string;
  primary: boolean;
  creditCardToken?: string | null;
  billingAddress: {
    name: string;
    phone: string;
    zipCode: string;
    address: string;
    addressNumber: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  useCompanyAddress: boolean;
};

export type PixQrPayload = {
  encodedImage: string;
  payload: string;
  expirationDate?: string | null;
};

export type EnterpriseSubscription = {
  planId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  billingCycle: 'monthly';
  /** recurring = cartão Asaas; one_time = PIX/boleto mensal avulso */
  billingMode?: 'recurring' | 'one_time';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: string | null;
  asaasCustomerId: string | null;
  asaasSubscriptionId: string | null;
  asaasCreditCardToken?: string | null;
  pendingPlanId?: string | null;
  pendingPlanCode?: PlanCode | null;
  paymentMethod: BillingPaymentMethod | null;
  updatedAt: string;
};

export type StartSubscriptionResult = {
  subscription: EnterpriseSubscription;
  paymentUrl?: string | null;
  asaasPaymentId?: string | null;
  paymentStatus?: string | null;
  creditCardToken?: string | null;
  pix?: PixQrPayload | null;
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
  const pendingCodeRaw = data.pendingPlanCode != null ? String(data.pendingPlanCode) : null;
  const pendingPlanCode: PlanCode | null =
    pendingCodeRaw === 'pro' || pendingCodeRaw === 'ultra' || pendingCodeRaw === 'free'
      ? pendingCodeRaw
      : null;
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

  const billingMode =
    data.billingMode === 'one_time' || data.billingMode === 'recurring'
      ? data.billingMode
      : paymentMethod === 'pix' || paymentMethod === 'boleto'
        ? 'one_time'
        : paymentMethod === 'credit_card'
          ? 'recurring'
          : undefined;

  return {
    planId: String(data.planId ?? ''),
    planCode,
    status,
    billingCycle: 'monthly',
    billingMode,
    currentPeriodStart:
      data.currentPeriodStart != null ? String(data.currentPeriodStart) : null,
    currentPeriodEnd: data.currentPeriodEnd != null ? String(data.currentPeriodEnd) : null,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
    pastDueSince: data.pastDueSince != null ? String(data.pastDueSince) : null,
    asaasCustomerId: data.asaasCustomerId != null ? String(data.asaasCustomerId) : null,
    asaasSubscriptionId:
      data.asaasSubscriptionId != null ? String(data.asaasSubscriptionId) : null,
    asaasCreditCardToken:
      data.asaasCreditCardToken != null ? String(data.asaasCreditCardToken) : null,
    pendingPlanId: data.pendingPlanId != null ? String(data.pendingPlanId) : null,
    pendingPlanCode,
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

export function mapEnterpriseBillingCards(raw: unknown): PersistedBillingCard[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const addr =
        item.billingAddress && typeof item.billingAddress === 'object'
          ? (item.billingAddress as Record<string, unknown>)
          : {};
      return {
        id: String(item.id ?? `card_${Math.random().toString(36).slice(2, 8)}`),
        cardType: item.cardType === 'visa' ? 'visa' : 'mastercard',
        cardNumber: String(item.cardNumber ?? '**** **** **** 0000'),
        holderName: String(item.holderName ?? ''),
        expiryMonth: String(item.expiryMonth ?? ''),
        expiryYear: String(item.expiryYear ?? ''),
        primary: Boolean(item.primary),
        creditCardToken:
          item.creditCardToken != null && String(item.creditCardToken).trim()
            ? String(item.creditCardToken).trim()
            : null,
        billingAddress: {
          name: String(addr.name ?? ''),
          phone: String(addr.phone ?? ''),
          zipCode: String(addr.zipCode ?? ''),
          address: String(addr.address ?? ''),
          addressNumber: String(addr.addressNumber ?? ''),
          complement: addr.complement ? String(addr.complement) : '',
          neighborhood: String(addr.neighborhood ?? ''),
          city: String(addr.city ?? ''),
          state: String(addr.state ?? ''),
        },
        useCompanyAddress: item.useCompanyAddress !== false,
      };
    });
}

export async function saveEnterpriseBillingCards(
  enterpriseId: string,
  cards: PersistedBillingCard[]
): Promise<void> {
  const ref = doc(FIRESTORE, 'enterprises', enterpriseId);
  const sanitized = cards.map((card) => ({
    id: card.id,
    cardType: card.cardType,
    cardNumber: card.cardNumber,
    holderName: card.holderName,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    primary: Boolean(card.primary),
    creditCardToken: card.creditCardToken || null,
    billingAddress: {
      name: card.billingAddress.name || '',
      phone: card.billingAddress.phone || '',
      zipCode: card.billingAddress.zipCode || '',
      address: card.billingAddress.address || '',
      addressNumber: card.billingAddress.addressNumber || '',
      complement: card.billingAddress.complement || '',
      neighborhood: card.billingAddress.neighborhood || '',
      city: card.billingAddress.city || '',
      state: card.billingAddress.state || '',
    },
    useCompanyAddress: Boolean(card.useCompanyAddress),
  }));
  await updateDoc(ref, {
    billingCards: sanitized,
    updatedAt: new Date().toISOString(),
  });
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
  input: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
) {
  return call<typeof input, Plan>('upsertPlan', input);
}

export function deactivatePlan(planId: string) {
  return call<{ planId: string }, void>('deactivatePlan', { planId });
}

export function tokenizeBillingCard(input: {
  enterpriseId: string;
  creditCard: CreditCardInput;
  billingAddress?: BillingAddressInput;
}) {
  return call<typeof input, { creditCardToken: string; cardBrand?: string; last4?: string }>(
    'tokenizeBillingCard',
    input
  );
}

export function startSubscription(input: {
  enterpriseId: string;
  planId: string;
  paymentMethod: 'pix' | 'credit_card';
  creditCard?: CreditCardInput;
  billingAddress?: BillingAddressInput;
  creditCardToken?: string;
  remoteIp?: string;
}) {
  return call<typeof input, StartSubscriptionResult>('startSubscription', input);
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

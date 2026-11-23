import type { TenantRole } from 'src/auth/firebase-claims';
import type {
  DeliveryAreaConfig,
  DeliveryRadiusTier,
  DeliveryPricingMode,
  DeliveryNeighborhoodRule,
} from 'src/sections/online-store/delivery-area-domain';

import { httpsCallable } from 'firebase/functions';
import {
  doc,
  query,
  getDoc,
  getDocs,
  orderBy,
  updateDoc,
  collection,
} from 'firebase/firestore';

import { FIRESTORE, FUNCTIONS } from 'src/lib/firebase';

import { omitUndefined } from './omit-undefined';
import { mapEnterpriseBillingCards, mapEnterpriseSubscription } from './billing';

import type { PersistedBillingCard, EnterpriseSubscription } from './billing';

// ----------------------------------------------------------------------

export type ReceiptModelType = '58mm' | '80mm' | 'a5';

export type { EnterpriseSubscription };

export type OnlineStoreDayHours = {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  open: string;
  close: string;
  closed?: boolean;
};

export type OnlinePayOnDeliveryMethod = 'cash' | 'pix' | 'debit_card' | 'credit_card';

export type LoyaltyRewardType = 'discount_fixed' | 'discount_percent' | 'free_product';

export type OnlineStoreLoyaltyConfig = {
  enabled: boolean;
  stampsGoal: number;
  reaisPerPoint: number;
  minOrderValue?: number;
  rewardType: LoyaltyRewardType;
  rewardValue?: number;
  rewardDescription?: string;
};

export type OnlineStoreConfig = {
  enabled: boolean;
  slug: string;
  openingHours: OnlineStoreDayHours[];
  estimatedMinutes: number;
  acceptDelivery: boolean;
  acceptPickup: boolean;
  acceptTableOrders?: boolean;
  defaultDeliveryFee: number;
  paymentMethodsOnDelivery: OnlinePayOnDeliveryMethod[];
  acceptOnlinePix?: boolean;
  pixKey?: string;
  pixMerchantName?: string;
  pixMerchantCity?: string;
  whatsapp?: string;
  description?: string;
  instagramUrl?: string;
  googleReviewUrl?: string;
  logoUrl?: string;
  bannerUrl?: string;
  bannerFit?: 'cover' | 'contain';
  bannerPositionY?: number;
  logoFit?: 'cover' | 'contain';
  minOrderAmount?: number;
  deliveryArea?: DeliveryAreaConfig;
  loyalty?: OnlineStoreLoyaltyConfig;
};

/** Tema / layout da empresa (Settings Minimals por tenant). */
export type EnterpriseUiSettings = {
  colorScheme?: 'light' | 'dark';
  primaryColor?: 'default' | 'cyan' | 'purple' | 'blue' | 'orange' | 'red';
  contrast?: 'default' | 'hight';
  navColor?: 'integrate' | 'apparent';
  navLayout?: 'vertical' | 'horizontal' | 'mini';
  compactLayout?: boolean;
  fontFamily?: string;
  fontSize?: number;
};

export type Enterprise = {
  id: string;
  name: string;
  active: boolean;
  adminEmail?: string | null;
  adminUid?: string | null;
  /** Aparência exclusiva da empresa (claro/escuro, cor, nav…). */
  uiSettings?: EnterpriseUiSettings;
  document?: string;
  tradeName?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  stateRegistration?: string;
  // Configuração Fiscal e Impressão de Cupom (NFC-e / Recibo)
  taxRegime?: 'simples' | 'presumido' | 'real' | 'mei';
  nfceEnabled?: boolean;
  hasFiscalSecrets?: boolean;
  fiscalIssuerProvider?: 'sefaz-simulator' | 'sefaz-direct' | 'focus' | 'plugnotas' | 'nuvemfiscal' | null;
  nfceCscId?: string;
  nfceSeries?: string;
  nfceEnvironment?: 'homologation' | 'production';
  /** Public A1 metadata only — never the PFX/password */
  a1Thumbprint?: string;
  a1ExpiresAt?: string;
  receiptFooterMessage?: string;
  receiptDefaultModel?: ReceiptModelType;
  receiptShowLogo?: boolean;
  receiptBold?: boolean;
  // Taxas de Pagamento (Maquininha) e Entrega (DRE)
  defaultDeliveryFee?: number;
  passPaymentFeesToCustomer?: boolean;
  creditCardFeeRate?: number;
  creditCardInstallmentFeeRate?: number;
  debitCardFeeRate?: number;
  pixFeeRate?: number;
  pixFeeFixed?: number;
  creditTabFeeRate?: number;
  minInstallmentAmount?: number;
  onlineStore?: OnlineStoreConfig;
  subscription?: EnterpriseSubscription;
  billingCards?: PersistedBillingCard[];
  createdAt?: string;
  updatedAt?: string;
};

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

export type EnterpriseMember = {
  uid: string;
  email?: string;
  role?: TenantRole | string;
  displayName?: string;
  invitedAt?: string;
  updatedAt?: string;
};

function mapDeliveryArea(raw: unknown): DeliveryAreaConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Record<string, unknown>;
  const rawMode = String(d.mode ?? 'fixed');
  const mode: DeliveryPricingMode =
    rawMode === 'radius' || rawMode === 'neighborhood' ? rawMode : 'fixed';
  const radiusTiers: DeliveryRadiusTier[] = Array.isArray(d.radiusTiers)
    ? d.radiusTiers
        .filter((t) => t && typeof t === 'object')
        .map((t, idx) => {
          const item = t as Record<string, unknown>;
          return {
            id: String(item.id || `tier-${idx + 1}`),
            maxKm: Number(item.maxKm ?? 0),
            fee: Number(item.fee ?? 0),
            estimatedMinutes: Number(item.estimatedMinutes ?? 35),
            active: item.active !== false,
            color: optStr(item.color),
          };
        })
    : [];
  const neighborhoods: DeliveryNeighborhoodRule[] = Array.isArray(d.neighborhoods)
    ? d.neighborhoods
        .filter((n) => n && typeof n === 'object')
        .map((n, idx) => {
          const item = n as Record<string, unknown>;
          return {
            id: String(item.id || `nb-${idx + 1}`),
            name: String(item.name ?? ''),
            city: optStr(item.city),
            fee: Number(item.fee ?? 0),
            estimatedMinutes: Number(item.estimatedMinutes ?? 35),
            active: item.active !== false,
          };
        })
    : [];
  return {
    mode,
    originLat: typeof d.originLat === 'number' && Number.isFinite(d.originLat) ? d.originLat : undefined,
    originLng: typeof d.originLng === 'number' && Number.isFinite(d.originLng) ? d.originLng : undefined,
    originLabel: optStr(d.originLabel),
    distanceFactor:
      typeof d.distanceFactor === 'number' && Number.isFinite(d.distanceFactor)
        ? d.distanceFactor
        : 1.25,
    radiusTiers,
    neighborhoods,
    blockOutsideArea: d.blockOutsideArea !== false,
  };
}

function mapOnlineStore(raw: unknown): OnlineStoreConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  const hoursRaw = Array.isArray(data.openingHours) ? data.openingHours : [];
  const methodsRaw = Array.isArray(data.paymentMethodsOnDelivery)
    ? data.paymentMethodsOnDelivery
    : [];
  return {
    enabled: data.enabled === true,
    slug: String(data.slug ?? ''),
    openingHours: hoursRaw.map((h) => {
      const row = (h || {}) as Record<string, unknown>;
      const dayNum = Number(row.day ?? 0);
      const day = (dayNum >= 0 && dayNum <= 6 ? dayNum : 0) as OnlineStoreDayHours['day'];
      return {
        day,
        open: String(row.open ?? '09:00'),
        close: String(row.close ?? '18:00'),
        closed: row.closed === true,
      };
    }),
    estimatedMinutes: Number(data.estimatedMinutes ?? 40),
    acceptDelivery: data.acceptDelivery !== false,
    acceptPickup: data.acceptPickup !== false,
    acceptTableOrders: data.acceptTableOrders !== false,
    defaultDeliveryFee: Number(data.defaultDeliveryFee ?? 0),
    paymentMethodsOnDelivery: methodsRaw
      .map((m) => String(m))
      .filter((m): m is OnlinePayOnDeliveryMethod =>
        m === 'cash' || m === 'pix' || m === 'debit_card' || m === 'credit_card'
      ),
    acceptOnlinePix: data.acceptOnlinePix !== false,
    pixKey: optStr(data.pixKey),
    pixMerchantName: optStr(data.pixMerchantName),
    pixMerchantCity: optStr(data.pixMerchantCity),
    whatsapp: optStr(data.whatsapp),
    description: optStr(data.description),
    instagramUrl: optStr(data.instagramUrl),
    googleReviewUrl: optStr(data.googleReviewUrl),
    logoUrl: optStr(data.logoUrl),
    bannerUrl: optStr(data.bannerUrl),
    bannerFit: data.bannerFit === 'contain' ? 'contain' : 'cover',
    bannerPositionY: typeof data.bannerPositionY === 'number' ? data.bannerPositionY : 50,
    logoFit: data.logoFit === 'contain' ? 'contain' : 'cover',
    minOrderAmount: Number(data.minOrderAmount || 0),
    deliveryArea: mapDeliveryArea(data.deliveryArea),
    loyalty: mapLoyaltyConfig(data.loyalty),
  };
}

function mapLoyaltyConfig(raw: unknown): OnlineStoreLoyaltyConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const rewardTypeRaw = String(r.rewardType ?? 'discount_fixed');
  const rewardType: LoyaltyRewardType =
    rewardTypeRaw === 'discount_percent' || rewardTypeRaw === 'free_product'
      ? rewardTypeRaw
      : 'discount_fixed';
  return {
    enabled: r.enabled === true,
    stampsGoal: Math.min(20, Math.max(2, Math.round(Number(r.stampsGoal) || 10))),
    reaisPerPoint: Math.max(1, Number(r.reaisPerPoint) || 10),
    minOrderValue: Math.max(0, Number(r.minOrderValue) || 0),
    rewardType,
    rewardValue: Math.max(0, Number(r.rewardValue) || 0),
    rewardDescription: optStr(r.rewardDescription),
  };
}

function mapEnterprise(id: string, data: Record<string, unknown>): Enterprise {
  return {
    id,
    name: String(data.name ?? ''),
    active: data.active !== false,
    adminEmail: data.adminEmail != null ? String(data.adminEmail) : null,
    adminUid: data.adminUid != null ? String(data.adminUid) : null,
    document: optStr(data.document),
    tradeName: optStr(data.tradeName),
    phone: optStr(data.phone),
    zipCode: optStr(data.zipCode),
    address: optStr(data.address),
    addressNumber: optStr(data.addressNumber),
    complement: optStr(data.complement),
    neighborhood: optStr(data.neighborhood),
    city: optStr(data.city),
    state: optStr(data.state),
    stateRegistration: optStr(data.stateRegistration),
  taxRegime:
      data.taxRegime === 'presumido' ||
      data.taxRegime === 'real' ||
      data.taxRegime === 'mei' ||
      data.taxRegime === 'simples'
        ? data.taxRegime
        : undefined,
    nfceEnabled: data.nfceEnabled === true,
    hasFiscalSecrets: data.hasFiscalSecrets === true,
    fiscalIssuerProvider:
      data.fiscalIssuerProvider === 'sefaz-simulator' ||
      data.fiscalIssuerProvider === 'sefaz-direct' ||
      data.fiscalIssuerProvider === 'focus' ||
      data.fiscalIssuerProvider === 'plugnotas' ||
      data.fiscalIssuerProvider === 'nuvemfiscal'
        ? data.fiscalIssuerProvider
        : null,
    nfceCscId: optStr(data.nfceCscId),
    nfceSeries: optStr(data.nfceSeries) ?? '1',
    nfceEnvironment:
      data.nfceEnvironment === 'production' ? 'production' : 'homologation',
    a1Thumbprint: optStr(data.a1Thumbprint),
    a1ExpiresAt: optStr(data.a1ExpiresAt),
    receiptFooterMessage:
      optStr(data.receiptFooterMessage) ?? 'OBRIGADO PELA PREFERÊNCIA! VOLTE SEMPRE',
    receiptDefaultModel:
      data.receiptDefaultModel === '58mm' ||
      data.receiptDefaultModel === '80mm' ||
      data.receiptDefaultModel === 'a5'
        ? (data.receiptDefaultModel as ReceiptModelType)
        : '58mm',
    receiptShowLogo: data.receiptShowLogo !== false,
    receiptBold: data.receiptBold !== false,
    defaultDeliveryFee:
      data.defaultDeliveryFee != null ? Number(data.defaultDeliveryFee) : 0,
    passPaymentFeesToCustomer: Boolean(data.passPaymentFeesToCustomer),
    creditCardFeeRate:
      data.creditCardFeeRate != null ? Number(data.creditCardFeeRate) : 2.15,
    creditCardInstallmentFeeRate:
      data.creditCardInstallmentFeeRate != null
        ? Number(data.creditCardInstallmentFeeRate)
        : 1.5,
    debitCardFeeRate:
      data.debitCardFeeRate != null ? Number(data.debitCardFeeRate) : 1.29,
    pixFeeRate: data.pixFeeRate != null ? Number(data.pixFeeRate) : 0,
    pixFeeFixed: data.pixFeeFixed != null ? Number(data.pixFeeFixed) : 0,
    creditTabFeeRate:
      data.creditTabFeeRate != null ? Number(data.creditTabFeeRate) : 0,
    minInstallmentAmount:
      data.minInstallmentAmount != null ? Number(data.minInstallmentAmount) : 15,
    onlineStore: mapOnlineStore(data.onlineStore),
    subscription: mapEnterpriseSubscription(data.subscription),
    billingCards: mapEnterpriseBillingCards(data.billingCards),
    uiSettings: mapUiSettings(data.uiSettings),
    createdAt: data.createdAt != null ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
  };
}

function mapUiSettings(raw: unknown): EnterpriseUiSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  const primaryColors = new Set(['default', 'cyan', 'purple', 'blue', 'orange', 'red']);
  const navLayouts = new Set(['vertical', 'horizontal', 'mini']);
  const out: EnterpriseUiSettings = {};

  if (data.colorScheme === 'light' || data.colorScheme === 'dark') {
    out.colorScheme = data.colorScheme;
  }
  if (typeof data.primaryColor === 'string' && primaryColors.has(data.primaryColor)) {
    out.primaryColor = data.primaryColor as EnterpriseUiSettings['primaryColor'];
  }
  if (data.contrast === 'default' || data.contrast === 'hight') {
    out.contrast = data.contrast;
  }
  if (data.navColor === 'integrate' || data.navColor === 'apparent') {
    out.navColor = data.navColor;
  }
  if (typeof data.navLayout === 'string' && navLayouts.has(data.navLayout)) {
    out.navLayout = data.navLayout as EnterpriseUiSettings['navLayout'];
  }
  if (typeof data.compactLayout === 'boolean') {
    out.compactLayout = data.compactLayout;
  }
  if (typeof data.fontFamily === 'string' && data.fontFamily) {
    out.fontFamily = data.fontFamily;
  }
  if (typeof data.fontSize === 'number' && Number.isFinite(data.fontSize)) {
    out.fontSize = data.fontSize;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export type EnterpriseAddressInput = {
  document?: string;
  tradeName?: string;
  phone?: string;
  zipCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  stateRegistration?: string;
  taxRegime?: 'simples' | 'presumido' | 'real' | 'mei';
  nfceEnabled?: boolean;
  fiscalIssuerProvider?: 'sefaz-simulator' | 'sefaz-direct' | 'focus' | 'plugnotas' | 'nuvemfiscal' | null;
  nfceCscId?: string;
  nfceSeries?: string;
  nfceEnvironment?: 'homologation' | 'production';
  receiptFooterMessage?: string;
  receiptDefaultModel?: ReceiptModelType;
  receiptShowLogo?: boolean;
  receiptBold?: boolean;
  defaultDeliveryFee?: number;
  passPaymentFeesToCustomer?: boolean;
  creditCardFeeRate?: number;
  creditCardInstallmentFeeRate?: number;
  debitCardFeeRate?: number;
  pixFeeRate?: number;
  pixFeeFixed?: number;
  creditTabFeeRate?: number;
  minInstallmentAmount?: number;
};

export async function listEnterprisesClient(): Promise<Enterprise[]> {
  const snap = await getDocs(query(collection(FIRESTORE, 'enterprises'), orderBy('name')));
  return snap.docs.map((item) => mapEnterprise(item.id, item.data() as Record<string, unknown>));
}

export async function getEnterprise(id: string): Promise<Enterprise | null> {
  const snap = await getDoc(doc(FIRESTORE, 'enterprises', id));
  if (!snap.exists()) return null;
  return mapEnterprise(snap.id, snap.data() as Record<string, unknown>);
}

export async function listEnterpriseMembersClient(
  enterpriseId: string
): Promise<EnterpriseMember[]> {
  const snap = await getDocs(collection(FIRESTORE, 'enterprises', enterpriseId, 'members'));
  return snap.docs.map((item) => {
    const data = item.data() as Record<string, unknown>;
    return {
      uid: item.id,
      email: data.email != null ? String(data.email) : undefined,
      role: data.role != null ? String(data.role) : undefined,
      displayName: data.displayName != null ? String(data.displayName) : undefined,
      invitedAt: data.invitedAt != null ? String(data.invitedAt) : undefined,
      updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
    };
  });
}

async function call<TReq extends object, TRes>(name: string, data: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq, TRes>(FUNCTIONS, name);
  const result = await fn(data);
  return result.data;
}

export function createEnterprise(
  input: {
    id: string;
    name: string;
    adminEmail?: string;
  } & EnterpriseAddressInput
) {
  return call<typeof input, Enterprise>('createEnterprise', input);
}

export function updateEnterprise(
  input: {
    id: string;
    name?: string;
    active?: boolean;
    adminEmail?: string;
  } & EnterpriseAddressInput
) {
  return call<typeof input, Enterprise>('updateEnterprise', input);
}

export function selfRegisterEnterprise(input: {
  name: string;
  document: string;
  phone: string;
  displayName?: string;
  tradeName?: string;
  zipCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  id?: string;
}) {
  return call<
    typeof input,
    { id: string; enterpriseId: string; role: string; planCode: string }
  >('selfRegisterEnterprise', input);
}

export function inviteMember(input: {
  email: string;
  enterpriseId: string;
  role: TenantRole;
  tempPassword?: string;
  displayName?: string;
  permissions?: string[];
}) {
  return call<
    typeof input,
    {
      uid: string;
      email: string;
      enterpriseId: string;
      role: string;
      created: boolean;
      passwordReset?: boolean;
    }
  >('inviteMember', input);
}

export function deleteMember(input: {
  enterpriseId: string;
  uid: string;
  /** Default true: apaga Auth user para poder recriar do zero */
  deleteAuthUser?: boolean;
}) {
  return call<
    typeof input,
    { uid: string; enterpriseId: string; deleted: boolean; authDeleted: boolean }
  >('deleteMember', input);
}

export function setMemberClaims(input: {
  uid: string;
  enterpriseId: string;
  role: TenantRole;
  permissions?: string[];
}) {
  return call<typeof input, { uid: string; enterpriseId: string; role: string }>(
    'setMemberClaims',
    input
  );
}

export type AccessibleWorkspace = {
  id: string;
  name: string;
  logo: string;
  plan: string;
  planCode: string;
  role: string;
};

export function listAccessibleWorkspaces(): Promise<{ workspaces: AccessibleWorkspace[] }> {
  return call<{ action: string }, { workspaces: AccessibleWorkspace[] }>('erpActions', {
    action: 'listAccessibleWorkspaces',
  });
}

export function switchActiveEnterprise(
  enterpriseId: string
): Promise<{ switched: boolean; enterpriseId: string; role: string }> {
  return call<
    { action: string; enterpriseId: string },
    { switched: boolean; enterpriseId: string; role: string }
  >('erpActions', { action: 'switchActiveEnterprise', enterpriseId });
}

export async function updateEnterpriseSettings(
  enterpriseId: string,
  data: Partial<EnterpriseAddressInput> & {
    name?: string;
    uiSettings?: EnterpriseUiSettings;
  }
): Promise<void> {
  const ref = doc(FIRESTORE, 'enterprises', enterpriseId);
  const now = new Date().toISOString();
  await updateDoc(
    ref,
    omitUndefined({
      ...data,
      updatedAt: now,
    })
  );
}


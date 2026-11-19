import type { EvolutionClientSession } from 'src/api/evolution-api';

import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { FUNCTIONS, FIRESTORE } from 'src/lib/firebase';
import {
  evoSendText,
  evoSetWebhook,
  evoLogoutInstance,
  evoGetConnectionState,
  evoConnectOrCreateInstance,
} from 'src/api/evolution-api';

// ----------------------------------------------------------------------

export type WhatsappConnectionState = 'open' | 'connecting' | 'close';

export type WhatsappEventKey =
  | 'orderReceived'
  | 'orderAccepted'
  | 'orderPreparing'
  | 'orderOutForDelivery'
  | 'orderDelivered'
  | 'orderRejected'
  | 'storeOwnerNewOrder'
  | 'saleReceipt';

export type WhatsappEventsConfig = {
  orderReceived: boolean;
  orderAccepted: boolean;
  orderPreparing: boolean;
  orderOutForDelivery: boolean;
  orderDelivered: boolean;
  orderRejected: boolean;
  notifyStoreOwner: boolean;
  sendReceiptOnSale: boolean;
};

export const EVOLUTION_WEBHOOK_EVENTS = [
  'APPLICATION_STARTUP',
  'CALL',
  'CHATS_DELETE',
  'CHATS_SET',
  'CHATS_UPDATE',
  'CHATS_UPSERT',
  'CONNECTION_UPDATE',
  'CONTACTS_SET',
  'CONTACTS_UPDATE',
  'CONTACTS_UPSERT',
  'GROUP_PARTICIPANTS_UPDATE',
  'GROUP_UPDATE',
  'GROUPS_UPSERT',
  'LABELS_ASSOCIATION',
  'LABELS_EDIT',
  'LOGOUT_INSTANCE',
  'MESSAGES_DELETE',
  'MESSAGES_SET',
  'MESSAGES_UPDATE',
  'MESSAGES_UPSERT',
  'PRESENCE_UPDATE',
  'QRCODE_UPDATED',
  'REMOVE_INSTANCE',
  'SEND_MESSAGE',
  'TYPEBOT_CHANGE_STATUS',
  'TYPEBOT_START',
] as const;

export type EvolutionWebhookEvent = (typeof EVOLUTION_WEBHOOK_EVENTS)[number];

export type WhatsappWebhookConfig = {
  enabled: boolean;
  url: string;
  webhookByEvents: boolean;
  webhookBase64: boolean;
  events: string[];
};

export type EnterpriseWhatsappStatusResponse = {
  eligible: boolean;
  instanceName: string;
  state: WhatsappConnectionState;
  enabled: boolean;
  groupsIgnore: boolean;
  events: WhatsappEventsConfig;
  ownerAlertPhone: string;
  templates: Record<WhatsappEventKey, string>;
  webhook?: WhatsappWebhookConfig;
};

export type ConnectEnterpriseWhatsappResponse = {
  instanceName: string;
  state: WhatsappConnectionState;
  qrcodeBase64: string | null;
  pairingCode: string | null;
};

export type WhatsappLogEntry = {
  id: string;
  event: string;
  orderId?: string | null;
  saleId?: string | null;
  recipientPhone: string;
  instanceName?: string;
  status: 'sent' | 'failed' | 'skipped';
  messagePreview?: string;
  errorMessage?: string;
  createdAt: string;
};

export type EvolutionPlatformStatus = {
  baseUrl: string;
  apiKeyConfigured: boolean;
};

async function call<TReq extends object, TRes>(action: string, data: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq & { action: string }, TRes>(FUNCTIONS, 'erpActions');
  const res = await fn({ action, ...data });
  return res.data;
}

export function getEvolutionPlatformStatusCf(): Promise<EvolutionPlatformStatus> {
  return call<Record<string, never>, EvolutionPlatformStatus>('getEvolutionPlatformStatus', {});
}

export function updateEvolutionPlatformConfigCf(input: {
  baseUrl: string;
  apiKey?: string;
}): Promise<EvolutionPlatformStatus> {
  return call<typeof input, EvolutionPlatformStatus>('updateEvolutionPlatformConfig', input);
}

export function getEnterpriseWhatsappStatusCf(
  enterpriseId: string
): Promise<EnterpriseWhatsappStatusResponse> {
  return call<{ enterpriseId: string }, EnterpriseWhatsappStatusResponse>(
    'getEnterpriseWhatsappStatus',
    { enterpriseId }
  );
}

const evolutionSessionCache = new Map<string, EvolutionClientSession>();

async function getEvolutionSessionCached(
  enterpriseId: string
): Promise<EvolutionClientSession | null> {
  const cached = evolutionSessionCache.get(enterpriseId);
  if (cached) return cached;
  try {
    const session = await call<{ enterpriseId: string }, EvolutionClientSession>(
      'getEvolutionClientSession',
      { enterpriseId }
    );
    if (session?.baseUrl && session?.apiKey && session?.instanceName) {
      evolutionSessionCache.set(enterpriseId, session);
      return session;
    }
    return null;
  } catch {
    return null;
  }
}

export async function pollEvolutionConnectionStateDirect(
  enterpriseId: string
): Promise<WhatsappConnectionState | null> {
  const session = await getEvolutionSessionCached(enterpriseId);
  if (!session) return null;
  try {
    const state = await evoGetConnectionState(session);
    if (state === 'open') {
      await setDoc(
        doc(FIRESTORE, 'enterprises', enterpriseId),
        {
          whatsappIntegration: {
            connectionStatus: 'open',
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      ).catch(() => {});
    }
    return state;
  } catch {
    return null;
  }
}

export async function connectEnterpriseWhatsappCf(
  enterpriseId: string
): Promise<ConnectEnterpriseWhatsappResponse> {
  const session = await getEvolutionSessionCached(enterpriseId);
  if (session) {
    try {
      const res = await evoConnectOrCreateInstance(session);
      await setDoc(
        doc(FIRESTORE, 'enterprises', enterpriseId),
        {
          whatsappIntegration: {
            instanceName: res.instanceName,
            connectionStatus: res.state,
            groupsIgnore: true,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      ).catch(() => {});
      return res;
    } catch {
      // Fallback to Cloud Function if browser CORS/network fails
    }
  }
  return call<{ enterpriseId: string }, ConnectEnterpriseWhatsappResponse>(
    'connectEnterpriseWhatsapp',
    { enterpriseId }
  );
}

export async function disconnectEnterpriseWhatsappCf(
  enterpriseId: string
): Promise<{ disconnected: boolean }> {
  const session = await getEvolutionSessionCached(enterpriseId);
  if (session) {
    try {
      await evoLogoutInstance(session);
      await setDoc(
        doc(FIRESTORE, 'enterprises', enterpriseId),
        {
          whatsappIntegration: {
            connectionStatus: 'close',
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      ).catch(() => {});
      return { disconnected: true };
    } catch {
      // Fallback to Cloud Function
    }
  }
  return call<{ enterpriseId: string }, { disconnected: boolean }>(
    'disconnectEnterpriseWhatsapp',
    { enterpriseId }
  );
}

export function saveEnterpriseWhatsappSettingsCf(
  enterpriseId: string,
  settings: {
    enabled: boolean;
    events: WhatsappEventsConfig;
    ownerAlertPhone?: string;
    templates?: Partial<Record<WhatsappEventKey, string>>;
  }
): Promise<{ saved: boolean }> {
  return call<
    {
      enterpriseId: string;
      settings: {
        enabled: boolean;
        events: WhatsappEventsConfig;
        ownerAlertPhone?: string;
        templates?: Partial<Record<WhatsappEventKey, string>>;
      };
    },
    { saved: boolean }
  >('saveEnterpriseWhatsappSettings', { enterpriseId, settings });
}

export async function saveEnterpriseWhatsappWebhookCf(
  enterpriseId: string,
  webhook: WhatsappWebhookConfig
): Promise<{
  saved: boolean;
  syncedToEvolution: boolean;
  syncWarning: string | null;
  webhook: WhatsappWebhookConfig;
}> {
  const session = await getEvolutionSessionCached(enterpriseId);
  if (session) {
    try {
      await evoSetWebhook(session, webhook);
      await setDoc(
        doc(FIRESTORE, 'enterprises', enterpriseId),
        {
          whatsappIntegration: {
            instanceName: session.instanceName,
            groupsIgnore: true,
            webhook,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      ).catch(() => {});
      return {
        saved: true,
        syncedToEvolution: true,
        syncWarning: null,
        webhook,
      };
    } catch {
      // Fallback to Cloud Function
    }
  }
  return call<
    { enterpriseId: string; webhook: WhatsappWebhookConfig },
    {
      saved: boolean;
      syncedToEvolution: boolean;
      syncWarning: string | null;
      webhook: WhatsappWebhookConfig;
    }
  >('saveEnterpriseWhatsappWebhook', { enterpriseId, webhook });
}

export async function sendTestWhatsappMessageCf(
  enterpriseId: string,
  phone: string
): Promise<{ sent: boolean }> {
  const session = await getEvolutionSessionCached(enterpriseId);
  if (session) {
    try {
      await evoSendText(
        session,
        phone,
        `✅ *Teste de conexão WhatsApp*\n\nSua instância *${session.instanceName}* está conectada com sucesso via Evolution API!`
      );
      return { sent: true };
    } catch {
      // Fallback to Cloud Function
    }
  }
  return call<{ enterpriseId: string; phone: string }, { sent: boolean }>(
    'sendTestWhatsappMessage',
    { enterpriseId, phone }
  );
}

export function listEnterpriseWhatsappLogsCf(
  enterpriseId: string
): Promise<{ logs: WhatsappLogEntry[] }> {
  return call<{ enterpriseId: string }, { logs: WhatsappLogEntry[] }>(
    'listEnterpriseWhatsappLogs',
    { enterpriseId }
  );
}

export function sendSaleReceiptWhatsappCf(
  enterpriseId: string,
  saleId: string,
  phone?: string
): Promise<{ sent: boolean }> {
  return call<{ enterpriseId: string; saleId: string; phone?: string }, { sent: boolean }>(
    'sendSaleReceiptWhatsapp',
    { enterpriseId, saleId, phone }
  );
}

import type { AxiosInstance } from 'axios';

import axios from 'axios';

import type { WhatsappWebhookConfig, WhatsappConnectionState } from './firestore/whatsapp';

// ----------------------------------------------------------------------
// Direct Evolution API v2 Axios Client (https://evo.ds3i.com.br)
// Docs: https://docs.evolutionfoundation.com.br/evolution-api/connect-instance
// Calls Evolution directly from the browser to eliminate Firebase Functions
// invocations and Google Cloud egress costs.
// ----------------------------------------------------------------------

export type EvolutionClientSession = {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
};

function createEvolutionAxios(baseUrl: string, apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl.replace(/\/+$/, ''),
    timeout: 12000,
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
  });
}

export function normalizeBrWhatsappNumberClient(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

function parseConnectionState(payload: Record<string, unknown> | null | undefined): WhatsappConnectionState {
  const instance = payload?.instance as Record<string, unknown> | undefined;
  const raw = String(instance?.state || payload?.state || payload?.status || '').toLowerCase();
  if (raw === 'open' || raw === 'connected') return 'open';
  if (raw === 'connecting' || raw === 'qrcode') return 'connecting';
  return 'close';
}

function parseQrBase64(payload: Record<string, unknown> | null | undefined): string | null {
  const qrcode = payload?.qrcode as Record<string, unknown> | undefined;
  const raw = qrcode?.base64 || payload?.base64 || null;
  if (!raw || typeof raw !== 'string') return null;
  return raw.startsWith('data:image') ? raw : `data:image/png;base64,${raw}`;
}

export async function evoGetConnectionState(
  session: EvolutionClientSession
): Promise<WhatsappConnectionState> {
  const client = createEvolutionAxios(session.baseUrl, session.apiKey);
  const { data } = await client.get<Record<string, unknown>>(
    `/instance/connectionState/${encodeURIComponent(session.instanceName)}`
  );
  return parseConnectionState(data);
}

export async function evoConnectOrCreateInstance(session: EvolutionClientSession): Promise<{
  instanceName: string;
  state: WhatsappConnectionState;
  qrcodeBase64: string | null;
  pairingCode: string | null;
}> {
  const client = createEvolutionAxios(session.baseUrl, session.apiKey);
  const encoded = encodeURIComponent(session.instanceName);

  try {
    const { data: stateData } = await client.get<Record<string, unknown>>(
      `/instance/connectionState/${encoded}`
    );
    const state = parseConnectionState(stateData);
    if (state === 'open') {
      return {
        instanceName: session.instanceName,
        state: 'open',
        qrcodeBase64: null,
        pairingCode: null,
      };
    }

    const { data: connData } = await client.get<Record<string, unknown>>(
      `/instance/connect/${encoded}`
    );
    return {
      instanceName: session.instanceName,
      state: parseQrBase64(connData) ? 'connecting' : parseConnectionState(connData),
      qrcodeBase64: parseQrBase64(connData),
      pairingCode: typeof connData?.pairingCode === 'string' ? connData.pairingCode : null,
    };
  } catch (err) {
    const httpStatus = axios.isAxiosError(err) ? err.response?.status : undefined;
    // Only create instance when 404 (not found); rethrow network/CORS errors for fallback
    if (httpStatus !== 404) {
      throw err;
    }

    const { data: createData } = await client.post<Record<string, unknown>>('/instance/create', {
      instanceName: session.instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      groupsIgnore: true,
      rejectCall: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
    });

    let qrcodeBase64 = parseQrBase64(createData);
    let pairingCode =
      typeof (createData?.qrcode as Record<string, unknown> | undefined)?.pairingCode === 'string'
        ? String((createData.qrcode as Record<string, unknown>).pairingCode)
        : typeof createData?.pairingCode === 'string'
          ? createData.pairingCode
          : null;
    const state = qrcodeBase64 ? 'connecting' : parseConnectionState(createData);

    if (!qrcodeBase64 && state !== 'open') {
      const { data: connData } = await client.get<Record<string, unknown>>(
        `/instance/connect/${encoded}`
      );
      qrcodeBase64 = parseQrBase64(connData);
      pairingCode = typeof connData?.pairingCode === 'string' ? connData.pairingCode : pairingCode;
    }

    return {
      instanceName: session.instanceName,
      state,
      qrcodeBase64,
      pairingCode,
    };
  }
}

export async function evoLogoutInstance(session: EvolutionClientSession): Promise<void> {
  const client = createEvolutionAxios(session.baseUrl, session.apiKey);
  await client.delete(`/instance/logout/${encodeURIComponent(session.instanceName)}`);
}

export async function evoSetWebhook(
  session: EvolutionClientSession,
  webhook: WhatsappWebhookConfig
): Promise<void> {
  const client = createEvolutionAxios(session.baseUrl, session.apiKey);
  const path = `/webhook/set/${encodeURIComponent(session.instanceName)}`;

  try {
    await client.post(path, {
      webhook: {
        enabled: webhook.enabled,
        url: webhook.url,
        byEvents: webhook.webhookByEvents,
        base64: webhook.webhookBase64,
        events: webhook.events,
      },
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) {
      await client.post(path, {
        enabled: webhook.enabled,
        url: webhook.url,
        webhook_by_events: webhook.webhookByEvents,
        webhook_base64: webhook.webhookBase64,
        events: webhook.events,
      });
      return;
    }
    throw err;
  }
}

export async function evoSendText(
  session: EvolutionClientSession,
  phone: string,
  text: string
): Promise<void> {
  const number = normalizeBrWhatsappNumberClient(phone);
  if (!number) {
    throw new Error('Telefone inválido. Informe DDD + número.');
  }
  const client = createEvolutionAxios(session.baseUrl, session.apiKey);
  await client.post(`/message/sendText/${encodeURIComponent(session.instanceName)}`, {
    number,
    text,
  });
}

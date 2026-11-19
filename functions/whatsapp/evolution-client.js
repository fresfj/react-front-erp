// ----------------------------------------------------------------------
// Evolution API v2 HTTP Client (https://evo.ds3i.com.br)
// ----------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10000;

function normalizeInstanceName(rawName, fallbackId = 'LOJA') {
  const cleaned = String(rawName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);

  const suffix = cleaned || String(fallbackId || 'LOJA').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return `ULTRA_${suffix}`;
}

function normalizeBrWhatsappNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  return `55${digits}`;
}

async function evolutionRequest({ baseUrl, apiKey, path, method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  if (!cleanBase || !apiKey) {
    throw new Error('Evolution API baseUrl or apiKey not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${cleanBase}${path}`, {
      method,
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const msg =
        json?.response?.message ||
        json?.message ||
        json?.error ||
        `Evolution API HTTP ${res.status}`;
      const err = new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
      err.status = res.status;
      err.payload = json;
      throw err;
    }

    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function createEvolutionInstance({ baseUrl, apiKey, instanceName }) {
  return evolutionRequest({
    baseUrl,
    apiKey,
    path: '/instance/create',
    method: 'POST',
    body: {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      groupsIgnore: true,
      rejectCall: false,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
    },
  });
}

async function connectEvolutionInstance({ baseUrl, apiKey, instanceName }) {
  return evolutionRequest({
    baseUrl,
    apiKey,
    path: `/instance/connect/${encodeURIComponent(instanceName)}`,
    method: 'GET',
  });
}

async function getEvolutionConnectionState({ baseUrl, apiKey, instanceName }) {
  return evolutionRequest({
    baseUrl,
    apiKey,
    path: `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    method: 'GET',
  });
}

async function logoutEvolutionInstance({ baseUrl, apiKey, instanceName }) {
  return evolutionRequest({
    baseUrl,
    apiKey,
    path: `/instance/logout/${encodeURIComponent(instanceName)}`,
    method: 'DELETE',
  });
}

async function restartEvolutionInstance({ baseUrl, apiKey, instanceName }) {
  return evolutionRequest({
    baseUrl,
    apiKey,
    path: `/instance/restart/${encodeURIComponent(instanceName)}`,
    method: 'PUT',
  });
}

async function sendEvolutionText({ baseUrl, apiKey, instanceName, number, text }) {
  const formattedNumber = normalizeBrWhatsappNumber(number);
  if (!formattedNumber) {
    throw new Error('Invalid destination phone number');
  }
  return evolutionRequest({
    baseUrl,
    apiKey,
    path: `/message/sendText/${encodeURIComponent(instanceName)}`,
    method: 'POST',
    body: {
      number: formattedNumber,
      text: String(text || ''),
    },
  });
}

const EVOLUTION_WEBHOOK_EVENTS = [
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
];

async function findEvolutionWebhook({ baseUrl, apiKey, instanceName }) {
  return evolutionRequest({
    baseUrl,
    apiKey,
    path: `/webhook/find/${encodeURIComponent(instanceName)}`,
    method: 'GET',
  });
}

async function setEvolutionWebhook({ baseUrl, apiKey, instanceName, webhook }) {
  const cleanEvents = Array.isArray(webhook?.events)
    ? webhook.events.filter((e) => EVOLUTION_WEBHOOK_EVENTS.includes(String(e)))
    : [];
  const enabled = Boolean(webhook?.enabled);
  const url = String(webhook?.url || '').trim();
  const webhookByEvents = Boolean(webhook?.webhookByEvents);
  const webhookBase64 = Boolean(webhook?.webhookBase64);

  // Evolution API v2.2+ expects { webhook: { enabled, url, byEvents, base64, events } }
  try {
    return await evolutionRequest({
      baseUrl,
      apiKey,
      path: `/webhook/set/${encodeURIComponent(instanceName)}`,
      method: 'POST',
      body: {
        webhook: {
          enabled,
          url,
          byEvents: webhookByEvents,
          base64: webhookBase64,
          events: cleanEvents,
        },
      },
    });
  } catch (err) {
    // Fallback for Evolution API v2.0/v2.1 flat payload
    if (err && err.status === 400) {
      return evolutionRequest({
        baseUrl,
        apiKey,
        path: `/webhook/set/${encodeURIComponent(instanceName)}`,
        method: 'POST',
        body: {
          enabled,
          url,
          webhook_by_events: webhookByEvents,
          webhook_base64: webhookBase64,
          events: cleanEvents,
        },
      });
    }
    throw err;
  }
}

module.exports = {
  EVOLUTION_WEBHOOK_EVENTS,
  normalizeInstanceName,
  normalizeBrWhatsappNumber,
  evolutionRequest,
  createEvolutionInstance,
  connectEvolutionInstance,
  getEvolutionConnectionState,
  logoutEvolutionInstance,
  restartEvolutionInstance,
  sendEvolutionText,
  findEvolutionWebhook,
  setEvolutionWebhook,
};

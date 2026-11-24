const { HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

const {
  sendEvolutionText,
  sendEvolutionButtons,
  setEvolutionWebhook,
  findEvolutionWebhook,
  normalizeInstanceName,
  createEvolutionInstance,
  logoutEvolutionInstance,
  connectEvolutionInstance,
  EVOLUTION_WEBHOOK_EVENTS,
  normalizeBrWhatsappNumber,
  getEvolutionConnectionState,
} = require('./evolution-client');

// ----------------------------------------------------------------------

let _firestore;

function db() {
  if (!_firestore) {
    _firestore = getFirestore();
    try {
      _firestore.settings({ ignoreUndefinedProperties: true });
    } catch {
      // already initialized
    }
  }
  return _firestore;
}

function nowIso() {
  return new Date().toISOString();
}

function formatCurrencyBrl(value) {
  const num = Number(value || 0);
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

function formatOrderItemsText(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .map(
      (i) =>
        `• ${i.qty}x ${i.productName} (${formatCurrencyBrl(i.lineTotal || i.qty * i.unitPrice)})${
          i.notes ? ` — Obs: ${i.notes}` : ''
        }`
    )
    .join('\n');
}

const DEFAULT_WHATSAPP_TEMPLATES = {
  orderReceived:
    'Olá, *{{cliente}}*! Recebemos seu pedido *{{codigo}}* na *{{loja}}*.\n\n*Itens:*\n{{itens}}\n\n*Total:* {{total}} ({{modalidade}})\n\nAcompanhe o andamento em tempo real:\n{{link}}',
  orderAccepted:
    '✅ *Pedido {{codigo}} aceito!*\n\nOlá, {{cliente}}! A *{{loja}}* confirmou seu pedido.\nTempo estimado: ~{{tempo}} min.\n\nAcompanhe aqui:\n{{link}}',
  orderPreparing:
    '👨‍🍳 *Pedido {{codigo}} em preparação!*\n\nEstamos preparando tudo com carinho na *{{loja}}*. Em breve avisaremos a próxima etapa!',
  orderOutForDelivery:
    '🛵 *Atualização do pedido {{codigo}}!*\n\n{{statusEntrega}}\n\nQualquer dúvida, estamos à disposição na *{{loja}}*.',
  orderDelivered:
    '🎉 *Pedido {{codigo}} finalizado!*\n\nObrigado por comprar na *{{loja}}*, {{cliente}}! Esperamos que aproveite.{{avaliacao}}',
  orderRejected:
    '❌ *Pedido {{codigo}} não pôde ser atendido.*\n\nOlá, {{cliente}}. Infelizmente a *{{loja}}* precisou recusar seu pedido.{{motivo}}',
  storeOwnerNewOrder:
    '🔔 *Novo Pedido Online {{codigo}}!*\n\n*Cliente:* {{cliente}} ({{telefone}})\n*Modalidade:* {{modalidade}}\n*Total:* {{total}}\n\n*Itens:*\n{{itens}}',
  saleReceipt:
    '🧾 *Comprovante de Compra — {{loja}}*\n\n*Venda:* {{codigo}}\n*Cliente:* {{cliente}}\n\n*Itens:*\n{{itens}}\n\n*Total Pago:* {{total}}\n*Pagamento:* {{pagamento}}\n\nObrigado pela preferência!',
};

const DEFAULT_WHATSAPP_EVENTS = {
  orderReceived: true,
  orderAccepted: true,
  orderPreparing: true,
  orderOutForDelivery: true,
  orderDelivered: true,
  orderRejected: true,
  notifyStoreOwner: true,
  sendReceiptOnSale: false,
};

function renderTemplate(template, vars = {}) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : ''
  );
}

function assertPlatformAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  if (request.auth.token.platformAdmin !== true) {
    throw new HttpsError('permission-denied', 'Platform admin only');
  }
}

function assertTenantAdmin(request, enterpriseId) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  if (request.auth.token.platformAdmin === true) return;
  if (request.auth.token.enterpriseId !== enterpriseId) {
    throw new HttpsError('permission-denied', 'Wrong enterprise');
  }
  if (request.auth.token.role === 'admin') return;
  throw new HttpsError('permission-denied', 'Enterprise admin required');
}

function assertTenantAdminOrGestor(request, enterpriseId) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  if (request.auth.token.platformAdmin === true) return;
  if (request.auth.token.enterpriseId !== enterpriseId) {
    throw new HttpsError('permission-denied', 'Wrong enterprise');
  }
  const role = request.auth.token.role;
  if (role === 'admin' || role === 'gestor') return;
  throw new HttpsError('permission-denied', 'Admin or gestor required');
}

function assertTenantPosAccess(request, enterpriseId) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  if (request.auth.token.platformAdmin === true) return;
  if (request.auth.token.enterpriseId !== enterpriseId) {
    throw new HttpsError('permission-denied', 'Wrong enterprise');
  }
  const role = request.auth.token.role;
  if (role === 'admin' || role === 'gestor' || role === 'operador') return;
  throw new HttpsError('permission-denied', 'Insufficient role');
}

async function loadPlanForEnterprise(enterprise) {
  const sub = enterprise.subscription || {};
  if (sub.planId) {
    const snap = await db().doc(`plans/${sub.planId}`).get();
    if (snap.exists) return { id: snap.id, ...snap.data() };
  }
  const code = sub.planCode || 'free';
  const q = await db().collection('plans').where('code', '==', code).limit(1).get();
  if (!q.empty) return { id: q.docs[0].id, ...q.docs[0].data() };
  return { code, entitlements: [] };
}

const DEFAULT_WHATSAPP_WEBHOOK = {
  enabled: false,
  url: '',
  webhookByEvents: false,
  webhookBase64: false,
  events: [],
};

function normalizeWebhookConfig(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WHATSAPP_WEBHOOK };
  const src = raw.webhook && typeof raw.webhook === 'object' ? raw.webhook : raw;
  const rawEvents = Array.isArray(src.events) ? src.events : [];
  return {
    enabled: Boolean(src.enabled),
    url: String(src.url || '').trim(),
    webhookByEvents: Boolean(
      src.webhookByEvents ?? src.webhook_by_events ?? src.byEvents ?? false
    ),
    webhookBase64: Boolean(src.webhookBase64 ?? src.webhook_base64 ?? src.base64 ?? false),
    events: rawEvents.filter((e) => EVOLUTION_WEBHOOK_EVENTS.includes(String(e))),
  };
}

function isWithinGracePeriod(sub) {
  if (!sub || String(sub.status || '').toLowerCase() !== 'past_due') return false;
  if (!sub.graceEndsAt) return true;
  const graceMs = Date.parse(String(sub.graceEndsAt));
  if (Number.isNaN(graceMs)) return true;
  return graceMs > Date.now();
}

function hasActiveUltraWhatsapp(enterprise, plan) {
  if (!enterprise) return false;
  const sub = enterprise.subscription || {};
  const status = String(sub.status || '').toLowerCase();
  const isActiveStatus =
    status === 'active' || status === 'trialing' || isWithinGracePeriod(sub);
  if (!isActiveStatus) return false;

  const planCode = String(plan?.code || sub.planCode || '').toLowerCase();
  const entitlements = Array.isArray(plan?.entitlements) ? plan.entitlements : [];
  return planCode === 'ultra' || entitlements.includes('whatsapp_automation');
}

async function loadEvolutionConfig() {
  const [secretSnap, settingsSnap] = await Promise.all([
    db().doc('platformSecrets/evolution').get(),
    db().doc('platformSettings/evolution').get(),
  ]);
  const secret = secretSnap.exists ? secretSnap.data() || {} : {};
  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
  return {
    baseUrl: String(secret.baseUrl || settings.baseUrl || '').replace(/\/+$/, ''),
    apiKey: String(secret.apiKey || ''),
  };
}

function extractConnectionState(payload) {
  const raw =
    payload?.instance?.state ||
    payload?.state ||
    payload?.status ||
    '';
  const norm = String(raw).toLowerCase();
  if (norm === 'open' || norm === 'connected') return 'open';
  if (norm === 'connecting' || norm === 'qrcode') return 'connecting';
  return 'close';
}

function extractQrCodeBase64(payload) {
  const raw = payload?.base64 || payload?.qrcode?.base64 || '';
  if (!raw) return null;
  return String(raw).startsWith('data:image') ? String(raw) : `data:image/png;base64,${raw}`;
}

async function writeWhatsappLog(enterpriseId, entry) {
  try {
    await db()
      .collection(`enterprises/${enterpriseId}/whatsappLogs`)
      .add({
        ...entry,
        createdAt: nowIso(),
      });
  } catch (err) {
    console.error('writeWhatsappLog error:', err);
  }
}

/**
 * Remove linhas que contenham URLs cruas já representadas nos botões interativos,
 * mantendo o corpo da mensagem limpo quando enviada via sendButtons.
 */
function stripButtonUrlsFromDescription(text, buttons) {
  let clean = String(text || '');
  (Array.isArray(buttons) ? buttons : []).forEach((btn) => {
    const url = String(btn?.url || '').trim();
    if (url) {
      clean = clean.split(url).join('');
    }
  });
  return clean
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Envia via botões interativos (Evolution API /message/sendButtons) quando houver botões
 * válidos; caso a instância/provedor rejeite botões, faz fallback automático para texto simples.
 */
async function sendEvolutionInteractiveOrText({
  baseUrl,
  apiKey,
  instanceName,
  number,
  title,
  text,
  footer,
  buttons,
}) {
  const validButtons = (Array.isArray(buttons) ? buttons : []).filter(
    (b) => b && b.displayText && (b.type !== 'url' || /^https?:\/\//i.test(String(b.url || '')))
  );

  if (validButtons.length > 0) {
    try {
      const description = stripButtonUrlsFromDescription(text, validButtons);
      await sendEvolutionButtons({
        baseUrl,
        apiKey,
        instanceName,
        number,
        title: title || 'Atualização do Pedido',
        description: description || text,
        footer: footer || '',
        buttons: validButtons,
      });
      return { deliveryMode: 'buttons' };
    } catch (btnErr) {
      console.warn(
        `sendEvolutionButtons fallback to sendEvolutionText (${instanceName}):`,
        btnErr?.message || btnErr
      );
    }
  }

  await sendEvolutionText({
    baseUrl,
    apiKey,
    instanceName,
    number,
    text,
  });
  return { deliveryMode: 'text' };
}

/**
 * Disparo automático não-bloqueante de mensagens WhatsApp para eventos da empresa Ultra.
 * Nunca lança erro para o chamador — registra auditoria em whatsappLogs.
 */
async function dispatchEnterpriseWhatsappEvent({
  enterpriseId,
  enterprise,
  event,
  recipientPhone,
  orderId,
  saleId,
  vars = {},
  title,
  footer,
  buttons,
}) {
  try {
    if (!enterpriseId || !recipientPhone) return { status: 'skipped', reason: 'missing_params' };

    let ent = enterprise;
    if (!ent) {
      const snap = await db().doc(`enterprises/${enterpriseId}`).get();
      if (!snap.exists) return { status: 'skipped', reason: 'enterprise_not_found' };
      ent = { id: snap.id, ...snap.data() };
    }

    const wa = ent.whatsappIntegration || {};
    if (wa.enabled !== true || !wa.instanceName) {
      return { status: 'skipped', reason: 'integration_disabled' };
    }

    const events = { ...DEFAULT_WHATSAPP_EVENTS, ...(wa.events || {}) };
    const eventFlagMap = {
      orderReceived: 'orderReceived',
      orderAccepted: 'orderAccepted',
      orderPreparing: 'orderPreparing',
      orderOutForDelivery: 'orderOutForDelivery',
      orderDelivered: 'orderDelivered',
      orderRejected: 'orderRejected',
      storeOwnerNewOrder: 'notifyStoreOwner',
      saleReceipt: 'sendReceiptOnSale',
    };
    const flagKey = eventFlagMap[event];
    if (flagKey && event !== 'saleReceipt' && events[flagKey] === false) {
      return { status: 'skipped', reason: 'event_disabled' };
    }

    const plan = await loadPlanForEnterprise(ent);
    if (!hasActiveUltraWhatsapp(ent, plan)) {
      return { status: 'skipped', reason: 'plan_not_ultra_active' };
    }

    const evo = await loadEvolutionConfig();
    if (!evo.baseUrl || !evo.apiKey) {
      return { status: 'skipped', reason: 'evolution_not_configured' };
    }

    const template = (wa.templates && wa.templates[event]) || DEFAULT_WHATSAPP_TEMPLATES[event];
    if (!template) {
      return { status: 'skipped', reason: 'missing_template' };
    }

    const text = renderTemplate(template, vars);
    const formattedPhone = normalizeBrWhatsappNumber(recipientPhone);
    if (!formattedPhone) {
      return { status: 'skipped', reason: 'invalid_phone' };
    }

    const resolvedButtons = Array.isArray(buttons) ? [...buttons] : [];
    if (resolvedButtons.length === 0 && vars.link && /^https?:\/\//i.test(String(vars.link))) {
      resolvedButtons.push({
        type: 'url',
        displayText: 'Acompanhar Pedido',
        url: String(vars.link),
      });
    }

    const storeName = String(ent.tradeName || ent.name || '').trim();
    const { deliveryMode } = await sendEvolutionInteractiveOrText({
      baseUrl: evo.baseUrl,
      apiKey: evo.apiKey,
      instanceName: wa.instanceName,
      number: formattedPhone,
      title: title || storeName,
      text,
      footer: footer || storeName,
      buttons: resolvedButtons,
    });

    await writeWhatsappLog(enterpriseId, {
      event,
      orderId: orderId || null,
      saleId: saleId || null,
      recipientPhone: formattedPhone,
      instanceName: wa.instanceName,
      status: 'sent',
      deliveryMode,
      messagePreview: text.slice(0, 180),
    });

    return { status: 'sent', deliveryMode };
  } catch (err) {
    console.error(`dispatchEnterpriseWhatsappEvent(${event}) error:`, err);
    await writeWhatsappLog(enterpriseId, {
      event,
      orderId: orderId || null,
      saleId: saleId || null,
      recipientPhone: String(recipientPhone || ''),
      status: 'failed',
      errorMessage: String(err?.message || 'Unknown error').slice(0, 300),
    });
    return { status: 'failed', error: String(err?.message || 'Unknown error') };
  }
}

// ----------------------------------------------------------------------
// Cloud Functions — Platform Admin (Configuração Global Evolution API)
// ----------------------------------------------------------------------

const handlers = {};

handlers.getEvolutionPlatformStatus = async (request) => {
  assertPlatformAdmin(request);
  const evo = await loadEvolutionConfig();
  return {
    baseUrl: evo.baseUrl || 'https://evo.ds3i.com.br',
    apiKeyConfigured: Boolean(evo.apiKey),
  };
};

handlers.updateEvolutionPlatformConfig = async (request) => {
  assertPlatformAdmin(request);
  const baseUrl = String(request.data?.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = typeof request.data?.apiKey === 'string' ? request.data.apiKey.trim() : '';

  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    throw new HttpsError('invalid-argument', 'Informe uma URL válida para a Evolution API.');
  }

  const secretRef = db().doc('platformSecrets/evolution');
  const existingSnap = await secretRef.get();
  const existing = existingSnap.exists ? existingSnap.data() || {} : {};
  const finalApiKey = apiKey || String(existing.apiKey || '');

  const timestamp = nowIso();
  await Promise.all([
    secretRef.set(
      {
        baseUrl,
        apiKey: finalApiKey,
        updatedAt: timestamp,
      },
      { merge: true }
    ),
    db()
      .doc('platformSettings/evolution')
      .set(
        {
          baseUrl,
          apiKeyConfigured: Boolean(finalApiKey),
          updatedAt: timestamp,
        },
        { merge: true }
      ),
  ]);

  return {
    baseUrl,
    apiKeyConfigured: Boolean(finalApiKey),
  };
};

// ----------------------------------------------------------------------
// Cloud Functions — Tenant Ultra (Instância, QR Code, Config & Logs)
// ----------------------------------------------------------------------

async function loadAndAssertUltraEnterprise(enterpriseId) {
  const entRef = db().doc(`enterprises/${enterpriseId}`);
  const entSnap = await entRef.get();
  if (!entSnap.exists) throw new HttpsError('not-found', 'Empresa não encontrada.');
  const enterprise = { id: entSnap.id, ...entSnap.data() };
  const plan = await loadPlanForEnterprise(enterprise);
  if (!hasActiveUltraWhatsapp(enterprise, plan)) {
    throw new HttpsError(
      'permission-denied',
      'Recurso exclusivo para empresas com Plano Ultra ativo.'
    );
  }
  return { entRef, enterprise, plan };
}

handlers.getEvolutionClientSession = async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  if (!enterpriseId) throw new HttpsError('invalid-argument', 'enterpriseId required');
  assertTenantAdmin(request, enterpriseId);

  const { enterprise } = await loadAndAssertUltraEnterprise(enterpriseId);
  const evo = await loadEvolutionConfig();
  if (!evo.baseUrl || !evo.apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'Evolution API ainda não foi configurada pelo administrador da plataforma.'
    );
  }
  const existingWa = enterprise.whatsappIntegration || {};
  const instanceName =
    existingWa.instanceName ||
    normalizeInstanceName(enterprise.tradeName || enterprise.name, enterpriseId);

  return {
    baseUrl: evo.baseUrl,
    apiKey: evo.apiKey,
    instanceName,
  };
};

handlers.connectEnterpriseWhatsapp = async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  if (!enterpriseId) throw new HttpsError('invalid-argument', 'enterpriseId required');
  assertTenantAdmin(request, enterpriseId);

  const { entRef, enterprise } = await loadAndAssertUltraEnterprise(enterpriseId);
  const evo = await loadEvolutionConfig();
  if (!evo.baseUrl || !evo.apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'Evolution API ainda não foi configurada pelo administrador da plataforma.'
    );
  }

  const existingWa = enterprise.whatsappIntegration || {};
  const instanceName =
    existingWa.instanceName ||
    normalizeInstanceName(enterprise.tradeName || enterprise.name, enterpriseId);

  let qrcodeBase64 = null;
  let pairingCode = null;
  let state = 'connecting';

  try {
    const stateRes = await getEvolutionConnectionState({
      baseUrl: evo.baseUrl,
      apiKey: evo.apiKey,
      instanceName,
    });
    state = extractConnectionState(stateRes);
    if (state !== 'open') {
      const connRes = await connectEvolutionInstance({
        baseUrl: evo.baseUrl,
        apiKey: evo.apiKey,
        instanceName,
      });
      qrcodeBase64 = extractQrCodeBase64(connRes);
      pairingCode = connRes?.pairingCode || null;
    }
  } catch (err) {
    // Instância ainda não existe — cria com groupsIgnore: true
    try {
      const createRes = await createEvolutionInstance({
        baseUrl: evo.baseUrl,
        apiKey: evo.apiKey,
        instanceName,
      });
      qrcodeBase64 = extractQrCodeBase64(createRes);
      pairingCode = createRes?.qrcode?.pairingCode || createRes?.pairingCode || null;
      state = qrcodeBase64 ? 'connecting' : extractConnectionState(createRes);
      if (!qrcodeBase64 && state !== 'open') {
        const connRes = await connectEvolutionInstance({
          baseUrl: evo.baseUrl,
          apiKey: evo.apiKey,
          instanceName,
        });
        qrcodeBase64 = extractQrCodeBase64(connRes);
        pairingCode = connRes?.pairingCode || null;
      }
    } catch (createErr) {
      console.error('connectEnterpriseWhatsapp create error:', createErr);
      throw new HttpsError(
        'internal',
        `Não foi possível conectar à Evolution API: ${createErr.message}`
      );
    }
  }

  // Se já houver webhook salvo no Firestore, sincroniza na Evolution API
  if (existingWa.webhook && existingWa.webhook.url) {
    try {
      await setEvolutionWebhook({
        baseUrl: evo.baseUrl,
        apiKey: evo.apiKey,
        instanceName,
        webhook: normalizeWebhookConfig(existingWa.webhook),
      });
    } catch (whErr) {
      console.warn('connectEnterpriseWhatsapp webhook sync skipped:', whErr?.message);
    }
  }

  const timestamp = nowIso();
  await entRef.set(
    {
      whatsappIntegration: {
        enabled: existingWa.enabled !== false,
        instanceName,
        connectionStatus: state,
        groupsIgnore: true,
        events: { ...DEFAULT_WHATSAPP_EVENTS, ...(existingWa.events || {}) },
        ...(existingWa.ownerAlertPhone ? { ownerAlertPhone: existingWa.ownerAlertPhone } : {}),
        ...(existingWa.templates ? { templates: existingWa.templates } : {}),
        ...(existingWa.webhook ? { webhook: normalizeWebhookConfig(existingWa.webhook) } : {}),
        ...(state === 'open' ? { connectedAt: existingWa.connectedAt || timestamp } : {}),
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
    { merge: true }
  );

  return {
    instanceName,
    state,
    qrcodeBase64,
    pairingCode,
  };
};

handlers.getEnterpriseWhatsappStatus = async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  if (!enterpriseId) throw new HttpsError('invalid-argument', 'enterpriseId required');
  assertTenantPosAccess(request, enterpriseId);

  const entRef = db().doc(`enterprises/${enterpriseId}`);
  const entSnap = await entRef.get();
  if (!entSnap.exists) throw new HttpsError('not-found', 'Empresa não encontrada.');
  const enterprise = { id: entSnap.id, ...entSnap.data() };
  const plan = await loadPlanForEnterprise(enterprise);
  const eligible = hasActiveUltraWhatsapp(enterprise, plan);
  const wa = enterprise.whatsappIntegration || {};
  const instanceName =
    wa.instanceName ||
    normalizeInstanceName(enterprise.tradeName || enterprise.name, enterpriseId);

  const savedWebhook = normalizeWebhookConfig(wa.webhook);

  if (!eligible || !wa.instanceName) {
    return {
      eligible,
      instanceName,
      state: 'close',
      enabled: wa.enabled === true,
      groupsIgnore: true,
      events: { ...DEFAULT_WHATSAPP_EVENTS, ...(wa.events || {}) },
      ownerAlertPhone: wa.ownerAlertPhone || '',
      templates: { ...DEFAULT_WHATSAPP_TEMPLATES, ...(wa.templates || {}) },
      webhook: savedWebhook,
    };
  }

  const evo = await loadEvolutionConfig();
  let state = wa.connectionStatus || 'close';
  let webhook = savedWebhook;

  if (evo.baseUrl && evo.apiKey) {
    try {
      const stateRes = await getEvolutionConnectionState({
        baseUrl: evo.baseUrl,
        apiKey: evo.apiKey,
        instanceName,
      });
      state = extractConnectionState(stateRes);
      if (state !== wa.connectionStatus) {
        await entRef.set(
          {
            whatsappIntegration: {
              ...wa,
              connectionStatus: state,
              ...(state === 'open' && !wa.connectedAt ? { connectedAt: nowIso() } : {}),
              updatedAt: nowIso(),
            },
          },
          { merge: true }
        );
      }
    } catch {
      state = 'close';
    }

    try {
      const whRes = await findEvolutionWebhook({
        baseUrl: evo.baseUrl,
        apiKey: evo.apiKey,
        instanceName,
      });
      if (whRes && typeof whRes === 'object' && (whRes.url || whRes.webhook?.url)) {
        webhook = normalizeWebhookConfig(whRes);
      }
    } catch {
      // keep savedWebhook from Firestore
    }
  }

  return {
    eligible,
    instanceName,
    state,
    enabled: wa.enabled === true,
    groupsIgnore: true,
    events: { ...DEFAULT_WHATSAPP_EVENTS, ...(wa.events || {}) },
    ownerAlertPhone: wa.ownerAlertPhone || '',
    templates: { ...DEFAULT_WHATSAPP_TEMPLATES, ...(wa.templates || {}) },
    webhook,
  };
};

handlers.saveEnterpriseWhatsappWebhook = async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  if (!enterpriseId) throw new HttpsError('invalid-argument', 'enterpriseId required');
  assertTenantAdmin(request, enterpriseId);

  const { entRef, enterprise } = await loadAndAssertUltraEnterprise(enterpriseId);
  const webhook = normalizeWebhookConfig(request.data?.webhook);

  if (webhook.enabled && !/^https?:\/\/.+/i.test(webhook.url)) {
    throw new HttpsError(
      'invalid-argument',
      'Informe uma URL válida iniciando com http:// ou https:// para ativar o webhook.'
    );
  }

  const existingWa = enterprise.whatsappIntegration || {};
  const instanceName =
    existingWa.instanceName ||
    normalizeInstanceName(enterprise.tradeName || enterprise.name, enterpriseId);

  const timestamp = nowIso();
  await entRef.set(
    {
      whatsappIntegration: {
        ...existingWa,
        instanceName,
        groupsIgnore: true,
        webhook,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
    { merge: true }
  );

  let syncedToEvolution = false;
  let syncWarning = null;
  const evo = await loadEvolutionConfig();
  if (evo.baseUrl && evo.apiKey) {
    try {
      await setEvolutionWebhook({
        baseUrl: evo.baseUrl,
        apiKey: evo.apiKey,
        instanceName,
        webhook,
      });
      syncedToEvolution = true;
    } catch (err) {
      syncWarning =
        err?.status === 404
          ? 'Webhook salvo! Ele será aplicado automaticamente na Evolution API assim que você conectar o WhatsApp.'
          : `Webhook salvo no ERP, mas a Evolution API retornou: ${err?.message || 'erro desconhecido'}`;
    }
  }

  return {
    saved: true,
    syncedToEvolution,
    syncWarning,
    webhook,
  };
};

handlers.disconnectEnterpriseWhatsapp = async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  if (!enterpriseId) throw new HttpsError('invalid-argument', 'enterpriseId required');
  assertTenantAdmin(request, enterpriseId);

  const { entRef, enterprise } = await loadAndAssertUltraEnterprise(enterpriseId);
  const wa = enterprise.whatsappIntegration || {};
  if (!wa.instanceName) return { disconnected: true };

  const evo = await loadEvolutionConfig();
  if (evo.baseUrl && evo.apiKey) {
    try {
      await logoutEvolutionInstance({
        baseUrl: evo.baseUrl,
        apiKey: evo.apiKey,
        instanceName: wa.instanceName,
      });
    } catch (err) {
      console.error('disconnectEnterpriseWhatsapp logout warning:', err.message);
    }
  }

  await entRef.set(
    {
      whatsappIntegration: {
        ...wa,
        connectionStatus: 'close',
        updatedAt: nowIso(),
      },
      updatedAt: nowIso(),
    },
    { merge: true }
  );

  return { disconnected: true };
};

handlers.saveEnterpriseWhatsappSettings = async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  if (!enterpriseId) throw new HttpsError('invalid-argument', 'enterpriseId required');
  assertTenantAdmin(request, enterpriseId);

  const { entRef, enterprise } = await loadAndAssertUltraEnterprise(enterpriseId);
  const existingWa = enterprise.whatsappIntegration || {};
  const input = request.data?.settings || {};

  const instanceName =
    existingWa.instanceName ||
    normalizeInstanceName(enterprise.tradeName || enterprise.name, enterpriseId);

  const cleanEvents = { ...DEFAULT_WHATSAPP_EVENTS };
  if (input.events && typeof input.events === 'object') {
    Object.keys(DEFAULT_WHATSAPP_EVENTS).forEach((k) => {
      if (typeof input.events[k] === 'boolean') {
        cleanEvents[k] = input.events[k];
      }
    });
  }

  const cleanTemplates = {};
  if (input.templates && typeof input.templates === 'object') {
    Object.keys(DEFAULT_WHATSAPP_TEMPLATES).forEach((k) => {
      if (typeof input.templates[k] === 'string' && input.templates[k].trim()) {
        cleanTemplates[k] = input.templates[k].trim().slice(0, 1000);
      }
    });
  }

  const timestamp = nowIso();
  await entRef.set(
    {
      whatsappIntegration: {
        ...existingWa,
        enabled: input.enabled === true,
        instanceName,
        groupsIgnore: true,
        events: cleanEvents,
        ownerAlertPhone:
          typeof input.ownerAlertPhone === 'string' ? input.ownerAlertPhone.trim() : '',
        templates: cleanTemplates,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
    { merge: true }
  );

  return { saved: true };
};

handlers.sendTestWhatsappMessage = async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  const phone = String(request.data?.phone || '').trim();
  if (!enterpriseId || !phone) {
    throw new HttpsError('invalid-argument', 'Informe o telefone de destino.');
  }
  assertTenantAdmin(request, enterpriseId);

  const { enterprise } = await loadAndAssertUltraEnterprise(enterpriseId);
  const wa = enterprise.whatsappIntegration || {};
  if (!wa.instanceName) {
    throw new HttpsError('failed-precondition', 'Conecte o WhatsApp da loja antes de testar.');
  }

  const evo = await loadEvolutionConfig();
  if (!evo.baseUrl || !evo.apiKey) {
    throw new HttpsError('failed-precondition', 'Evolution API não configurada na plataforma.');
  }

  const storeName = String(enterprise.tradeName || enterprise.name || 'Sua Loja');
  const storeSlug = String(enterprise.onlineStore?.slug || '').trim();
  const menuUrl = storeSlug ? `https://app.ds3i.com.br/p/${storeSlug}` : '';
  const ordersUrl = storeSlug ? `https://app.ds3i.com.br/p/${storeSlug}/orders` : '';
  const text = `✅ Teste de integração WhatsApp *${storeName}* (Instância ${wa.instanceName}) realizado com sucesso!${
    menuUrl ? `\n\nAcesse nosso cardápio online:\n${menuUrl}` : ''
  }`;
  const testButtons = [];
  if (menuUrl) {
    testButtons.push({ type: 'url', displayText: 'Veja nosso cardápio', url: menuUrl });
  }
  if (ordersUrl) {
    testButtons.push({ type: 'url', displayText: 'Meus pedidos', url: ordersUrl });
  }

  try {
    const { deliveryMode } = await sendEvolutionInteractiveOrText({
      baseUrl: evo.baseUrl,
      apiKey: evo.apiKey,
      instanceName: wa.instanceName,
      number: phone,
      title: `✨ ${storeName}`,
      text,
      footer: 'Atendimento automático',
      buttons: testButtons,
    });
    await writeWhatsappLog(enterpriseId, {
      event: 'test',
      recipientPhone: normalizeBrWhatsappNumber(phone),
      instanceName: wa.instanceName,
      status: 'sent',
      deliveryMode,
      messagePreview: text,
    });
    return { sent: true, deliveryMode };
  } catch (err) {
    await writeWhatsappLog(enterpriseId, {
      event: 'test',
      recipientPhone: normalizeBrWhatsappNumber(phone) || phone,
      instanceName: wa.instanceName,
      status: 'failed',
      errorMessage: String(err?.message || 'Erro ao enviar teste'),
    });
    throw new HttpsError('internal', `Falha no envio: ${err.message}`);
  }
};

handlers.listEnterpriseWhatsappLogs = async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  if (!enterpriseId) throw new HttpsError('invalid-argument', 'enterpriseId required');
  assertTenantPosAccess(request, enterpriseId);

  const snap = await db()
    .collection(`enterprises/${enterpriseId}/whatsappLogs`)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get();

  return {
    logs: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
};

handlers.sendSaleReceiptWhatsapp = async (request) => {
  const enterpriseId = String(request.data?.enterpriseId || '').trim();
  const saleId = String(request.data?.saleId || '').trim();
  const phoneOverride = typeof request.data?.phone === 'string' ? request.data.phone.trim() : '';

  if (!enterpriseId || !saleId) {
    throw new HttpsError('invalid-argument', 'enterpriseId and saleId required');
  }
  assertTenantPosAccess(request, enterpriseId);

  const { enterprise } = await loadAndAssertUltraEnterprise(enterpriseId);
  const saleSnap = await db().doc(`enterprises/${enterpriseId}/sales/${saleId}`).get();
  if (!saleSnap.exists) throw new HttpsError('not-found', 'Venda não encontrada.');

  const sale = saleSnap.data() || {};
  const targetPhone = phoneOverride || String(sale.customerPhone || '');
  if (!normalizeBrWhatsappNumber(targetPhone)) {
    throw new HttpsError('invalid-argument', 'Informe um número de WhatsApp válido com DDD.');
  }

  const wa = enterprise.whatsappIntegration || {};
  if (!wa.instanceName) {
    throw new HttpsError('failed-precondition', 'WhatsApp da empresa ainda não está conectado.');
  }

  const evo = await loadEvolutionConfig();
  if (!evo.baseUrl || !evo.apiKey) {
    throw new HttpsError('failed-precondition', 'Evolution API não configurada na plataforma.');
  }

  const storeName = String(enterprise.tradeName || enterprise.name || 'Loja');
  const paymentLabels = {
    pix: 'PIX',
    cash: 'Dinheiro',
    credit_card: 'Cartão de Crédito',
    debit_card: 'Cartão de Débito',
    store_credit: 'Vale-Troca',
    credit_tab: 'Crediário',
  };
  const paymentsStr = Array.isArray(sale.payments)
    ? sale.payments.map((p) => paymentLabels[p.method] || p.method).join(', ')
    : '—';

  const template =
    (wa.templates && wa.templates.saleReceipt) || DEFAULT_WHATSAPP_TEMPLATES.saleReceipt;
  const text = renderTemplate(template, {
    loja: storeName,
    codigo: sale.code || saleId,
    cliente: sale.customerName || 'Cliente',
    itens: formatOrderItemsText(sale.items || []),
    total: formatCurrencyBrl(sale.total),
    pagamento: paymentsStr,
  });

  try {
    await sendEvolutionText({
      baseUrl: evo.baseUrl,
      apiKey: evo.apiKey,
      instanceName: wa.instanceName,
      number: targetPhone,
      text,
    });
    await writeWhatsappLog(enterpriseId, {
      event: 'saleReceipt',
      saleId,
      recipientPhone: normalizeBrWhatsappNumber(targetPhone),
      instanceName: wa.instanceName,
      status: 'sent',
      messagePreview: text.slice(0, 180),
    });
    return { sent: true };
  } catch (err) {
    await writeWhatsappLog(enterpriseId, {
      event: 'saleReceipt',
      saleId,
      recipientPhone: normalizeBrWhatsappNumber(targetPhone) || targetPhone,
      instanceName: wa.instanceName,
      status: 'failed',
      errorMessage: String(err?.message || 'Erro ao enviar comprovante'),
    });
    throw new HttpsError('internal', `Não foi possível enviar no WhatsApp: ${err.message}`);
  }
};

module.exports = {
  handlers,
  DEFAULT_WHATSAPP_TEMPLATES,
  DEFAULT_WHATSAPP_EVENTS,
  formatCurrencyBrl,
  formatOrderItemsText,
  hasActiveUltraWhatsapp,
  dispatchEnterpriseWhatsappEvent,
};

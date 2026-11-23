const { focusRequest } = require('./focus-client');

function nowIso() {
  return new Date().toISOString();
}

function randomDigits(len) {
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += String(Math.floor(Math.random() * 10));
  }
  return out;
}

function createMockFiscalIssuer(overrides = {}) {
  return {
    async issue(input) {
      if (overrides.issue) return overrides.issue(input);
      const timestamp = nowIso();
      const nfceNumber = String(Math.floor(100000 + Math.random() * 900000));
      const nfceKey = `152611${randomDigits(38)}`;
      const nfceProtocol = `11526${randomDigits(10)}`;
      return {
        status: 'authorized',
        nfceNumber,
        nfceKey,
        nfceProtocol,
        nfceDanfeUrl: overrides.nfceDanfeUrl || undefined,
        nfceQrCodeUrl: overrides.nfceQrCodeUrl || undefined,
        nfceIssuedAt: timestamp,
        ref: input?.saleId || 'mock-ref',
      };
    },
    async cancel(input) {
      if (overrides.cancel) return overrides.cancel(input);
      return {
        status: 'cancelled',
        nfceProtocol: `C${randomDigits(14)}`,
        cancelledAt: nowIso(),
        ref: input?.saleId || 'mock-ref',
      };
    },
  };
}

function moneyStr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Maps ERP sale + enterprise + products into Focus NFC-e JSON body.
 * Field names follow Focus cloud API (POST /v2/nfce?ref=).
 */
function buildFocusNfcePayload({ sale, enterprise, productsById, secrets }) {
  const items = (sale.items || []).map((line, index) => {
    const product = productsById[line.productId] || {};
    const qty = Number(line.qty) || 1;
    const unitPrice = Number(line.unitPrice) || 0;
    return {
      numero_item: String(index + 1),
      codigo_produto: String(product.sku || line.productId || index + 1),
      descricao: String(line.productName || product.name || 'Item'),
      codigo_ncm: String(product.ncm || ''),
      cfop: String(product.cfopSaleDefault || '5102'),
      unidade_comercial: String(product.commercialUnit || product.unit || 'UN'),
      quantidade_comercial: String(qty),
      valor_unitario_comercial: moneyStr(unitPrice),
      valor_bruto: moneyStr(qty * unitPrice),
      unidade_tributavel: String(product.commercialUnit || product.unit || 'UN'),
      quantidade_tributavel: String(qty),
      valor_unitario_tributavel: moneyStr(unitPrice),
      icms_origem: String(product.origin ?? 0),
      icms_situacao_tributaria: String(product.cstOrCsosn || ''),
    };
  });

  const payments = (sale.payments || []).map((p) => ({
    forma_pagamento:
      p.method === 'cash'
        ? '01'
        : p.method === 'pix'
          ? '17'
          : p.method === 'debit'
            ? '04'
            : p.method === 'credit'
              ? '03'
              : '99',
    valor_pagamento: moneyStr(p.amount),
  }));

  const cnpj = digitsOnly(enterprise.document || enterprise.cnpj);
  const payload = {
    cnpj_emitente: cnpj,
    nome_emitente: String(enterprise.name || ''),
    data_emissao: sale.createdAt || nowIso(),
    modalidade_frete: '9',
    local_destino: '1',
    presenca_comprador: '1',
    natureza_operacao: 'VENDA',
    serie: String(enterprise.nfceSeries || '1'),
    items,
    formas_pagamento: payments.length
      ? payments
      : [{ forma_pagamento: '01', valor_pagamento: moneyStr(sale.total) }],
    valor_produtos: moneyStr(sale.subtotal ?? sale.total),
    valor_desconto: moneyStr(sale.discount || 0),
    valor_total: moneyStr(sale.total),
  };

  if (secrets?.cscId) payload.codigo_unico_csc = String(secrets.cscId);
  if (secrets?.cscToken) payload.csc = String(secrets.cscToken);

  const destDoc = digitsOnly(sale.customerDocument);
  if (destDoc.length === 11) payload.cpf_destinatario = destDoc;
  if (destDoc.length === 14) payload.cnpj_destinatario = destDoc;

  return payload;
}

function normalizeAuthorized(data, saleId) {
  if (data.status && data.status !== 'autorizado' && data.status !== 'authorized') {
    const err = new Error(data.mensagem || data.message || `Focus status: ${data.status}`);
    err.focus = data;
    err.code = 'provider_reject';
    throw err;
  }
  return {
    status: 'authorized',
    nfceNumber: String(data.numero || data.nfceNumber || ''),
    nfceKey: String(data.chave_nfe || data.nfceKey || ''),
    nfceProtocol: String(data.protocolo || data.nfceProtocol || ''),
    nfceDanfeUrl: data.caminho_danfe || data.url_danfe || data.nfceDanfeUrl || undefined,
    nfceQrCodeUrl: data.qrcode_url || data.nfceQrCodeUrl || undefined,
    nfceIssuedAt: data.data_emissao || nowIso(),
    ref: String(data.ref || saleId),
  };
}

function createFocusFiscalIssuer() {
  return {
    async issue(input) {
      const { sale, enterprise, products, secrets, environment, saleId } = input;
      const productsById = {};
      (products || []).forEach((p) => {
        productsById[p.id || p.productId] = p;
      });
      const body = buildFocusNfcePayload({
        sale,
        enterprise,
        productsById,
        secrets,
      });
      const ref = encodeURIComponent(saleId || sale.id);
      const data = await focusRequest({
        token: secrets.apiToken,
        env: environment || enterprise.nfceEnvironment || 'homologation',
        method: 'POST',
        path: `/v2/nfce?ref=${ref}`,
        body,
      });
      return normalizeAuthorized(data, saleId || sale.id);
    },
    async cancel(input) {
      const { saleId, secrets, environment, justification } = input;
      const ref = encodeURIComponent(saleId);
      const data = await focusRequest({
        token: secrets.apiToken,
        env: environment || 'homologation',
        method: 'DELETE',
        path: `/v2/nfce/${ref}`,
        body: {
          justificativa: justification || 'Cancelamento solicitado pelo operador do PDV',
        },
      });
      return {
        status: 'cancelled',
        nfceProtocol: String(data.protocolo || ''),
        cancelledAt: data.data_cancelamento || nowIso(),
        ref: String(data.ref || saleId),
      };
    },
  };
}

function createFiscalIssuer(provider) {
  if (provider === 'mock') return createMockFiscalIssuer();
  if (provider === 'focus') return createFocusFiscalIssuer();
  const err = new Error(`provider_not_implemented: ${provider}`);
  err.code = 'provider_not_implemented';
  throw err;
}

module.exports = {
  createFiscalIssuer,
  createMockFiscalIssuer,
  createFocusFiscalIssuer,
  buildFocusNfcePayload,
};

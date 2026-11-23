const { focusRequest } = require('./focus-client');
const { loadPfx, signNfceXml, generateSelfSignedTestA1 } = require('./a1-signer');
const { buildNfceXml } = require('./nfce-xml');
const { autorizarNfce } = require('./sefaz-client');
const { resolveNfceEndpoint } = require('./uf-endpoints');

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

function createSefazDirectFiscalIssuer() {
  return {
    async issue(input) {
      const { sale, enterprise, products, secrets, environment, saleId, nNF } = input;
      if (!secrets?.a1PfxBase64 || !secrets?.a1Password) {
        const err = new Error('A1 certificate is required for SEFAZ-direct');
        err.code = 'missing_fiscal_config';
        throw err;
      }
      if (!secrets?.cscId || !secrets?.cscToken) {
        const err = new Error('CSC id/token are required for SEFAZ-direct');
        err.code = 'missing_fiscal_config';
        throw err;
      }
      const uf = enterprise.state || enterprise.uf || 'PR';
      const { url } = resolveNfceEndpoint(uf, environment);
      const { xml, chNFe, qrCodeUrl, ide } = buildNfceXml({
        sale: { ...sale, id: saleId || sale.id },
        enterprise,
        products,
        nNF,
        environment: environment || 'homologation',
        csc: { cscId: secrets.cscId, cscToken: secrets.cscToken },
      });
      const { privateKeyPem, certificatePem } = loadPfx({
        pfxBase64: secrets.a1PfxBase64,
        password: secrets.a1Password,
      });
      const signedXml = signNfceXml({ xml, privateKeyPem, certificatePem });
      const result = await autorizarNfce({
        endpointUrl: url,
        signedXml,
        certificatePem,
        privateKeyPem,
      });
      if (result.status !== 'authorized') {
        const err = new Error(result.xMotivo || 'SEFAZ rejected');
        err.code = 'provider_reject';
        err.sefaz = result;
        throw err;
      }
      return {
        status: 'authorized',
        nfceNumber: String(result.nfceNumber || ide.nNF || ''),
        nfceKey: String(result.nfceKey || chNFe || ''),
        nfceProtocol: String(result.nfceProtocol || ''),
        nfceQrCodeUrl: qrCodeUrl,
        nfceIssuedAt: nowIso(),
        simulated: false,
        ref: String(saleId || sale.id),
      };
    },
    async cancel() {
      const err = new Error('SEFAZ-direct cancel not implemented in v1 — use SEFAZ portal');
      err.code = 'provider_not_implemented';
      throw err;
    },
  };
}

/**
 * Full SEFAZ 4.00 simulation issuer (no real A1 certificate required).
 * Builds real NFC-e 4.00 XML, QR Code v2 SHA-1 and signs with an ephemeral test certificate.
 */
function createSefazSimulatorFiscalIssuer() {
  return {
    async issue(input) {
      const { sale, enterprise, products, secrets, saleId, nNF } = input;
      const { xml, chNFe, qrCodeUrl, ide } = buildNfceXml({
        sale: { ...sale, id: saleId || sale.id },
        enterprise,
        products,
        nNF,
        environment: 'homologation',
        csc: {
          cscId: secrets?.cscId || enterprise?.nfceCscId || '000001',
          cscToken: secrets?.cscToken || 'SIMULACAO-CSC-TOKEN-00000000',
        },
      });
      const { privateKeyPem, certificatePem } = generateSelfSignedTestA1(
        enterprise?.name || 'SIMULACAO SEFAZ'
      );
      const signedXml = signNfceXml({ xml, privateKeyPem, certificatePem });
      if (!signedXml.includes('<Signature')) {
        const err = new Error('Simulated XML signature failed');
        err.code = 'provider_reject';
        throw err;
      }
      const year = String(new Date().getUTCFullYear()).slice(2);
      const nfceProtocol = `1${ide.cUF}${year}${randomDigits(10)}`;
      return {
        status: 'authorized',
        nfceNumber: String(ide.nNF),
        nfceKey: chNFe,
        nfceProtocol,
        nfceQrCodeUrl: qrCodeUrl,
        nfceIssuedAt: nowIso(),
        simulated: true,
        signedXml,
        ref: String(saleId || sale.id),
      };
    },
    async cancel(input) {
      return {
        status: 'cancelled',
        nfceProtocol: `C${randomDigits(14)}`,
        cancelledAt: nowIso(),
        simulated: true,
        ref: String(input?.saleId || 'sim-cancel'),
      };
    },
  };
}

function createFiscalIssuer(provider) {
  if (provider === 'mock') return createMockFiscalIssuer();
  if (provider === 'sefaz-simulator') return createSefazSimulatorFiscalIssuer();
  if (provider === 'focus') return createFocusFiscalIssuer();
  if (provider === 'sefaz-direct') return createSefazDirectFiscalIssuer();
  const err = new Error(`provider_not_implemented: ${provider}`);
  err.code = 'provider_not_implemented';
  throw err;
}

module.exports = {
  createFiscalIssuer,
  createMockFiscalIssuer,
  createFocusFiscalIssuer,
  createSefazDirectFiscalIssuer,
  createSefazSimulatorFiscalIssuer,
  buildFocusNfcePayload,
};

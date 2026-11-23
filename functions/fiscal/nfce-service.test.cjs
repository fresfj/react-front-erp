const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { issueSaleNfceForEnterprise } = require('./nfce-service');
const { createMockFiscalIssuer, buildFocusNfcePayload } = require('./fiscal-issuer');
const { buildNfceXml, HOMOLOGATION_ITEM_DESC } = require('./nfce-xml');
const { resolveNfceEndpoint } = require('./uf-endpoints');
const {
  parseSiscomexPayload,
  filterNcmIndex,
  clearSiscomexNcmCache,
} = require('./siscomex-ncm');

function createInMemoryDb(seedDocs) {
  const store = new Map(Object.entries(seedDocs));
  return {
    store,
    doc(path) {
      return {
        async get() {
          const data = store.get(path);
          return {
            exists: data !== undefined,
            data: () => (data ? { ...data } : undefined),
          };
        },
        async set(payload, options) {
          const prev = options?.merge ? store.get(path) || {} : {};
          store.set(path, { ...prev, ...payload });
        },
      };
    },
  };
}

describe('NFC-e emission certification (mock + homologation + production)', () => {
  it('authorizes a sale end-to-end with mock issuer when product has NCM + origin + CST/CSOSN', async () => {
    const db = createInMemoryDb({
      'enterprises/ds3i': {
        name: 'DS3I LTDA',
        document: '12345678000199',
        state: 'PA',
        nfceEnabled: true,
        taxRegime: 'simples',
        nfceSeries: '1',
        nfceEnvironment: 'homologation',
        fiscalIssuerProvider: 'focus',
      },
      'enterprises/ds3i/secrets/fiscal': {
        provider: 'focus',
        apiToken: 'test-token',
        cscId: '000001',
        cscToken: 'CSC-TEST',
      },
      'enterprises/ds3i/products/prod1': {
        name: 'Acai 500ml',
        sku: 'ACA-500',
        unit: 'UN',
        ncm: '21069090',
        origin: 0,
        cstOrCsosn: '102',
        cfopSaleDefault: '5102',
      },
      'enterprises/ds3i/sales/sale1': {
        total: 25.5,
        subtotal: 25.5,
        discount: 0,
        createdAt: '2026-11-23T12:00:00.000Z',
        items: [{ productId: 'prod1', productName: 'Acai 500ml', qty: 1, unitPrice: 25.5 }],
        payments: [{ method: 'pix', amount: 25.5 }],
      },
    });

    const result = await issueSaleNfceForEnterprise(db, {
      enterpriseId: 'ds3i',
      saleId: 'sale1',
      issuerFactory: () => createMockFiscalIssuer(),
    });

    assert.ok(result.nfceNumber);
    assert.equal(result.nfceKey.length, 44);
    assert.ok(result.nfceProtocol);
    assert.ok(result.nfceIssuedAt);

    const savedSale = db.store.get('enterprises/ds3i/sales/sale1');
    assert.equal(savedSale.nfceStatus, 'authorized');
    assert.equal(savedSale.nfceNumber, result.nfceNumber);
    assert.equal(savedSale.nfceKey, result.nfceKey);
    assert.equal(savedSale.nfceLastError, null);
  });

  it('blocks emission with missing_fiscal_product_data when product lacks NCM or CST/CSOSN', async () => {
    const db = createInMemoryDb({
      'enterprises/ds3i': {
        name: 'DS3I LTDA',
        document: '12345678000199',
        nfceEnabled: true,
        taxRegime: 'simples',
        nfceSeries: '1',
        nfceEnvironment: 'homologation',
        fiscalIssuerProvider: 'focus',
      },
      'enterprises/ds3i/secrets/fiscal': {
        provider: 'focus',
        apiToken: 'test-token',
      },
      'enterprises/ds3i/products/prod-incomplete': {
        name: 'Produto Sem NCM',
        sku: 'SEM-NCM',
        unit: 'UN',
        origin: 0,
      },
      'enterprises/ds3i/sales/sale2': {
        total: 10,
        items: [{ productId: 'prod-incomplete', productName: 'Produto Sem NCM', qty: 1, unitPrice: 10 }],
      },
    });

    await assert.rejects(
      () =>
        issueSaleNfceForEnterprise(db, {
          enterpriseId: 'ds3i',
          saleId: 'sale2',
          issuerFactory: () => createMockFiscalIssuer(),
        }),
      (err) => err.code === 'missing_fiscal_product_data'
    );

    const savedSale = db.store.get('enterprises/ds3i/sales/sale2');
    assert.equal(savedSale.nfceStatus, 'error');
    assert.match(savedSale.nfceLastError, /missing_fiscal_product_data/);
  });

  it('maps Focus NFe payload with exact NCM, origin, CST/CSOSN and CFOP', () => {
    const payload = buildFocusNfcePayload({
      sale: {
        id: 'sale1',
        total: 30,
        subtotal: 30,
        discount: 0,
        items: [{ productId: 'p1', productName: 'Acai 1L', qty: 2, unitPrice: 15 }],
        payments: [{ method: 'credit', amount: 30 }],
      },
      enterprise: {
        name: 'DS3I LTDA',
        document: '12.345.678/0001-99',
        nfceSeries: '1',
      },
      productsById: {
        p1: {
          sku: 'ACA-1L',
          ncm: '21069090',
          origin: 0,
          cstOrCsosn: '102',
          cfopSaleDefault: '5102',
          commercialUnit: 'UN',
        },
      },
      secrets: { cscId: '000001', cscToken: 'TOKEN123' },
    });

    assert.equal(payload.cnpj_emitente, '12345678000199');
    assert.equal(payload.items[0].codigo_ncm, '21069090');
    assert.equal(payload.items[0].icms_origem, '0');
    assert.equal(payload.items[0].icms_situacao_tributaria, '102');
    assert.equal(payload.items[0].cfop, '5102');
    assert.equal(payload.formas_pagamento[0].forma_pagamento, '03');
  });

  it('generates SEFAZ XML with tpAmb 2 in homologation and tpAmb 1 in production', () => {
    const baseInput = {
      enterprise: {
        name: 'DS3I LTDA',
        document: '12345678000199',
        state: 'PA',
        nfceSeries: '1',
      },
      sale: {
        id: 'sale1',
        total: 15,
        subtotal: 15,
        items: [{ productId: 'p1', productName: 'Acai', qty: 1, unitPrice: 15 }],
        payments: [{ method: 'pix', amount: 15 }],
      },
      products: [
        { id: 'p1', ncm: '21069090', origin: 0, cstOrCsosn: '102', cfopSaleDefault: '5102', unit: 'UN' },
      ],
      csc: { cscId: '1', cscToken: 'TEST' },
    };

    const homolog = buildNfceXml({ ...baseInput, environment: 'homologation' });
    const prod = buildNfceXml({ ...baseInput, environment: 'production' });

    assert.match(homolog.xml, /<tpAmb>2<\/tpAmb>/);
    assert.match(prod.xml, /<tpAmb>1<\/tpAmb>/);
    assert.match(prod.xml, /<NCM>21069090<\/NCM>/);
    assert.match(prod.xml, /<orig>0<\/orig><CSOSN>102<\/CSOSN>/);
    assert.match(homolog.xml, new RegExp(HOMOLOGATION_ITEM_DESC));
    assert.match(prod.xml, /<PIS><PISOutr>/);
    assert.match(prod.xml, /<COFINS><COFINSOutr>/);
    assert.ok(
      prod.xml.indexOf('</infNFe>') < prod.xml.indexOf('<infNFeSupl>'),
      'infNFeSupl must appear after </infNFe> per XSD 4.00'
    );
  });

  it('issues simulated SEFAZ NFC-e 4.00 with real XMLDSig signature and sequential nNF (PR, without A1)', async () => {
    const db = createInMemoryDb({
      'enterprises/ds3i': {
        name: 'DS3I LTDA',
        document: '12345678000199',
        state: 'PR',
        nfceEnabled: true,
        taxRegime: 'simples',
        nfceSeries: '1',
        nfceEnvironment: 'homologation',
        fiscalIssuerProvider: 'sefaz-simulator',
      },
      'enterprises/ds3i/products/prod1': {
        name: 'Acai 500ml',
        sku: 'ACA-500',
        unit: 'UN',
        ncm: '21069090',
        origin: 0,
        cstOrCsosn: '102',
        cfopSaleDefault: '5102',
      },
      'enterprises/ds3i/sales/sale-sim-1': {
        total: 20,
        subtotal: 20,
        items: [{ productId: 'prod1', productName: 'Acai 500ml', qty: 1, unitPrice: 20 }],
        payments: [{ method: 'pix', amount: 20 }],
      },
    });

    const res = await issueSaleNfceForEnterprise(db, {
      enterpriseId: 'ds3i',
      saleId: 'sale-sim-1',
    });

    assert.equal(res.nfceNumber, '1');
    assert.equal(res.nfceKey.length, 44);
    assert.ok(res.nfceKey.startsWith('41'), 'PR key must start with cUF 41');
    assert.equal(res.nfceSimulated, true);
    assert.match(res.nfceQrCodeUrl, /^http:\/\/www\.fazenda\.pr\.gov\.br\/nfce\/qrcode\?p=/);

    const saved = db.store.get('enterprises/ds3i/sales/sale-sim-1');
    assert.equal(saved.nfceStatus, 'authorized');
    assert.equal(saved.nfceSimulated, true);
  });

  it('resolves official SEFAZ-direct endpoints for PR, PA, SP, SC and RJ', () => {
    for (const uf of ['PR', 'PA', 'SP', 'SC', 'RJ']) {
      const h = resolveNfceEndpoint(uf, 'homologation');
      const p = resolveNfceEndpoint(uf, 'production');
      assert.ok(h.url.startsWith('https://'), `${uf} homologation URL`);
      assert.ok(p.url.startsWith('https://'), `${uf} production URL`);
      assert.ok(h.statusUrl.startsWith('https://'), `${uf} status URL`);
      assert.ok(h.qrCodeBaseUrl.startsWith('http'), `${uf} QR code URL`);
      assert.ok(h.urlChave.startsWith('http'), `${uf} urlChave`);
    }
  });
});

describe('Siscomex public NCM table parser & accent-insensitive filter', () => {
  it('keeps only valid 8-digit NCMs, strips HTML tags and matches accent-insensitively', () => {
    clearSiscomexNcmCache();
    const index = parseSiscomexPayload({
      Data_Ultima_Atualizacao_NCM: 'Vigente em 23/11/2026',
      Ato: 'Resolução Gecex nº 926/2026',
      Nomenclaturas: [
        { Codigo: '21', Descricao: 'Preparações alimentícias diversas' },
        { Codigo: '21.06', Descricao: 'Preparações alimentícias não especificadas' },
        { Codigo: '2106.90.90', Descricao: '- Outras <i>preparações</i> de açaí' },
        { Codigo: '2008.70.20', Descricao: 'Polpa com valor Brix igual ou superior a 20' },
      ],
    });

    assert.equal(index.items.length, 2);
    assert.equal(index.items[0].code, '21069090');
    assert.equal(index.items[0].description, 'Outras preparações de açaí');

    const byAccentless = filterNcmIndex(index, 'acai', 10);
    assert.equal(byAccentless.length, 1);
    assert.equal(byAccentless[0].code, '21069090');

    const byPrefix = filterNcmIndex(index, '2008', 10);
    assert.equal(byPrefix.length, 1);
    assert.equal(byPrefix[0].code, '20087020');
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildNfceXml } = require('./nfce-xml');

describe('buildNfceXml', () => {
  it('sets modelo 65 and tpAmb 2 in homologation', () => {
    const { xml } = buildNfceXml({
      environment: 'homologation',
      enterprise: {
        name: 'EMPRESA TESTE',
        document: '00000000000000',
        state: 'PA',
        nfceSeries: '1',
        city: 'Belem',
        address: 'Rua A',
        addressNumber: '1',
        neighborhood: 'Centro',
        zipCode: '66000000',
      },
      sale: {
        id: 'sale1',
        total: 10,
        subtotal: 10,
        discount: 0,
        createdAt: '2026-11-23T12:00:00.000Z',
        items: [
          {
            productId: 'p1',
            productName: 'Acai',
            qty: 1,
            unitPrice: 10,
          },
        ],
        payments: [{ method: 'pix', amount: 10 }],
      },
      products: [
        {
          id: 'p1',
          ncm: '21069090',
          origin: 0,
          cstOrCsosn: '102',
          cfopSaleDefault: '5102',
          unit: 'UN',
        },
      ],
      csc: { cscId: '1', cscToken: 'TEST' },
    });
    assert.match(xml, /<mod>65<\/mod>/);
    assert.match(xml, /<tpAmb>2<\/tpAmb>/);
    assert.match(xml, /21069090/);
  });
});

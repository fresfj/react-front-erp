import { it, expect, describe } from 'vitest';

import { buildPixBrCode, computeCrc16Ccitt } from './pix-brcode';

// ----------------------------------------------------------------------

describe('pix-brcode', () => {
  it('returns empty string when pixKey is missing', () => {
    expect(buildPixBrCode({ pixKey: '', merchantName: 'Loja', merchantCity: 'SP' })).toBe('');
  });

  it('generates a valid EMVCo PIX BR Code with amount, txid and CRC16', () => {
    const code = buildPixBrCode({
      pixKey: 'loja@exemplo.com',
      merchantName: 'Açaí da Praça',
      merchantCity: 'São Paulo',
      amount: 42.5,
      txid: 'OL-20261121-ABCD',
    });

    expect(code).toContain('BR.GOV.BCB.PIX');
    expect(code).toContain('loja@exemplo.com');
    expect(code).toContain('540542.50');
    expect(code).toContain('5913Acai da Praca');
    expect(code).toContain('6009Sao Paulo');
    expect(code).toContain('OL20261121ABCD');
    expect(code.slice(-8, -4)).toBe('6304');

    const payloadWithoutCrc = code.slice(0, -4);
    expect(code.slice(-4)).toBe(computeCrc16Ccitt(payloadWithoutCrc));
  });
});

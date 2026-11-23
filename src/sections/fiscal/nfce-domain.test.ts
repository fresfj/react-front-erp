import { it, expect, describe } from 'vitest';

import { canEmitNfce, nextNfceStatus } from './nfce-domain';

describe('canEmitNfce', () => {
  const baseEnt = {
    nfceEnabled: true,
    taxRegime: 'simples' as const,
    nfceSeries: '1',
    nfceEnvironment: 'homologation' as const,
    hasIssuerCredentials: true,
  };

  it('fails when nfce disabled', () => {
    const r = canEmitNfce({ ...baseEnt, nfceEnabled: false }, [
      { ncm: '21069090', origin: 0, cstOrCsosn: '102' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('missing_fiscal_config');
  });

  it('fails when credentials missing', () => {
    const r = canEmitNfce({ ...baseEnt, hasIssuerCredentials: false }, [
      { ncm: '21069090', origin: 0, cstOrCsosn: '102' },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('missing_fiscal_config');
  });

  it('fails when product lacks ncm/origin/cstOrCsosn', () => {
    const r = canEmitNfce(baseEnt, [{ ncm: '', origin: 0, cstOrCsosn: '102' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('missing_fiscal_product_data');
  });

  it('passes when enterprise + all products valid', () => {
    expect(
      canEmitNfce(baseEnt, [{ ncm: '21069090', origin: 0, cstOrCsosn: '102' }]).ok
    ).toBe(true);
  });
});

describe('nextNfceStatus', () => {
  it('none + enqueue → pending', () => {
    expect(nextNfceStatus('none', 'enqueue')).toBe('pending');
  });
  it('pending + authorize → authorized', () => {
    expect(nextNfceStatus('pending', 'authorize')).toBe('authorized');
  });
  it('pending + fail → error', () => {
    expect(nextNfceStatus('pending', 'fail')).toBe('error');
  });
  it('error + retry → pending', () => {
    expect(nextNfceStatus('error', 'retry')).toBe('pending');
  });
  it('authorized + cancel → cancelled', () => {
    expect(nextNfceStatus('authorized', 'cancel')).toBe('cancelled');
  });
});

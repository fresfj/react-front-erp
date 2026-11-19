import { it, expect, describe } from 'vitest';

import { splitInstallments, buildInstallmentDueDates } from './installments';

describe('splitInstallments', () => {
  it('splits 100 into 3 with remainder on last', () => {
    expect(splitInstallments(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });

  it('returns single amount for count 1', () => {
    expect(splitInstallments(10, 1)).toEqual([10]);
  });

  it('handles exact division', () => {
    expect(splitInstallments(90, 3)).toEqual([30, 30, 30]);
  });

  it('throws when count < 1', () => {
    expect(() => splitInstallments(10, 0)).toThrow();
  });
});

describe('buildInstallmentDueDates', () => {
  it('weekly steps by 7 days', () => {
    expect(buildInstallmentDueDates('2026-11-16', 'weekly', 3)).toEqual([
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('monthly steps by calendar month', () => {
    expect(buildInstallmentDueDates('2026-11-16', 'monthly', 3)).toEqual([
      '2026-11-16',
      '2026-12-16',
      '2027-01-16',
    ]);
  });

  it('none returns single start date', () => {
    expect(buildInstallmentDueDates('2026-11-16', 'none', 1)).toEqual(['2026-11-16']);
  });
});

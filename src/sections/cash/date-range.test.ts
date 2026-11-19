import { it, expect, describe } from 'vitest';

import { isTimestampInDateRange } from './date-range';

describe('isTimestampInDateRange', () => {
  it('includes timestamps on boundary days', () => {
    expect(isTimestampInDateRange('2026-11-01T12:00:00.000Z', '2026-11-01', '2026-11-30')).toBe(
      true
    );
    expect(isTimestampInDateRange('2026-11-30T23:00:00.000Z', '2026-11-01', '2026-11-30')).toBe(
      true
    );
  });

  it('excludes outside range', () => {
    expect(isTimestampInDateRange('2026-10-31T23:00:00.000Z', '2026-11-01', '2026-11-30')).toBe(
      false
    );
  });

  it('rejects empty', () => {
    expect(isTimestampInDateRange('', '2026-11-01', '2026-11-30')).toBe(false);
  });
});

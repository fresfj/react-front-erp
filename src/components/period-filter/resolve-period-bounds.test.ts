import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { isIsoInPeriodBounds, resolvePeriodBounds } from './resolve-period-bounds';

describe('resolvePeriodBounds', () => {
  it('all returns null bounds', () => {
    expect(resolvePeriodBounds('all', null, null)).toEqual({ start: null, end: null });
  });

  it('custom uses provided dates when both set', () => {
    const start = dayjs('2026-11-01');
    const end = dayjs('2026-11-15');
    const bounds = resolvePeriodBounds('custom', start, end);
    expect(bounds.start?.format('YYYY-MM-DD')).toBe('2026-11-01');
    expect(bounds.end?.format('YYYY-MM-DD')).toBe('2026-11-15');
  });
});

describe('isIsoInPeriodBounds', () => {
  it('passes all when bounds null', () => {
    expect(isIsoInPeriodBounds('2026-01-01T12:00:00.000Z', { start: null, end: null })).toBe(true);
  });

  it('filters outside custom range', () => {
    const bounds = resolvePeriodBounds('custom', dayjs('2026-11-01'), dayjs('2026-11-10'));
    expect(isIsoInPeriodBounds('2026-11-05T12:00:00.000Z', bounds)).toBe(true);
    expect(isIsoInPeriodBounds('2026-10-31T12:00:00.000Z', bounds)).toBe(false);
  });
});

import type { Dayjs } from 'dayjs';

import dayjs from 'dayjs';

import type { DateFilterPreset } from './types';

export type PeriodBounds = { start: Dayjs | null; end: Dayjs | null };

/** Resolve inclusive day bounds for filtering timestamps. `all` → null bounds (no filter). */
export function resolvePeriodBounds(
  preset: DateFilterPreset,
  customStart: Dayjs | null | undefined,
  customEnd: Dayjs | null | undefined
): PeriodBounds {
  const end = dayjs().endOf('day');

  if (preset === 'all') {
    return { start: null, end: null };
  }
  if (preset === 'today') {
    return { start: dayjs().startOf('day'), end };
  }
  if (preset === '7d') {
    return { start: dayjs().subtract(6, 'day').startOf('day'), end };
  }
  if (preset === '30d') {
    return { start: dayjs().subtract(29, 'day').startOf('day'), end };
  }
  if (preset === '90d') {
    return { start: dayjs().subtract(89, 'day').startOf('day'), end };
  }
  // custom
  if (customStart && customEnd) {
    return { start: dayjs(customStart).startOf('day'), end: dayjs(customEnd).endOf('day') };
  }
  return { start: null, end: null };
}

export function isIsoInPeriodBounds(iso: string | null | undefined, bounds: PeriodBounds): boolean {
  if (!iso) return false;
  if (!bounds.start && !bounds.end) return true;
  const t = dayjs(iso);
  if (!t.isValid()) return false;
  if (bounds.start && t.isBefore(bounds.start)) return false;
  if (bounds.end && t.isAfter(bounds.end)) return false;
  return true;
}

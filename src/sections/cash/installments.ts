import type { Dayjs } from 'dayjs';
import type { FinancialRecurrence } from 'src/api/firestore/payables';

import dayjs from 'dayjs';

// ----------------------------------------------------------------------

/** Split `total` into `count` amounts (2 dp). Last installment absorbs remainder. */
export function splitInstallments(total: number, count: number): number[] {
  if (!Number.isFinite(total) || count < 1) {
    throw new Error('Invalid installment split');
  }
  if (count === 1) {
    return [round2(total)];
  }

  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const amounts: number[] = [];
  let allocated = 0;

  for (let i = 0; i < count - 1; i += 1) {
    amounts.push(base / 100);
    allocated += base;
  }
  amounts.push((cents - allocated) / 100);
  return amounts.map(round2);
}

/** Build inclusive installment due dates from start YMD. */
export function buildInstallmentDueDates(
  startYmd: string,
  recurrence: FinancialRecurrence,
  count: number
): string[] {
  if (count < 1) {
    throw new Error('Invalid installment count');
  }

  const start = dayjs(startYmd);
  if (!start.isValid()) {
    throw new Error('Invalid start date');
  }

  const dates: string[] = [];
  for (let i = 0; i < count; i += 1) {
    dates.push(addRecurrence(start, recurrence, i).format('YYYY-MM-DD'));
  }
  return dates;
}

function addRecurrence(start: Dayjs, recurrence: FinancialRecurrence, index: number): Dayjs {
  if (index === 0 || recurrence === 'none') {
    return start;
  }
  if (recurrence === 'weekly') {
    return start.add(index * 7, 'day');
  }
  return start.add(index, 'month');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

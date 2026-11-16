/** Inclusive day range filter for ISO timestamps (UTC-safe via Date parse). */

export function startOfDayIso(dateYmd: string): string {
  return `${dateYmd}T00:00:00.000`;
}

export function endOfDayIso(dateYmd: string): string {
  return `${dateYmd}T23:59:59.999`;
}

export function isTimestampInDateRange(
  iso: string | null | undefined,
  startYmd: string,
  endYmd: string
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const start = new Date(startOfDayIso(startYmd)).getTime();
  const end = new Date(endOfDayIso(endYmd)).getTime();
  return t >= start && t <= end;
}

export function todayYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

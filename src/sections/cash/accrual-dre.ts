import type { Sale } from 'src/api/firestore/sales';
import type { FinancialCategory } from 'src/api/firestore/payables';

import dayjs from 'dayjs';

import type { PeriodBounds } from 'src/components/period-filter';
import { isIsoInPeriodBounds } from 'src/components/period-filter';

// ----------------------------------------------------------------------

export type DreClass = 'operating' | 'cogs_inventory' | 'other_income' | 'ignore';

export type AccrualPayableInput = {
  category: FinancialCategory;
  amount: number;
  startDate: string;
  competenceDate?: string;
  dreClass?: DreClass;
  status: string;
  active?: boolean;
};

export type AccrualDreExpenseLine = {
  category: FinancialCategory;
  dreClass: DreClass;
  amount: number;
  pctOfRevenue: number;
};

export type AccrualDreDailyPoint = {
  date: string;
  revenue: number;
  cogs: number;
  operatingExpenses: number;
  netProfit: number;
};

export type AccrualDreReport = {
  salesCount: number;
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  expenseLines: AccrualDreExpenseLine[];
  netProfit: number;
  netMarginPercent: number;
  dailySeries: AccrualDreDailyPoint[];
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function defaultDreClassForCategory(category: FinancialCategory): DreClass {
  if (category === 'supplier') return 'cogs_inventory';
  return 'operating';
}

export function resolvePayableDreClass(p: {
  category: FinancialCategory;
  dreClass?: DreClass;
}): DreClass {
  return p.dreClass ?? defaultDreClassForCategory(p.category);
}

export function isDateOnlyInPeriodBounds(dateOnly: string, bounds: PeriodBounds): boolean {
  if (!dateOnly) return false;
  if (!bounds.start && !bounds.end) return true;
  const t = dayjs(dateOnly).startOf('day');
  if (!t.isValid()) return false;
  if (bounds.start && t.isBefore(bounds.start.startOf('day'))) return false;
  if (bounds.end && t.isAfter(bounds.end.endOf('day'))) return false;
  return true;
}

function saleDayKey(iso: string): string {
  return dayjs(iso).format('YYYY-MM-DD');
}

export function buildAccrualDre(params: {
  sales: Sale[];
  payables: AccrualPayableInput[];
  bounds: PeriodBounds;
}): AccrualDreReport {
  const completed = params.sales.filter(
    (s) => s.status === 'completed' && isIsoInPeriodBounds(s.createdAt, params.bounds)
  );

  let grossRevenue = 0;
  let discounts = 0;
  let netRevenue = 0;
  let cogs = 0;

  const dailyMap = new Map<string, AccrualDreDailyPoint>();

  const ensureDay = (date: string): AccrualDreDailyPoint => {
    let row = dailyMap.get(date);
    if (!row) {
      row = { date, revenue: 0, cogs: 0, operatingExpenses: 0, netProfit: 0 };
      dailyMap.set(date, row);
    }
    return row;
  };

  completed.forEach((s) => {
    grossRevenue += Number(s.subtotal) || 0;
    discounts += Number(s.discountAmount) || 0;
    netRevenue += Number(s.total) || 0;
    cogs += Number(s.totalCost) || 0;

    if (s.createdAt) {
      const day = ensureDay(saleDayKey(s.createdAt));
      day.revenue = round2(day.revenue + (Number(s.total) || 0));
      day.cogs = round2(day.cogs + (Number(s.totalCost) || 0));
    }
  });

  grossRevenue = round2(grossRevenue);
  discounts = round2(discounts);
  netRevenue = round2(netRevenue);
  cogs = round2(cogs);

  const expenseByCategory = new Map<FinancialCategory, number>();
  let operatingExpenses = 0;

  params.payables.forEach((p) => {
    if (p.active === false) return;
    if (p.status === 'cancelled') return;

    const competence = p.competenceDate || p.startDate;
    if (!isDateOnlyInPeriodBounds(competence, params.bounds)) return;

    const dreClass = resolvePayableDreClass(p);
    if (dreClass !== 'operating') return;

    const amount = Number(p.amount) || 0;
    operatingExpenses += amount;
    expenseByCategory.set(p.category, (expenseByCategory.get(p.category) || 0) + amount);

    const day = ensureDay(dayjs(competence).format('YYYY-MM-DD'));
    day.operatingExpenses = round2(day.operatingExpenses + amount);
  });

  operatingExpenses = round2(operatingExpenses);

  const expenseLines: AccrualDreExpenseLine[] = Array.from(expenseByCategory.entries())
    .map(([category, amount]) => ({
      category,
      dreClass: 'operating' as const,
      amount: round2(amount),
      pctOfRevenue: netRevenue > 0 ? round2((amount / netRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const grossProfit = round2(netRevenue - cogs);
  const grossMarginPercent = netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0;
  const netProfit = round2(grossProfit - operatingExpenses);
  const netMarginPercent = netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0;

  const dailySeries = Array.from(dailyMap.values())
    .map((d) => ({
      ...d,
      revenue: round2(d.revenue),
      cogs: round2(d.cogs),
      operatingExpenses: round2(d.operatingExpenses),
      netProfit: round2(d.revenue - d.cogs - d.operatingExpenses),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    salesCount: completed.length,
    grossRevenue,
    discounts,
    netRevenue,
    cogs,
    grossProfit,
    grossMarginPercent,
    operatingExpenses,
    expenseLines,
    netProfit,
    netMarginPercent,
    dailySeries,
  };
}

import type { Sale } from 'src/api/firestore/sales';
import type {
  CashMovement,
  CashSessionTotalsByMethod,
} from 'src/api/firestore/cash-sessions';

// ----------------------------------------------------------------------

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function emptyTotalsByMethod(): CashSessionTotalsByMethod {
  return {
    cash: 0,
    pix: 0,
    credit_card: 0,
    debit_card: 0,
    store_credit: 0,
    credit_tab: 0,
  };
}

/**
 * Calcula os totais esperados do caixa a partir do saldo inicial, movimentações
 * (suprimento, sangria, recebimentos de AR/fiado e pagamentos de AP) e vendas concluídas.
 */
export function calculateCashSessionExpected(params: {
  openingBalance: number;
  movements: CashMovement[];
  sales: Sale[];
}): {
  expectedTotals: CashSessionTotalsByMethod;
  totalSupplies: number;
  totalWithdrawals: number;
  totalReceipts: number;
  totalPayments: number;
  netCashSales: number;
  expectedDrawerCash: number;
} {
  const totals = emptyTotalsByMethod();

  params.sales
    .filter((s) => s.status === 'completed')
    .forEach((sale) => {
      let changeLeft = Math.max(0, Number(sale.changeAmount) || 0);
      sale.payments.forEach((p) => {
        if (p.method in totals) {
          let amt = Number(p.amount) || 0;
          if (p.method === 'cash' && changeLeft > 0) {
            const deduct = Math.min(amt, changeLeft);
            amt = round2(amt - deduct);
            changeLeft = round2(changeLeft - deduct);
          }
          totals[p.method] = round2(totals[p.method] + amt);
        }
      });
    });

  const netCashSales = round2(Math.max(0, totals.cash));
  totals.cash = netCashSales;

  const totalSupplies = round2(
    params.movements
      .filter((m) => m.type === 'SUPPLY')
      .reduce((acc, m) => acc + (Number(m.amount) || 0), 0)
  );

  const totalWithdrawals = round2(
    params.movements
      .filter((m) => m.type === 'WITHDRAWAL')
      .reduce((acc, m) => acc + (Number(m.amount) || 0), 0)
  );

  const totalReceipts = round2(
    params.movements
      .filter((m) => m.type === 'RECEIPT')
      .reduce((acc, m) => acc + (Number(m.amount) || 0), 0)
  );

  const totalPayments = round2(
    params.movements
      .filter((m) => m.type === 'PAYMENT')
      .reduce((acc, m) => acc + (Number(m.amount) || 0), 0)
  );

  const expectedDrawerCash = round2(
    (Number(params.openingBalance) || 0) +
      netCashSales +
      totalSupplies +
      totalReceipts -
      totalWithdrawals -
      totalPayments
  );

  return {
    expectedTotals: totals,
    totalSupplies,
    totalWithdrawals,
    totalReceipts,
    totalPayments,
    netCashSales,
    expectedDrawerCash,
  };
}

export function calculateMethodDifferences(
  expected: CashSessionTotalsByMethod,
  counted: CashSessionTotalsByMethod
): {
  pix: number;
  credit_card: number;
  debit_card: number;
  hasDigitalDivergence: boolean;
} {
  const pix = round2((Number(counted.pix) || 0) - (Number(expected.pix) || 0));
  const credit_card = round2(
    (Number(counted.credit_card) || 0) - (Number(expected.credit_card) || 0)
  );
  const debit_card = round2(
    (Number(counted.debit_card) || 0) - (Number(expected.debit_card) || 0)
  );
  const hasDigitalDivergence =
    Math.abs(pix) >= 0.01 || Math.abs(credit_card) >= 0.01 || Math.abs(debit_card) >= 0.01;
  return { pix, credit_card, debit_card, hasDigitalDivergence };
}

export function calculateBlindCloseDifference(params: {
  expectedDrawerCash: number;
  countedDrawerCash: number;
}): {
  differenceAmount: number;
  status: 'exact' | 'surplus' | 'shortage';
} {
  const differenceAmount = round2(
    (Number(params.countedDrawerCash) || 0) - (Number(params.expectedDrawerCash) || 0)
  );

  if (Math.abs(differenceAmount) < 0.01) {
    return { differenceAmount: 0, status: 'exact' };
  }
  return {
    differenceAmount,
    status: differenceAmount > 0 ? 'surplus' : 'shortage',
  };
}

export type DreReport = {
  salesCount: number;
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  cogs: number; // CMV
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number; // Sangrias / Despesas
  netProfit: number;
  netMarginPercent: number;
  byMethod: CashSessionTotalsByMethod;
};

export function calculateDreReport(params: {
  sales: Sale[];
  operatingExpenses?: number;
}): DreReport {
  const completed = params.sales.filter((s) => s.status === 'completed');
  const byMethod = emptyTotalsByMethod();

  let grossRevenue = 0;
  let discounts = 0;
  let netRevenue = 0;
  let cogs = 0;

  completed.forEach((s) => {
    grossRevenue += Number(s.subtotal) || 0;
    discounts += Number(s.discountAmount) || 0;
    netRevenue += Number(s.total) || 0;
    cogs += Number(s.totalCost) || 0;

    let changeLeft = Number(s.changeAmount) || 0;
    s.payments.forEach((p) => {
      if (p.method in byMethod) {
        let amt = Number(p.amount) || 0;
        if (p.method === 'cash' && changeLeft > 0) {
          const deduct = Math.min(amt, changeLeft);
          amt -= deduct;
          changeLeft -= deduct;
        }
        byMethod[p.method] = round2(byMethod[p.method] + amt);
      }
    });
  });

  grossRevenue = round2(grossRevenue);
  discounts = round2(discounts);
  netRevenue = round2(netRevenue);
  cogs = round2(cogs);

  const grossProfit = round2(netRevenue - cogs);
  const grossMarginPercent = netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0;

  const operatingExpenses = round2(Math.max(0, Number(params.operatingExpenses) || 0));
  const netProfit = round2(grossProfit - operatingExpenses);
  const netMarginPercent = netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0;

  return {
    salesCount: completed.length,
    grossRevenue,
    discounts,
    netRevenue,
    cogs,
    grossProfit,
    grossMarginPercent,
    operatingExpenses,
    netProfit,
    netMarginPercent,
    byMethod,
  };
}

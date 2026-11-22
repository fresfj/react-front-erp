import type { Dayjs } from 'dayjs';
import type { Sale, PaymentMethod } from 'src/api/firestore/sales';
import type { CashSession } from 'src/api/firestore/cash-sessions';

import { isIsoInPeriodBounds } from 'src/components/period-filter';

// ----------------------------------------------------------------------

export type CashLedgerLineType =
  | 'OPENING'
  | 'SALE'
  | 'SUPPLY'
  | 'WITHDRAWAL'
  | 'RECEIPT'
  | 'PAYMENT';

export type CashLedgerAccountBucket = 'cash_drawer' | 'bank_pix';

export type CashLedgerLine = {
  id: string;
  sessionId: string;
  sessionCode: string;
  type: CashLedgerLineType;
  amount: number;
  signedAmount: number;
  reason: string;
  createdAt: string;
  refType?: 'receivable' | 'payable' | 'sale';
  refId?: string;
  paymentMethod?: PaymentMethod;
  channel?: 'pos' | 'online' | 'table';
  accountBucket?: CashLedgerAccountBucket;
  balanceAfter: number;
};

export type CashLedgerSummary = {
  inflow: number;
  outflow: number;
  net: number;
  previousBalance: number;
  closingBalance: number;
  lineCount: number;
  byMethod: {
    cash: number;
    pix: number;
    debit_card: number;
  };
  byAccount: {
    cash_drawer: number;
    bank_pix: number;
  };
};

export type CashLedgerBounds = { start?: Dayjs | null; end?: Dayjs | null };

export type BuildCashLedgerOptions = {
  sales?: Sale[];
  /** Quando true, OPENING é exibido para auditoria mas não infla Entradas nem Saldo Acumulado. */
  excludeOpeningFromBalance?: boolean;
  /** Filtra o extrato por conta financeira ('all' | 'cash_drawer' | 'bank_pix'). */
  accountFilter?: 'all' | CashLedgerAccountBucket;
};

const OPENING_REASON = 'Abertura de caixa (Fundo de troco)';

const CHANNEL_LABEL: Record<'pos' | 'online' | 'table', string> = {
  pos: 'PDV',
  online: 'Pedido Online',
  table: 'Mesa',
};

const METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'PIX',
  debit_card: 'Cartão Débito',
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function signedForType(type: CashLedgerLineType, amount: number): number {
  if (type === 'WITHDRAWAL' || type === 'PAYMENT') {
    return -Math.abs(amount);
  }
  return Math.abs(amount);
}

function typeRank(type: CashLedgerLineType): number {
  return type === 'OPENING' ? 0 : 1;
}

function inferMovementBucket(reason: string): CashLedgerAccountBucket {
  const lower = reason.toLowerCase();
  if (
    lower.includes('pix') ||
    lower.includes('banco') ||
    lower.includes('cartão') ||
    lower.includes('cartao') ||
    lower.includes('crédito') ||
    lower.includes('débito') ||
    lower.includes('repasse') ||
    lower.includes('transfer')
  ) {
    return 'bank_pix';
  }
  return 'cash_drawer';
}

/**
 * Consolida sessões de caixa + vendas concluídas à vista (Dinheiro líquido de troco, PIX e Débito
 * dos canais PDV, Pedidos Online e Mesas) em um Livro Caixa fiel ao regime de caixa.
 *
 * - Cartão de crédito (`credit_card`) e Fiado (`credit_tab`) NÃO entram na data da venda:
 *   entram apenas quando baixados em Contas a Receber (`RECEIPT`).
 */
export function buildCashLedger(
  sessions: CashSession[],
  bounds?: CashLedgerBounds,
  options?: BuildCashLedgerOptions
): { lines: CashLedgerLine[]; summary: CashLedgerSummary } {
  const period = {
    start: bounds?.start ?? null,
    end: bounds?.end ?? null,
  };

  const excludeOpening = options?.excludeOpeningFromBalance === true;
  const accountFilter = options?.accountFilter ?? 'all';
  const sessionCodeMap = new Map<string, string>();
  sessions.forEach((s) => sessionCodeMap.set(s.id, s.code));

  const raw: Omit<CashLedgerLine, 'balanceAfter'>[] = [];

  sessions.forEach((session) => {
    raw.push({
      id: `${session.id}:opening`,
      sessionId: session.id,
      sessionCode: session.code,
      type: 'OPENING',
      amount: Math.abs(session.openingBalance),
      signedAmount: excludeOpening ? 0 : signedForType('OPENING', session.openingBalance),
      reason: OPENING_REASON,
      createdAt: session.openedAt,
      accountBucket: 'cash_drawer',
    });

    session.movements.forEach((m) => {
      const type = m.type as CashLedgerLineType;
      const reason = m.reason || '';
      raw.push({
        id: `${session.id}:${m.id}`,
        sessionId: session.id,
        sessionCode: session.code,
        type,
        amount: Math.abs(m.amount),
        signedAmount: signedForType(type, m.amount),
        reason,
        createdAt: m.createdAt,
        refType: m.refType,
        refId: m.refId,
        accountBucket: inferMovementBucket(reason),
      });
    });
  });

  // Consolidação de vendas concluídas (regime de caixa: Dinheiro líquido, PIX e Débito)
  const sales = options?.sales ?? [];
  sales
    .filter((s) => s.status === 'completed')
    .forEach((sale) => {
      const channel: 'pos' | 'online' | 'table' =
        sale.channel === 'online' || sale.channel === 'table' ? sale.channel : 'pos';
      const sessionId = sale.cashSessionId || 'no-session';
      const sessionCode = sessionCodeMap.get(sessionId) || CHANNEL_LABEL[channel];
      let changeLeft = Math.max(0, Number(sale.changeAmount) || 0);

      (sale.payments || []).forEach((p, idx) => {
        if (p.method !== 'cash' && p.method !== 'pix' && p.method !== 'debit_card') {
          // credit_card, credit_tab e store_credit não entram na data da venda (regime de caixa)
          return;
        }
        let netAmt = Number(p.amount) || 0;
        if (p.method === 'cash' && changeLeft > 0) {
          const deduct = Math.min(netAmt, changeLeft);
          netAmt = round2(netAmt - deduct);
          changeLeft = round2(changeLeft - deduct);
        }
        if (netAmt <= 0) return;

        const bucket: CashLedgerAccountBucket = p.method === 'cash' ? 'cash_drawer' : 'bank_pix';
        const customerSuffix = sale.customerName ? ` • ${sale.customerName}` : '';
        raw.push({
          id: `sale:${sale.id}:${idx}`,
          sessionId,
          sessionCode,
          type: 'SALE',
          amount: netAmt,
          signedAmount: netAmt,
          reason: `Venda ${CHANNEL_LABEL[channel]} #${sale.code} (${METHOD_LABEL[p.method]})${customerSuffix}`,
          createdAt: sale.createdAt,
          refType: 'sale',
          refId: sale.id,
          paymentMethod: p.method,
          channel,
          accountBucket: bucket,
        });
      });
    });

  const bucketFiltered =
    accountFilter === 'all' ? raw : raw.filter((line) => line.accountBucket === accountFilter);

  // Calcula saldo anterior (lançamentos anteriores a period.start)
  let previousBalance = 0;
  if (period.start) {
    const startMs = period.start.startOf('day').valueOf();
    bucketFiltered.forEach((line) => {
      const t = Date.parse(line.createdAt);
      if (Number.isFinite(t) && t < startMs) {
        previousBalance = round2(previousBalance + line.signedAmount);
      }
    });
  }

  const filtered = bucketFiltered.filter((line) => isIsoInPeriodBounds(line.createdAt, period));

  filtered.sort((a, b) => {
    const ta = a.createdAt;
    const tb = b.createdAt;
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (a.sessionId !== b.sessionId) return a.sessionId < b.sessionId ? -1 : 1;
    return typeRank(a.type) - typeRank(b.type);
  });

  let running = previousBalance;
  let inflow = 0;
  let outflow = 0;
  const byMethod = { cash: 0, pix: 0, debit_card: 0 };
  const byAccount = { cash_drawer: 0, bank_pix: 0 };

  const lines: CashLedgerLine[] = filtered.map((line) => {
    running = round2(running + line.signedAmount);
    if (line.signedAmount > 0) inflow = round2(inflow + line.signedAmount);
    if (line.signedAmount < 0) outflow = round2(outflow + Math.abs(line.signedAmount));
    if (line.type === 'SALE' && line.paymentMethod && line.paymentMethod in byMethod) {
      const m = line.paymentMethod as keyof typeof byMethod;
      byMethod[m] = round2(byMethod[m] + line.amount);
    }
    if (line.accountBucket === 'bank_pix') {
      byAccount.bank_pix = round2(byAccount.bank_pix + line.signedAmount);
    } else if (line.accountBucket === 'cash_drawer') {
      byAccount.cash_drawer = round2(byAccount.cash_drawer + line.signedAmount);
    }
    return { ...line, balanceAfter: running };
  });

  return {
    lines,
    summary: {
      inflow,
      outflow,
      net: round2(inflow - outflow),
      previousBalance,
      closingBalance: running,
      lineCount: lines.length,
      byMethod,
      byAccount,
    },
  };
}

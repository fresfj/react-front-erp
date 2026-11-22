import type { Sale } from 'src/api/firestore/sales';
import type { CashSession } from 'src/api/firestore/cash-sessions';

import dayjs from 'dayjs';
import { it, expect, describe } from 'vitest';

import { buildAccrualDre } from '../accrual-dre';
import { buildCashLedger } from '../cash-ledger';
import {
  calculateMethodDifferences,
  calculateCashSessionExpected,
} from '../cash-calculator';
import {
  parseOfxStatement,
  parseCsvStatement,
  findAutoReconciliationMatches,
} from '../bank-reconciliation';

import type { BankStatementEntry } from '../bank-reconciliation';

function makeSale(partial: Partial<Sale>): Sale {
  return {
    id: 'sale-1',
    code: 'V-001',
    items: [],
    subtotal: 100,
    discountAmount: 0,
    discountPercent: 0,
    total: 100,
    totalCost: 40,
    grossProfit: 60,
    payments: [{ method: 'cash', amount: 100 }],
    paidAmount: 100,
    changeAmount: 0,
    status: 'completed',
    channel: 'pos',
    createdAt: '2026-11-20T14:00:00.000Z',
    updatedAt: '2026-11-20T14:00:00.000Z',
    ...partial,
  };
}

function makeSession(partial?: Partial<CashSession>): CashSession {
  return {
    id: 'sess-1',
    code: 'CX-001',
    status: 'open',
    openedAt: '2026-11-20T08:00:00.000Z',
    openingBalance: 200,
    movements: [],
    updatedAt: '2026-11-20T08:00:00.000Z',
    ...partial,
  };
}

describe('financial-audit-fixes', () => {
  it('Controle de Caixa inclui RECEIPT e PAYMENT na gaveta e apura divergência digital', () => {
    const res = calculateCashSessionExpected({
      openingBalance: 200,
      movements: [
        { id: 'm1', type: 'SUPPLY', amount: 50, reason: 'Troco', createdAt: '2026-11-20T09:00:00.000Z' },
        { id: 'm2', type: 'RECEIPT', amount: 120, reason: 'Fiado', createdAt: '2026-11-20T10:00:00.000Z' },
        { id: 'm3', type: 'PAYMENT', amount: 70, reason: 'Gelo', createdAt: '2026-11-20T11:00:00.000Z' },
        { id: 'm4', type: 'WITHDRAWAL', amount: 40, reason: 'Sangria', createdAt: '2026-11-20T12:00:00.000Z' },
      ],
      sales: [
        makeSale({
          payments: [{ method: 'cash', amount: 100 }],
          changeAmount: 20,
          total: 80,
        }),
        makeSale({
          id: 'sale-2',
          channel: 'online',
          payments: [{ method: 'pix', amount: 150 }],
          total: 150,
        }),
      ],
    });

    // 200 (abertura) + 80 (cash líq) + 50 (supply) + 120 (receipt) - 40 (withdrawal) - 70 (payment) = 340
    expect(res.netCashSales).toBe(80);
    expect(res.totalReceipts).toBe(120);
    expect(res.totalPayments).toBe(70);
    expect(res.expectedDrawerCash).toBe(340);
    expect(res.expectedTotals.pix).toBe(150);

    const diffs = calculateMethodDifferences(res.expectedTotals, {
      ...res.expectedTotals,
      pix: 140,
    });
    expect(diffs.hasDigitalDivergence).toBe(true);
    expect(diffs.pix).toBe(-10);
  });

  it('DRE fecha equação com entrega/serviço e não gera lucro fantasma quando taxa é repassada', () => {
    const dre = buildAccrualDre({
      sales: [
        makeSale({
          subtotal: 100,
          discountAmount: 0,
          deliveryFee: 15,
          surchargeAmount: 5,
          total: 120,
          totalCost: 40,
          feesPassedToCustomer: true,
          paymentFeeAmount: 5,
        }),
      ],
      payables: [],
      bounds: { start: null, end: null },
    });

    expect(dre.grossRevenue).toBe(100);
    expect(dre.deliveryAndServiceFees).toBe(20);
    expect(dre.netRevenue).toBe(120);
    expect(dre.paymentFees).toBe(5);
    // Lucro Bruto = 120 - 40 = 80; Lucro Líquido = 80 - 5 (taxa operadora) = 75 (não 80!)
    expect(dre.grossProfit).toBe(80);
    expect(dre.netProfit).toBe(75);
  });

  it('Livro Caixa consolida PDV + Online + Mesas (regime de caixa), exclui credit_card/credit_tab e não infla OPENING', () => {
    const session = makeSession({
      openingBalance: 200,
      movements: [],
    });
    const sales = [
      makeSale({
        id: 's-cash',
        code: 'V-1',
        channel: 'pos',
        payments: [{ method: 'cash', amount: 50 }],
        changeAmount: 10,
        total: 40,
      }),
      makeSale({
        id: 's-pix',
        code: 'V-2',
        channel: 'online',
        payments: [{ method: 'pix', amount: 89.9 }],
        total: 89.9,
      }),
      makeSale({
        id: 's-debit',
        code: 'V-3',
        channel: 'table',
        payments: [{ method: 'debit_card', amount: 60 }],
        total: 60,
      }),
      makeSale({
        id: 's-credit',
        code: 'V-4',
        channel: 'pos',
        payments: [{ method: 'credit_card', amount: 200 }],
        total: 200,
      }),
      makeSale({
        id: 's-tab',
        code: 'V-5',
        channel: 'pos',
        payments: [{ method: 'credit_tab', amount: 75 }],
        total: 75,
      }),
    ];

    const { summary } = buildCashLedger(
      [session],
      { start: dayjs('2026-11-01'), end: dayjs('2026-11-30') },
      { sales, excludeOpeningFromBalance: true }
    );

    expect(summary.byMethod.cash).toBe(40);
    expect(summary.byMethod.pix).toBe(89.9);
    expect(summary.byMethod.debit_card).toBe(60);
    // 40 + 89.9 + 60 = 189.90 (sem os R$ 200 de OPENING, sem credit_card e sem credit_tab!)
    expect(summary.inflow).toBe(189.9);
    expect(summary.closingBalance).toBe(189.9);
  });

  it('Conciliação Bancária faz parse de OFX e CSV e encontra match automático com PIX do Livro Caixa', () => {
    const ofx = `
      <OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
        <STMTTRN>
          <TRNTYPE>CREDIT
          <DTPOSTED>20261120140500[-3:BRT]
          <TRNAMT>89.90
          <FITID>PIX-001
          <MEMO>PIX RECEBIDO FRANCISCO
        </STMTTRN>
      </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
    `;
    const ofxRows = parseOfxStatement(ofx);
    expect(ofxRows).toHaveLength(1);
    expect(ofxRows[0]).toMatchObject({
      fitid: 'PIX-001',
      date: '2026-11-20',
      amount: 89.9,
    });

    const csv = `Data;Descrição;Valor\n20/11/2026;Tarifa Bancária;-19,90`;
    const csvRows = parseCsvStatement(csv);
    expect(csvRows).toHaveLength(1);
    expect(csvRows[0]).toMatchObject({
      date: '2026-11-20',
      amount: -19.9,
    });

    const ledger = buildCashLedger(
      [makeSession()],
      undefined,
      {
        sales: [
          makeSale({
            id: 's-pix',
            code: 'V-2',
            channel: 'online',
            payments: [{ method: 'pix', amount: 89.9 }],
            total: 89.9,
          }),
        ],
        excludeOpeningFromBalance: true,
        accountFilter: 'bank_pix',
      }
    );

    const bankEntries: BankStatementEntry[] = [
      {
        id: 'b-1',
        fitid: 'PIX-001',
        date: '2026-11-20',
        amount: 89.9,
        memo: 'PIX RECEBIDO FRANCISCO',
        status: 'pending',
        createdAt: '2026-11-20T15:00:00.000Z',
      },
    ];

    const matches = findAutoReconciliationMatches(bankEntries, ledger.lines, 2);
    expect(matches.get('b-1')?.ledgerLine.id).toBe('sale:s-pix:0');
    expect(matches.get('b-1')?.daysDiff).toBe(0);
  });
});

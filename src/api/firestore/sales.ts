import type { PaymentMethod } from 'src/sections/pos/pos-calculator';

import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

import {
  splitInstallments,
  buildInstallmentDueDates,
} from 'src/sections/cash/installments';

import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';

export type { PaymentMethod };

// ----------------------------------------------------------------------

export type SalePayment = {
  method: PaymentMethod;
  amount: number;
  installments?: number;
  feeRate?: number;
  feeAmount?: number;
};

export type DeliveryType = 'pickup' | 'delivery';

export type SaleItem = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  batchId?: string;
  lotCode?: string;
  batchCurrentRemaining?: number;
};

export type SaleStatus = 'completed' | 'cancelled';

export type Sale = {
  id: string;
  code: string;
  customerId?: string;
  customerName?: string;
  customerDocument?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  sellerUid?: string;
  sellerEmail?: string;
  items: Omit<SaleItem, 'batchCurrentRemaining'>[];
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  totalCost: number;
  grossProfit: number;
  payments: SalePayment[];
  paidAmount: number;
  changeAmount: number;
  deliveryType?: DeliveryType;
  deliveryAddress?: string;
  deliveryFee?: number;
  paymentFeeAmount?: number;
  feesPassedToCustomer?: boolean;
  surchargeAmount?: number;
  notes?: string;
  channel?: 'pos' | 'online' | 'table';
  onlineOrderId?: string;
  tableId?: string;
  tableNumber?: string;
  tableSessionId?: string;
  cashSessionId?: string;
  nfceStatus?: 'pending' | 'authorized' | 'cancelled';
  nfceNumber?: string;
  nfceKey?: string;
  nfceProtocol?: string;
  nfceIssuedAt?: string;
  lastEmailSentTo?: string;
  lastEmailSentAt?: string;
  status: SaleStatus;
  createdAt: string;
  updatedAt: string;
};

function saleRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'sales'), id);
}

function nowIso(): string {
  return new Date().toISOString();
}

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

function mapSaleItem(raw: Record<string, unknown>): Omit<SaleItem, 'batchCurrentRemaining'> {
  return {
    productId: String(raw.productId ?? ''),
    productName: String(raw.productName ?? ''),
    productSku: String(raw.productSku ?? ''),
    unit: String(raw.unit ?? ''),
    qty: Number(raw.qty ?? 0),
    unitPrice: Number(raw.unitPrice ?? 0),
    unitCost: Number(raw.unitCost ?? 0),
    lineTotal: Number(raw.lineTotal ?? 0),
    batchId: optStr(raw.batchId),
    lotCode: optStr(raw.lotCode),
  };
}

function mapSalePayment(raw: Record<string, unknown>): SalePayment {
  return {
    method: (raw.method as PaymentMethod) || 'cash',
    amount: Number(raw.amount ?? 0),
    installments: raw.installments != null ? Number(raw.installments) : undefined,
    feeRate: raw.feeRate != null ? Number(raw.feeRate) : undefined,
    feeAmount: raw.feeAmount != null ? Number(raw.feeAmount) : undefined,
  };
}

function mapSale(id: string, data: Record<string, unknown>): Sale {
  const status: SaleStatus = data.status === 'cancelled' ? 'cancelled' : 'completed';
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const rawPayments = Array.isArray(data.payments) ? data.payments : [];

  return {
    id,
    code: String(data.code ?? ''),
    customerId: optStr(data.customerId),
    customerName: optStr(data.customerName),
    customerDocument: optStr(data.customerDocument),
    customerPhone: optStr(data.customerPhone),
    customerEmail: optStr(data.customerEmail),
    customerAddress: optStr(data.customerAddress),
    sellerUid: optStr(data.sellerUid),
    sellerEmail: optStr(data.sellerEmail),
    items: rawItems.map((i) => mapSaleItem(i as Record<string, unknown>)),
    subtotal: Number(data.subtotal ?? 0),
    discountAmount: Number(data.discountAmount ?? 0),
    discountPercent: Number(data.discountPercent ?? 0),
    total: Number(data.total ?? 0),
    totalCost: Number(data.totalCost ?? 0),
    grossProfit: Number(data.grossProfit ?? 0),
    payments: rawPayments.map((p) => mapSalePayment(p as Record<string, unknown>)),
    paidAmount: Number(data.paidAmount ?? 0),
    changeAmount: Number(data.changeAmount ?? 0),
    deliveryType: data.deliveryType === 'delivery' ? 'delivery' : 'pickup',
    deliveryAddress: optStr(data.deliveryAddress),
    deliveryFee: data.deliveryFee != null ? Number(data.deliveryFee) : 0,
    paymentFeeAmount: data.paymentFeeAmount != null ? Number(data.paymentFeeAmount) : 0,
    feesPassedToCustomer: Boolean(data.feesPassedToCustomer),
    surchargeAmount: data.surchargeAmount != null ? Number(data.surchargeAmount) : 0,
    notes: optStr(data.notes),
    channel:
      data.channel === 'online'
        ? 'online'
        : data.channel === 'table'
          ? 'table'
          : 'pos',
    onlineOrderId: optStr(data.onlineOrderId),
    tableId: optStr(data.tableId),
    tableNumber: optStr(data.tableNumber),
    tableSessionId: optStr(data.tableSessionId),
    cashSessionId: optStr(data.cashSessionId),
    nfceStatus:
      data.nfceStatus === 'authorized' || data.nfceStatus === 'cancelled'
        ? data.nfceStatus
        : 'pending',
    nfceNumber: optStr(data.nfceNumber),
    nfceKey: optStr(data.nfceKey),
    nfceProtocol: optStr(data.nfceProtocol),
    nfceIssuedAt: optStr(data.nfceIssuedAt),
    lastEmailSentTo: optStr(data.lastEmailSentTo),
    lastEmailSentAt: optStr(data.lastEmailSentAt),
    status,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

// ----------------------------------------------------------------------

export async function listSales(enterpriseId: string): Promise<Sale[]> {
  const col = enterpriseCollection(enterpriseId, 'sales');
  const snap = await getDocs(col);
  const rows = snap.docs.map((d) => mapSale(d.id, d.data() as Record<string, unknown>));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSale(enterpriseId: string, id: string): Promise<Sale | null> {
  const snap = await getDoc(saleRef(enterpriseId, id));
  if (!snap.exists()) return null;
  return mapSale(snap.id, snap.data() as Record<string, unknown>);
}

export type CreateSaleInput = {
  code: string;
  customerId?: string;
  customerName?: string;
  customerDocument?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerCurrentDebt?: number;
  creditTabAmount?: number;
  sellerUid?: string;
  sellerEmail?: string;
  items: SaleItem[];
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  totalCost: number;
  grossProfit: number;
  payments: SalePayment[];
  paidAmount: number;
  changeAmount: number;
  deliveryType?: DeliveryType;
  deliveryAddress?: string;
  deliveryFee?: number;
  paymentFeeAmount?: number;
  feesPassedToCustomer?: boolean;
  surchargeAmount?: number;
  notes?: string;
  channel?: 'pos' | 'online' | 'table';
  onlineOrderId?: string;
  tableId?: string;
  tableNumber?: string;
  tableSessionId?: string;
  cashSessionId?: string;
};

/**
 * Registra uma venda de forma atômica (offline-ready via writeBatch):
 * 1. Cria o documento em `sales`
 * 2. Deduz o `remainingQty` do lote (`batches`) de cada item rastreado
 * 3. Registra movimentação `OUT` em `stockMovements` para cada item vendido
 * 4. Se houver pagamento em Crediário/Fiado (`credit_tab`) e cliente vinculado, incrementa `currentDebt` do cliente.
 */
export async function createSale(enterpriseId: string, input: CreateSaleInput): Promise<string> {
  const timestamp = nowIso();
  const salesCol = enterpriseCollection(enterpriseId, 'sales');
  const batchesCol = enterpriseCollection(enterpriseId, 'batches');
  const movementsCol = enterpriseCollection(enterpriseId, 'stockMovements');
  const customersCol = enterpriseCollection(enterpriseId, 'customers');

  const newSaleRef = doc(salesCol);
  const wb = writeBatch(FIRESTORE);

  const persistedItems: Omit<SaleItem, 'batchCurrentRemaining'>[] = input.items.map((item) => {
    const movRef = doc(movementsCol);

    wb.set(
      movRef,
      omitUndefined({
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        unit: item.unit,
        batchId: item.batchId,
        lotCode: item.lotCode,
        type: 'OUT',
        qty: item.qty,
        unitCost: item.unitCost,
        reason: `Sale ${input.code}`,
        refId: newSaleRef.id,
        createdBy: input.sellerUid,
        createdAt: timestamp,
      })
    );

    if (item.batchId && typeof item.batchCurrentRemaining === 'number') {
      const nextRemaining = Math.max(0, item.batchCurrentRemaining - item.qty);
      wb.update(doc(batchesCol, item.batchId), {
        remainingQty: nextRemaining,
        updatedAt: timestamp,
      });
    }

    return omitUndefined({
      ...item,
      batchCurrentRemaining: undefined,
    }) as Omit<SaleItem, 'batchCurrentRemaining'>;
  });

  if (input.customerId && input.creditTabAmount && input.creditTabAmount > 0) {
    const currentDebt = Number(input.customerCurrentDebt ?? 0);
    const nextDebt = Math.round((currentDebt + input.creditTabAmount) * 100) / 100;
    wb.update(doc(customersCol, input.customerId), {
      currentDebt: nextDebt,
      updatedAt: timestamp,
    });

    const receivablesCol = enterpriseCollection(enterpriseId, 'receivables');
    const creditTabPayment = input.payments.find((p) => p.method === 'credit_tab');
    const tabCount =
      creditTabPayment?.installments && creditTabPayment.installments > 1
        ? creditTabPayment.installments
        : 1;

    const amounts = splitInstallments(input.creditTabAmount, tabCount);
    const startYmd = timestamp.slice(0, 10);
    const dueDates = buildInstallmentDueDates(startYmd, 'monthly', tabCount);

    for (let i = 0; i < tabCount; i += 1) {
      const recRef = doc(receivablesCol);
      const singleDue = new Date();
      singleDue.setDate(singleDue.getDate() + 30);
      const dueDate = tabCount === 1 ? singleDue.toISOString().slice(0, 10) : dueDates[i];

      wb.set(
        recRef,
        omitUndefined({
          description:
            tabCount > 1
              ? `Venda #${input.code} - Crediário / Fiado (${i + 1}/${tabCount})`
              : `Venda #${input.code} - Crediário / Fiado`,
          category: 'other',
          amount: amounts[i],
          startDate: startYmd,
          dueDate,
          customerId: input.customerId,
          customerName: input.customerName || 'Cliente balcão',
          recurrence: 'none',
          installmentIndex: i + 1,
          installmentCount: tabCount,
          status: 'open',
          active: true,
          refType: 'sale',
          refId: newSaleRef.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      );
    }
  }

  // Se houver pagamento via Cartão de Crédito, gerar promessas de recebimento (repasses futuros D+30, D+60...)
  const ccPayment = input.payments.find((p) => p.method === 'credit_card');
  if (ccPayment && ccPayment.amount > 0) {
    const receivablesCol = enterpriseCollection(enterpriseId, 'receivables');
    const ccCount =
      ccPayment.installments && ccPayment.installments > 1 ? ccPayment.installments : 1;
    const ccAmounts = splitInstallments(ccPayment.amount, ccCount);
    const startYmd = timestamp.slice(0, 10);
    const dueDates = buildInstallmentDueDates(startYmd, 'monthly', ccCount);

    for (let i = 0; i < ccCount; i += 1) {
      const recRef = doc(receivablesCol);
      const singleDue = new Date();
      singleDue.setDate(singleDue.getDate() + 30);
      const dueDate = ccCount === 1 ? singleDue.toISOString().slice(0, 10) : dueDates[i];

      wb.set(
        recRef,
        omitUndefined({
          description:
            ccCount > 1
              ? `Repasse Cartão de Crédito - Venda #${input.code} (${i + 1}/${ccCount})`
              : `Repasse Cartão de Crédito - Venda #${input.code}`,
          category: 'other',
          amount: ccAmounts[i],
          startDate: startYmd,
          dueDate,
          customerId: input.customerId,
          customerName: input.customerName || 'Cliente balcão',
          recurrence: 'none',
          installmentIndex: i + 1,
          installmentCount: ccCount,
          status: 'open',
          active: true,
          refType: 'credit_card',
          refId: newSaleRef.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      );
    }
  }

  wb.set(
    newSaleRef,
    omitUndefined({
      code: input.code,
      customerId: input.customerId,
      customerName: input.customerName,
      customerDocument: input.customerDocument,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail,
      customerAddress: input.customerAddress,
      sellerUid: input.sellerUid,
      sellerEmail: input.sellerEmail,
      items: persistedItems,
      subtotal: input.subtotal,
      discountAmount: input.discountAmount,
      discountPercent: input.discountPercent,
      total: input.total,
      totalCost: input.totalCost,
      grossProfit: input.grossProfit,
      payments: input.payments.map((p) =>
        omitUndefined({
          method: p.method,
          amount: p.amount,
          installments: p.installments,
          feeRate: p.feeRate,
          feeAmount: p.feeAmount,
        })
      ),
      paidAmount: input.paidAmount,
      changeAmount: input.changeAmount,
      deliveryType: input.deliveryType || 'pickup',
      deliveryAddress: input.deliveryAddress,
      deliveryFee: input.deliveryFee || 0,
      paymentFeeAmount: input.paymentFeeAmount || 0,
      feesPassedToCustomer: Boolean(input.feesPassedToCustomer),
      surchargeAmount: input.surchargeAmount || 0,
      notes: input.notes,
      channel: input.channel || 'pos',
      onlineOrderId: input.onlineOrderId,
      cashSessionId: input.cashSessionId,
      status: 'completed',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  );

  await wb.commit();
  return newSaleRef.id;
}

export async function cancelSale(enterpriseId: string, sale: Sale): Promise<void> {
  const timestamp = nowIso();
  const movementsCol = enterpriseCollection(enterpriseId, 'stockMovements');
  const wb = writeBatch(FIRESTORE);

  wb.update(saleRef(enterpriseId, sale.id), {
    status: 'cancelled',
    updatedAt: timestamp,
  });

  sale.items.forEach((item) => {
    const movRef = doc(movementsCol);
    wb.set(
      movRef,
      omitUndefined({
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        unit: item.unit,
        batchId: item.batchId,
        lotCode: item.lotCode,
        type: 'IN',
        qty: item.qty,
        unitCost: item.unitCost,
        reason: `Sale Cancelled ${sale.code}`,
        refId: sale.id,
        createdAt: timestamp,
      })
    );
  });

  await wb.commit();
}

function randomDigits(len: number): string {
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += String(Math.floor(Math.random() * 10));
  }
  return out;
}

/**
 * Fase 5 — Emissão de NFC-e (DANFE NFC-e / Cupom Fiscal Eletrônico)
 */
export async function issueSaleNfce(enterpriseId: string, sale: Sale): Promise<{
  nfceNumber: string;
  nfceKey: string;
  nfceProtocol: string;
  nfceIssuedAt: string;
}> {
  const timestamp = nowIso();
  const nfceNumber = String(Math.floor(100000 + Math.random() * 900000));
  const nfceKey = `152611${randomDigits(38)}`; // 44 dígitos padrão SEFAZ
  const nfceProtocol = `11526${randomDigits(10)}`;

  await updateDoc(saleRef(enterpriseId, sale.id), {
    nfceStatus: 'authorized',
    nfceNumber,
    nfceKey,
    nfceProtocol,
    nfceIssuedAt: timestamp,
    updatedAt: timestamp,
  });

  return { nfceNumber, nfceKey, nfceProtocol, nfceIssuedAt: timestamp };
}

export async function recordSaleEmailSent(
  enterpriseId: string,
  saleId: string,
  email: string
): Promise<void> {
  const timestamp = nowIso();
  await updateDoc(saleRef(enterpriseId, saleId), {
    lastEmailSentTo: email.trim(),
    lastEmailSentAt: timestamp,
    updatedAt: timestamp,
  });
}

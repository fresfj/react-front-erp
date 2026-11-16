import {
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';

// ----------------------------------------------------------------------

export type ProcessingOutputItem = {
  productId: string;
  productName: string;
  productSku: string;
  variant?: string;
  unit: string;
  qty: number;
  weightFactor: number;
  allocatedTotalCost: number;
  allocatedUnitCost: number;
  batchId: string;
  lotCode: string;
};

export type ProcessingOrderStatus = 'completed' | 'cancelled';

export type ProcessingOrder = {
  id: string;
  code: string;
  rawProductId: string;
  rawProductName: string;
  rawProductSku: string;
  rawUnit: string;
  rawBatchId?: string;
  rawLotCode?: string;
  rawBatchRemainingAfter?: number;
  supplierId?: string;
  supplierName?: string;
  rawQtyUsed: number;
  rawUnitCost: number;
  rawTotalCost: number;
  extraCost: number;
  totalCost: number;
  totalOutputQty: number;
  outputs: ProcessingOutputItem[];
  notes?: string;
  status: ProcessingOrderStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

function orderRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'processingOrders'), id);
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapOutputItem(raw: Record<string, unknown>): ProcessingOutputItem {
  return {
    productId: String(raw.productId ?? ''),
    productName: String(raw.productName ?? ''),
    productSku: String(raw.productSku ?? ''),
    variant: raw.variant != null ? String(raw.variant) : undefined,
    unit: String(raw.unit ?? ''),
    qty: Number(raw.qty ?? 0),
    weightFactor: Number(raw.weightFactor ?? 1),
    allocatedTotalCost: Number(raw.allocatedTotalCost ?? 0),
    allocatedUnitCost: Number(raw.allocatedUnitCost ?? 0),
    batchId: String(raw.batchId ?? ''),
    lotCode: String(raw.lotCode ?? ''),
  };
}

function mapProcessingOrder(id: string, data: Record<string, unknown>): ProcessingOrder {
  const status: ProcessingOrderStatus = data.status === 'cancelled' ? 'cancelled' : 'completed';
  const rawOutputs = Array.isArray(data.outputs) ? data.outputs : [];

  return {
    id,
    code: String(data.code ?? ''),
    rawProductId: String(data.rawProductId ?? ''),
    rawProductName: String(data.rawProductName ?? ''),
    rawProductSku: String(data.rawProductSku ?? ''),
    rawUnit: String(data.rawUnit ?? ''),
    rawBatchId: data.rawBatchId != null ? String(data.rawBatchId) : undefined,
    rawLotCode: data.rawLotCode != null ? String(data.rawLotCode) : undefined,
    supplierId: data.supplierId != null ? String(data.supplierId) : undefined,
    supplierName: data.supplierName != null ? String(data.supplierName) : undefined,
    rawQtyUsed: Number(data.rawQtyUsed ?? 0),
    rawUnitCost: Number(data.rawUnitCost ?? 0),
    rawTotalCost: Number(data.rawTotalCost ?? 0),
    extraCost: Number(data.extraCost ?? 0),
    totalCost: Number(data.totalCost ?? 0),
    totalOutputQty: Number(data.totalOutputQty ?? 0),
    outputs: rawOutputs.map((item) => mapOutputItem(item as Record<string, unknown>)),
    notes: data.notes != null ? String(data.notes) : undefined,
    status,
    createdBy: data.createdBy != null ? String(data.createdBy) : undefined,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

// ----------------------------------------------------------------------

export async function listProcessingOrders(enterpriseId: string): Promise<ProcessingOrder[]> {
  const col = enterpriseCollection(enterpriseId, 'processingOrders');
  const snap = await getDocs(col);
  const rows = snap.docs.map((d) => mapProcessingOrder(d.id, d.data() as Record<string, unknown>));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProcessingOrder(
  enterpriseId: string,
  id: string
): Promise<ProcessingOrder | null> {
  const snap = await getDoc(orderRef(enterpriseId, id));
  if (!snap.exists()) return null;
  return mapProcessingOrder(snap.id, snap.data() as Record<string, unknown>);
}

export type CreateProcessingOrderInput = {
  code: string;
  rawProductId: string;
  rawProductName: string;
  rawProductSku: string;
  rawUnit: string;
  rawBatchId?: string;
  rawLotCode?: string;
  rawBatchCurrentRemaining?: number;
  supplierId?: string;
  supplierName?: string;
  rawQtyUsed: number;
  rawUnitCost: number;
  rawTotalCost: number;
  extraCost: number;
  totalCost: number;
  totalOutputQty: number;
  outputs: Omit<ProcessingOutputItem, 'batchId'>[];
  notes?: string;
  createdBy?: string;
};

/**
 * Grava de forma atômica (writeBatch):
 * 1. Ordem de Beneficiamento (`processingOrders`)
 * 2. Baixa do lote de matéria-prima (`batches` se selecionado) + movimentação `PROCESSING_OUT`
 * 3. Criação dos lotes de produtos acabados (`batches`) + movimentações `PROCESSING_IN`
 * 4. Atualização do `costPrice` de cada produto acabado com o `allocatedUnitCost` (CMV).
 */
export async function createProcessingOrder(
  enterpriseId: string,
  input: CreateProcessingOrderInput
): Promise<string> {
  const timestamp = nowIso();
  const ordersCol = enterpriseCollection(enterpriseId, 'processingOrders');
  const batchesCol = enterpriseCollection(enterpriseId, 'batches');
  const movementsCol = enterpriseCollection(enterpriseId, 'stockMovements');
  const productsCol = enterpriseCollection(enterpriseId, 'products');

  const newOrderRef = doc(ordersCol);
  const wb = writeBatch(FIRESTORE);

  // 1. Movimentação de saída do insumo (matéria-prima)
  const rawOutMovRef = doc(movementsCol);
  wb.set(
    rawOutMovRef,
    omitUndefined({
      productId: input.rawProductId,
      productName: input.rawProductName,
      productSku: input.rawProductSku,
      unit: input.rawUnit,
      batchId: input.rawBatchId,
      lotCode: input.rawLotCode,
      type: 'PROCESSING_OUT',
      qty: input.rawQtyUsed,
      unitCost: input.rawUnitCost,
      reason: `Processing Order ${input.code}`,
      refId: newOrderRef.id,
      createdBy: input.createdBy,
      createdAt: timestamp,
    })
  );

  // Se selecionou lote de insumo, deduz o saldo restante do lote
  if (input.rawBatchId && typeof input.rawBatchCurrentRemaining === 'number') {
    const rawBatchDocRef = doc(batchesCol, input.rawBatchId);
    const nextRemaining = Math.max(0, input.rawBatchCurrentRemaining - input.rawQtyUsed);
    wb.update(rawBatchDocRef, {
      remainingQty: nextRemaining,
      updatedAt: timestamp,
    });
  }

  // 2. Criar lotes para cada produto acabado gerado + movimentação PROCESSING_IN + atualizar costPrice
  const outputsWithBatchIds: ProcessingOutputItem[] = input.outputs.map((item) => {
    const outBatchRef = doc(batchesCol);
    const inMovRef = doc(movementsCol);
    const prodRef = doc(productsCol, item.productId);

    wb.set(
      outBatchRef,
      omitUndefined({
        lotCode: item.lotCode,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        productType: 'finished',
        unit: item.unit,
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        processingOrderId: newOrderRef.id,
        processingOrderCode: input.code,
        initialQty: item.qty,
        remainingQty: item.qty,
        unitCost: item.allocatedUnitCost,
        notes: input.notes,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );

    wb.set(
      inMovRef,
      omitUndefined({
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        unit: item.unit,
        batchId: outBatchRef.id,
        lotCode: item.lotCode,
        type: 'PROCESSING_IN',
        qty: item.qty,
        unitCost: item.allocatedUnitCost,
        reason: `Processing Order ${input.code}`,
        refId: newOrderRef.id,
        createdBy: input.createdBy,
        createdAt: timestamp,
      })
    );

    wb.update(prodRef, {
      costPrice: item.allocatedUnitCost,
      updatedAt: timestamp,
    });

    return omitUndefined({
      ...item,
      batchId: outBatchRef.id,
    }) as ProcessingOutputItem;
  });

  // 3. Documento da Ordem de Beneficiamento
  wb.set(
    newOrderRef,
    omitUndefined({
      code: input.code,
      rawProductId: input.rawProductId,
      rawProductName: input.rawProductName,
      rawProductSku: input.rawProductSku,
      rawUnit: input.rawUnit,
      rawBatchId: input.rawBatchId,
      rawLotCode: input.rawLotCode,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      rawQtyUsed: input.rawQtyUsed,
      rawUnitCost: input.rawUnitCost,
      rawTotalCost: input.rawTotalCost,
      extraCost: input.extraCost,
      totalCost: input.totalCost,
      totalOutputQty: input.totalOutputQty,
      outputs: outputsWithBatchIds,
      notes: input.notes,
      status: 'completed',
      createdBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  );

  await wb.commit();
  return newOrderRef.id;
}

export async function cancelProcessingOrder(
  enterpriseId: string,
  order: ProcessingOrder
): Promise<void> {
  const timestamp = nowIso();
  const batchesCol = enterpriseCollection(enterpriseId, 'batches');
  const wb = writeBatch(FIRESTORE);

  wb.update(orderRef(enterpriseId, order.id), {
    status: 'cancelled',
    updatedAt: timestamp,
  });

  order.outputs.forEach((out) => {
    if (out.batchId) {
      wb.update(doc(batchesCol, out.batchId), {
        active: false,
        updatedAt: timestamp,
      });
    }
  });

  await wb.commit();
}

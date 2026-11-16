import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';

import type { ProductType } from './products';

// ----------------------------------------------------------------------

export type Batch = {
  id: string;
  lotCode: string;
  productId: string;
  productName: string;
  productSku: string;
  productType: ProductType;
  unit: string;
  supplierId?: string;
  supplierName?: string;
  processingOrderId?: string;
  processingOrderCode?: string;
  initialQty: number;
  remainingQty: number;
  unitCost: number;
  expiresAt?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function batchRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'batches'), id);
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapBatch(id: string, data: Record<string, unknown>): Batch {
  const productType: ProductType = data.productType === 'finished' ? 'finished' : 'raw';

  return {
    id,
    lotCode: String(data.lotCode ?? ''),
    productId: String(data.productId ?? ''),
    productName: String(data.productName ?? ''),
    productSku: String(data.productSku ?? ''),
    productType,
    unit: String(data.unit ?? ''),
    supplierId: data.supplierId != null ? String(data.supplierId) : undefined,
    supplierName: data.supplierName != null ? String(data.supplierName) : undefined,
    processingOrderId: data.processingOrderId != null ? String(data.processingOrderId) : undefined,
    processingOrderCode:
      data.processingOrderCode != null ? String(data.processingOrderCode) : undefined,
    initialQty: Number(data.initialQty ?? 0),
    remainingQty: Number(data.remainingQty ?? 0),
    unitCost: Number(data.unitCost ?? 0),
    expiresAt: data.expiresAt != null ? String(data.expiresAt) : undefined,
    notes: data.notes != null ? String(data.notes) : undefined,
    active: Boolean(data.active),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

// ----------------------------------------------------------------------

export async function listBatches(enterpriseId: string): Promise<Batch[]> {
  const col = enterpriseCollection(enterpriseId, 'batches');
  const snap = await getDocs(col);
  const rows = snap.docs.map((d) => mapBatch(d.id, d.data() as Record<string, unknown>));
  // Sort FIFO by createdAt ascending by default, or newest first in UI
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Retorna os lotes ativos com saldo disponível (> 0) ordenados por FIFO (createdAt asc)
 * para uso no Beneficiamento (insumos) e no PDV (produtos acabados).
 */
export async function listAvailableBatchesFIFO(
  enterpriseId: string,
  productId?: string
): Promise<Batch[]> {
  const all = await listBatches(enterpriseId);
  return all
    .filter(
      (b) =>
        b.active &&
        b.remainingQty > 0 &&
        (!productId || b.productId === productId)
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getBatch(enterpriseId: string, id: string): Promise<Batch | null> {
  const snap = await getDoc(batchRef(enterpriseId, id));
  if (!snap.exists()) return null;
  return mapBatch(snap.id, snap.data() as Record<string, unknown>);
}

export async function createBatchEntry(
  enterpriseId: string,
  input: {
    lotCode: string;
    productId: string;
    productName: string;
    productSku: string;
    productType: ProductType;
    unit: string;
    supplierId?: string;
    supplierName?: string;
    initialQty: number;
    unitCost: number;
    expiresAt?: string;
    notes?: string;
    createdBy?: string;
  }
): Promise<string> {
  const timestamp = nowIso();
  const batchesCol = enterpriseCollection(enterpriseId, 'batches');
  const movementsCol = enterpriseCollection(enterpriseId, 'stockMovements');
  const productDocRef = doc(enterpriseCollection(enterpriseId, 'products'), input.productId);

  const newBatchRef = doc(batchesCol);
  const newMovementRef = doc(movementsCol);

  const wb = writeBatch(FIRESTORE);

  wb.set(
    newBatchRef,
    omitUndefined({
      lotCode: input.lotCode,
      productId: input.productId,
      productName: input.productName,
      productSku: input.productSku,
      productType: input.productType,
      unit: input.unit,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      initialQty: input.initialQty,
      remainingQty: input.initialQty,
      unitCost: input.unitCost,
      expiresAt: input.expiresAt,
      notes: input.notes,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  );

  wb.set(
    newMovementRef,
    omitUndefined({
      productId: input.productId,
      productName: input.productName,
      productSku: input.productSku,
      unit: input.unit,
      batchId: newBatchRef.id,
      lotCode: input.lotCode,
      type: 'IN',
      qty: input.initialQty,
      unitCost: input.unitCost,
      reason: input.notes || 'Batch entry',
      refId: newBatchRef.id,
      createdBy: input.createdBy,
      createdAt: timestamp,
    })
  );

  if (input.unitCost > 0) {
    wb.update(productDocRef, {
      costPrice: input.unitCost,
      updatedAt: timestamp,
    });
  }

  await wb.commit();
  return newBatchRef.id;
}

export async function deactivateBatch(enterpriseId: string, id: string): Promise<void> {
  await updateDoc(batchRef(enterpriseId, id), {
    active: false,
    updatedAt: nowIso(),
  });
}

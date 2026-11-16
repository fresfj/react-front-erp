import { getDocs } from 'firebase/firestore';

import { enterpriseCollection } from './paths';

// ----------------------------------------------------------------------

export type StockMovementType =
  | 'IN'
  | 'OUT'
  | 'ADJUST'
  | 'PROCESSING_OUT'
  | 'PROCESSING_IN';

export type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  batchId?: string;
  lotCode?: string;
  type: StockMovementType;
  qty: number;
  unitCost?: number;
  reason?: string;
  refId?: string;
  createdBy?: string;
  createdAt: string;
};

function mapStockMovement(id: string, data: Record<string, unknown>): StockMovement {
  const rawType = String(data.type ?? 'IN');
  const validTypes: StockMovementType[] = [
    'IN',
    'OUT',
    'ADJUST',
    'PROCESSING_OUT',
    'PROCESSING_IN',
  ];
  const type: StockMovementType = validTypes.includes(rawType as StockMovementType)
    ? (rawType as StockMovementType)
    : 'IN';

  return {
    id,
    productId: String(data.productId ?? ''),
    productName: String(data.productName ?? ''),
    productSku: String(data.productSku ?? ''),
    unit: String(data.unit ?? ''),
    batchId: data.batchId != null ? String(data.batchId) : undefined,
    lotCode: data.lotCode != null ? String(data.lotCode) : undefined,
    type,
    qty: Number(data.qty ?? 0),
    unitCost: typeof data.unitCost === 'number' ? data.unitCost : undefined,
    reason: data.reason != null ? String(data.reason) : undefined,
    refId: data.refId != null ? String(data.refId) : undefined,
    createdBy: data.createdBy != null ? String(data.createdBy) : undefined,
    createdAt: String(data.createdAt ?? ''),
  };
}

// ----------------------------------------------------------------------

export async function listStockMovements(enterpriseId: string): Promise<StockMovement[]> {
  const col = enterpriseCollection(enterpriseId, 'stockMovements');
  const snap = await getDocs(col);
  const rows = snap.docs.map((d) => mapStockMovement(d.id, d.data() as Record<string, unknown>));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

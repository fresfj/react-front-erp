// ----------------------------------------------------------------------

export type CostAllocationInputItem = {
  productId: string;
  qty: number;
  weightFactor: number;
};

export type CostAllocationResultItem = CostAllocationInputItem & {
  weightedUnits: number;
  shareRatio: number;
  allocatedTotalCost: number;
  allocatedUnitCost: number;
};

export type CostAllocationSummary = {
  rawTotalCost: number;
  extraCost: number;
  totalCost: number;
  totalOutputQty: number;
  totalWeightedUnits: number;
  items: CostAllocationResultItem[];
};

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula o rateio de custo (CMV) proporcional ao volume e ao Fator de Valorização de cada produto gerado.
 */
export function calculateProcessingCostAllocation(params: {
  rawQtyUsed: number;
  rawUnitCost: number;
  extraCost?: number;
  outputs: CostAllocationInputItem[];
}): CostAllocationSummary {
  const rawQty = Math.max(0, Number(params.rawQtyUsed) || 0);
  const rawCost = Math.max(0, Number(params.rawUnitCost) || 0);
  const extra = Math.max(0, Number(params.extraCost) || 0);

  const rawTotalCost = round2(rawQty * rawCost);
  const totalCost = round2(rawTotalCost + extra);

  const validOutputs = params.outputs.map((item) => {
    const qty = Math.max(0, Number(item.qty) || 0);
    const weightFactor = Math.max(0.0001, Number(item.weightFactor) || 1);
    const weightedUnits = qty * weightFactor;
    return {
      ...item,
      qty,
      weightFactor,
      weightedUnits,
    };
  });

  const totalOutputQty = round4(validOutputs.reduce((acc, item) => acc + item.qty, 0));
  const totalWeightedUnits = validOutputs.reduce((acc, item) => acc + item.weightedUnits, 0);

  const items: CostAllocationResultItem[] = validOutputs.map((item) => {
    if (totalWeightedUnits <= 0 || item.qty <= 0) {
      return {
        productId: item.productId,
        qty: item.qty,
        weightFactor: item.weightFactor,
        weightedUnits: 0,
        shareRatio: 0,
        allocatedTotalCost: 0,
        allocatedUnitCost: 0,
      };
    }

    const shareRatio = item.weightedUnits / totalWeightedUnits;
    const allocatedTotalCost = round2(totalCost * shareRatio);
    const allocatedUnitCost = round4( (totalCost * shareRatio) / item.qty );

    return {
      productId: item.productId,
      qty: item.qty,
      weightFactor: item.weightFactor,
      weightedUnits: round4(item.weightedUnits),
      shareRatio: round4(shareRatio),
      allocatedTotalCost,
      allocatedUnitCost,
    };
  });

  return {
    rawTotalCost,
    extraCost: extra,
    totalCost,
    totalOutputQty,
    totalWeightedUnits: round4(totalWeightedUnits),
    items,
  };
}

function formatCompactDate(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function randomSuffix(length = 4): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length)
    .toUpperCase()
    .padEnd(length, '0');
}

export function generateLotCode(prefix = 'LOTE', date: Date = new Date(), suffix?: string): string {
  const cleanPrefix = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'LOTE';
  const codeSuffix = suffix ? suffix.toUpperCase() : randomSuffix(4);
  return `${cleanPrefix}-${formatCompactDate(date)}-${codeSuffix}`;
}

export function generateProcessingOrderCode(date: Date = new Date(), suffix?: string): string {
  const codeSuffix = suffix ? suffix.toUpperCase() : randomSuffix(4);
  return `OB-${formatCompactDate(date)}-${codeSuffix}`;
}

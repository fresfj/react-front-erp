import { it, expect, describe } from 'vitest';

import {
  generateLotCode,
  generateProcessingOrderCode,
  calculateProcessingCostAllocation,
} from './cost-allocation';

describe('calculateProcessingCostAllocation', () => {
  it('allocates cost proportionally to volume when all weightFactors are 1', () => {
    // 100kg of raw açaí at R$ 5.00/kg = R$ 500 + R$ 50 extra = R$ 550 total
    // Output: 30L Fino (factor 1), 40L Médio (factor 1), 10L Grosso (factor 1) = 80L total
    // Unit cost should be 550 / 80 = 6.875 for all
    const result = calculateProcessingCostAllocation({
      rawQtyUsed: 100,
      rawUnitCost: 5,
      extraCost: 50,
      outputs: [
        { productId: 'fino', qty: 30, weightFactor: 1 },
        { productId: 'medio', qty: 40, weightFactor: 1 },
        { productId: 'grosso', qty: 10, weightFactor: 1 },
      ],
    });

    expect(result.rawTotalCost).toBe(500);
    expect(result.extraCost).toBe(50);
    expect(result.totalCost).toBe(550);
    expect(result.totalOutputQty).toBe(80);
    expect(result.items[0].allocatedUnitCost).toBe(6.875);
    expect(result.items[1].allocatedUnitCost).toBe(6.875);
    expect(result.items[2].allocatedUnitCost).toBe(6.875);
  });

  it('allocates higher unit cost to items with higher weightFactor (fator de valorização)', () => {
    // Total cost = R$ 550
    // Fino: 30L * 1.0 = 30 weighted
    // Medio: 40L * 1.25 = 50 weighted
    // Grosso: 10L * 2.0 = 20 weighted
    // Total weighted = 100
    // Fino gets 30% of 550 = 165 -> unit cost = 165 / 30 = 5.50
    // Medio gets 50% of 550 = 275 -> unit cost = 275 / 40 = 6.875
    // Grosso gets 20% of 550 = 110 -> unit cost = 110 / 10 = 11.00
    const result = calculateProcessingCostAllocation({
      rawQtyUsed: 100,
      rawUnitCost: 5,
      extraCost: 50,
      outputs: [
        { productId: 'fino', qty: 30, weightFactor: 1.0 },
        { productId: 'medio', qty: 40, weightFactor: 1.25 },
        { productId: 'grosso', qty: 10, weightFactor: 2.0 },
      ],
    });

    expect(result.totalWeightedUnits).toBe(100);
    expect(result.items[0]).toMatchObject({
      productId: 'fino',
      allocatedTotalCost: 165,
      allocatedUnitCost: 5.5,
    });
    expect(result.items[1]).toMatchObject({
      productId: 'medio',
      allocatedTotalCost: 275,
      allocatedUnitCost: 6.875,
    });
    expect(result.items[2]).toMatchObject({
      productId: 'grosso',
      allocatedTotalCost: 110,
      allocatedUnitCost: 11,
    });
  });

  it('handles zero quantities safely without NaN', () => {
    const result = calculateProcessingCostAllocation({
      rawQtyUsed: 0,
      rawUnitCost: 0,
      extraCost: 0,
      outputs: [{ productId: 'fino', qty: 0, weightFactor: 1 }],
    });

    expect(result.totalCost).toBe(0);
    expect(result.items[0].allocatedUnitCost).toBe(0);
    expect(result.items[0].allocatedTotalCost).toBe(0);
  });
});

describe('code generators', () => {
  it('generates deterministic lot and processing order codes when date and suffix are provided', () => {
    const date = new Date('2026-11-16T12:00:00Z');
    expect(generateLotCode('LOTE', date, '01A')).toBe('LOTE-20261116-01A');
    expect(generateProcessingOrderCode(date, '001')).toBe('OB-20261116-001');
  });
});

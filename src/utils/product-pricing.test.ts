import { it, expect, describe } from 'vitest';

import { getEffectiveProductPrice } from './product-pricing';

// ----------------------------------------------------------------------

describe('getEffectiveProductPrice', () => {
  it('returns basePrice when promoActive is false', () => {
    const res = getEffectiveProductPrice({
      salePrice: 30,
      promoActive: false,
      discountType: 'percent',
      discountValue: 20,
    });
    expect(res.effectivePrice).toBe(30);
    expect(res.hasDiscount).toBe(false);
    expect(res.discountBadge).toBeNull();
  });

  it('applies percentage discount correctly', () => {
    const res = getEffectiveProductPrice({
      salePrice: 28,
      promoActive: true,
      discountType: 'percent',
      discountValue: 15,
    });
    expect(res.basePrice).toBe(28);
    expect(res.discountAmount).toBe(4.2);
    expect(res.effectivePrice).toBe(23.8);
    expect(res.hasDiscount).toBe(true);
    expect(res.discountBadge).toBe('-15%');
  });

  it('applies fixed BRL discount and clamps at zero', () => {
    const res = getEffectiveProductPrice({
      salePrice: 25,
      promoActive: true,
      discountType: 'fixed',
      discountValue: 5,
    });
    expect(res.effectivePrice).toBe(20);
    expect(res.discountBadge).toBe('-R$ 5,00');

    const clamped = getEffectiveProductPrice({
      salePrice: 10,
      promoActive: true,
      discountType: 'fixed',
      discountValue: 50,
    });
    expect(clamped.effectivePrice).toBe(0);
    expect(clamped.discountAmount).toBe(10);
  });
});

export type ProductDiscountType = 'percent' | 'fixed';

export type ProductPricingInput = {
  salePrice?: number;
  promoActive?: boolean;
  discountType?: ProductDiscountType;
  discountValue?: number;
};

export type EffectiveProductPrice = {
  basePrice: number;
  effectivePrice: number;
  hasDiscount: boolean;
  discountAmount: number;
  discountPercent: number;
  discountBadge: string | null;
};

function roundMoney(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function getEffectiveProductPrice(input: ProductPricingInput): EffectiveProductPrice {
  const basePrice = Math.max(0, roundMoney(Number(input.salePrice || 0)));
  const rawDiscount = Math.max(0, Number(input.discountValue || 0));

  if (!input.promoActive || rawDiscount <= 0 || basePrice <= 0) {
    return {
      basePrice,
      effectivePrice: basePrice,
      hasDiscount: false,
      discountAmount: 0,
      discountPercent: 0,
      discountBadge: null,
    };
  }

  const type: ProductDiscountType = input.discountType === 'fixed' ? 'fixed' : 'percent';
  let discountAmount = 0;

  if (type === 'percent') {
    const clampedPct = Math.min(100, rawDiscount);
    discountAmount = roundMoney((basePrice * clampedPct) / 100);
  } else {
    discountAmount = roundMoney(Math.min(basePrice, rawDiscount));
  }

  const effectivePrice = Math.max(0, roundMoney(basePrice - discountAmount));
  const discountPercent =
    basePrice > 0 ? Math.round((discountAmount / basePrice) * 100) : 0;

  const discountBadge =
    type === 'percent'
      ? `-${Math.min(100, Math.round(rawDiscount))}%`
      : `-R$ ${discountAmount.toFixed(2).replace('.', ',')}`;

  return {
    basePrice,
    effectivePrice,
    hasDiscount: discountAmount > 0,
    discountAmount,
    discountPercent,
    discountBadge: discountAmount > 0 ? discountBadge : null,
  };
}

import type {
  PublicStorefront,
  OnlinePayOnDeliveryMethod,
} from 'src/api/firestore/online-orders';

import { PAYMENT_METHOD_BRANDS } from 'src/components/payment-method-icon';

// ----------------------------------------------------------------------

export const CLOSED_REASON_KEY: Record<string, string> = {
  plan: 'publicStore.closed.plan',
  disabled: 'publicStore.closed.disabled',
  outside_hours: 'publicStore.closed.outsideHours',
  no_open_cash: 'publicStore.closed.noOpenCash',
};

export const PAYMENT_METHOD_CONFIG: Record<
  OnlinePayOnDeliveryMethod,
  { label: string; icon: string; imageSrc?: string; color: string; desc: string; brandLogos?: string[] }
> = {
  pix: {
    label: PAYMENT_METHOD_BRANDS.pix.onlineLabel,
    icon: PAYMENT_METHOD_BRANDS.pix.icon,
    color: PAYMENT_METHOD_BRANDS.pix.color,
    desc: PAYMENT_METHOD_BRANDS.pix.onlineDescription,
  },
  credit_card: {
    label: PAYMENT_METHOD_BRANDS.credit_card.onlineLabel,
    icon: PAYMENT_METHOD_BRANDS.credit_card.icon,
    color: PAYMENT_METHOD_BRANDS.credit_card.color,
    desc: PAYMENT_METHOD_BRANDS.credit_card.onlineDescription,
    brandLogos: PAYMENT_METHOD_BRANDS.credit_card.brandLogos,
  },
  debit_card: {
    label: PAYMENT_METHOD_BRANDS.debit_card.onlineLabel,
    icon: PAYMENT_METHOD_BRANDS.debit_card.icon,
    color: PAYMENT_METHOD_BRANDS.debit_card.color,
    desc: PAYMENT_METHOD_BRANDS.debit_card.onlineDescription,
    brandLogos: PAYMENT_METHOD_BRANDS.debit_card.brandLogos,
  },
  cash: {
    label: PAYMENT_METHOD_BRANDS.cash.onlineLabel,
    icon: PAYMENT_METHOD_BRANDS.cash.icon,
    imageSrc: PAYMENT_METHOD_BRANDS.cash.imageSrc,
    color: PAYMENT_METHOD_BRANDS.cash.color,
    desc: PAYMENT_METHOD_BRANDS.cash.onlineDescription,
  },
};

export function getStoreOpenStatus(store: PublicStorefront | null): {
  isOpen: boolean;
  text: string;
} {
  if (!store || !store.isOpen) {
    return { isOpen: false, text: 'Fechado no momento' };
  }
  const today = new Date().getDay();
  const todayHours = store.openingHours?.find((h) => Number(h.day) === today);
  if (todayHours && !todayHours.closed && todayHours.close) {
    const closeFormatted = todayHours.close.replace(':', 'h');
    return { isOpen: true, text: `Aberto até ${closeFormatted}` };
  }
  return { isOpen: true, text: 'Aberto agora' };
}

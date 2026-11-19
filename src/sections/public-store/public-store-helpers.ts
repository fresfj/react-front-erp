import type {
  PublicStorefront,
  OnlinePayOnDeliveryMethod,
} from 'src/api/firestore/online-orders';

// ----------------------------------------------------------------------

export const CLOSED_REASON_KEY: Record<string, string> = {
  plan: 'publicStore.closed.plan',
  disabled: 'publicStore.closed.disabled',
  outside_hours: 'publicStore.closed.outsideHours',
  no_open_cash: 'publicStore.closed.noOpenCash',
};

export const PAYMENT_METHOD_CONFIG: Record<
  OnlinePayOnDeliveryMethod,
  { label: string; icon: string; color: string; desc: string }
> = {
  pix: {
    label: 'Pix na entrega',
    icon: 'solar:qr-code-bold',
    color: '#00BFA5',
    desc: 'Pague com QR Code ou Chave Pix na entrega',
  },
  credit_card: {
    label: 'Cartão de Crédito',
    icon: 'solar:card-bold',
    color: '#7B1FA2',
    desc: 'O entregador levará a maquininha',
  },
  debit_card: {
    label: 'Cartão de Débito',
    icon: 'solar:card-2-bold',
    color: '#1976D2',
    desc: 'O entregador levará a maquininha',
  },
  cash: {
    label: 'Dinheiro',
    icon: 'solar:wad-of-money-bold',
    color: '#2E7D32',
    desc: 'Pagamento em espécie na entrega',
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

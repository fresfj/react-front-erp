import type { Theme, SxProps } from '@mui/material/styles';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

import { CONFIG } from 'src/config-global';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

export type SystemPaymentMethod =
  | 'pix'
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'store_credit'
  | 'credit_tab';

export type PaymentMethodBrandMeta = {
  icon: string;
  imageSrc?: string;
  color: string;
  defaultLabel: string;
  onlineLabel: string;
  description: string;
  onlineDescription: string;
  brandLogos?: string[];
};

export const CASH_ICON_SRC = `${CONFIG.site.basePath}/assets/icons/brands/ic_cash.png`;

export const PAYMENT_METHOD_BRANDS: Record<SystemPaymentMethod, PaymentMethodBrandMeta> = {
  pix: {
    icon: 'thesvg-color:pix',
    color: '#00BFA5',
    defaultLabel: 'PIX',
    onlineLabel: 'Pix na entrega',
    description: 'Transferência instantânea via QR Code ou Chave',
    onlineDescription: 'Pague com QR Code ou Chave Pix na entrega',
  },
  cash: {
    icon: 'solar:wad-of-money-bold-duotone',
    imageSrc: CASH_ICON_SRC,
    color: '#2E7D32',
    defaultLabel: 'Dinheiro',
    onlineLabel: 'Dinheiro',
    description: 'Pagamento em espécie na gaveta (calcula troco)',
    onlineDescription: 'Pagamento em espécie na entrega',
  },
  credit_card: {
    icon: 'solar:card-bold-duotone',
    color: '#7B1FA2',
    defaultLabel: 'Cartão de Crédito',
    onlineLabel: 'Cartão de Crédito',
    description: 'Maquininha / TEF Crédito à vista ou parcelado',
    onlineDescription: 'O entregador levará a maquininha',
    brandLogos: ['logos:mastercard', 'logos:visa', 'logos:amex'],
  },
  debit_card: {
    icon: 'solar:card-2-bold-duotone',
    color: '#1976D2',
    defaultLabel: 'Cartão de Débito',
    onlineLabel: 'Cartão de Débito',
    description: 'Maquininha / TEF Débito imediato',
    onlineDescription: 'O entregador levará a maquininha',
    brandLogos: ['logos:mastercard', 'logos:visa'],
  },
  store_credit: {
    icon: 'solar:ticket-sale-bold-duotone',
    color: '#ED6C02',
    defaultLabel: 'Vale-Troca',
    onlineLabel: 'Vale-Troca',
    description: 'Crédito de devolução ou troca da loja',
    onlineDescription: 'Crédito de devolução ou troca da loja',
  },
  credit_tab: {
    icon: 'solar:wallet-money-bold-duotone',
    color: '#D32F2F',
    defaultLabel: 'Crediário / Fiado (A Prazo)',
    onlineLabel: 'Crediário / Fiado',
    description: 'Lança no saldo devedor do cliente vinculado',
    onlineDescription: 'Lança no saldo devedor do cliente vinculado',
  },
};

export function getPaymentMethodBrand(method: string): PaymentMethodBrandMeta {
  return PAYMENT_METHOD_BRANDS[method as SystemPaymentMethod] || PAYMENT_METHOD_BRANDS.cash;
}

type PaymentMethodIconProps = {
  method: string;
  size?: number;
  sx?: SxProps<Theme>;
};

export function PaymentMethodIcon({ method, size = 22, sx }: PaymentMethodIconProps) {
  const meta = getPaymentMethodBrand(method);

  if (meta.imageSrc) {
    return (
      <Box
        component="img"
        src={meta.imageSrc}
        alt={meta.defaultLabel}
        sx={{
          width: size,
          height: size,
          objectFit: 'contain',
          flexShrink: 0,
          display: 'inline-block',
          ...sx,
        }}
      />
    );
  }

  return (
    <Iconify
      icon={meta.icon}
      width={size}
      sx={{
        color: meta.color,
        flexShrink: 0,
        ...sx,
      }}
    />
  );
}

type PaymentBrandLogosProps = {
  method: string;
  size?: number;
};

export function PaymentBrandLogos({ method, size = 20 }: PaymentBrandLogosProps) {
  const meta = getPaymentMethodBrand(method);
  if (!meta.brandLogos?.length) return null;

  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
      {meta.brandLogos.map((logo) => (
        <Iconify key={logo} icon={logo} width={size} />
      ))}
    </Stack>
  );
}

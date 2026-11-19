
import { useState, useCallback } from 'react';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';
import InputAdornment from '@mui/material/InputAdornment';

import { useTranslate } from 'src/locales';

import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { SearchNotFound } from 'src/components/search-not-found';

import { PAYMENT_METHODS } from './pos-calculator';

import type { PaymentMethod } from './pos-calculator';

// ----------------------------------------------------------------------

export const PAYMENT_METHOD_META: Record<
  PaymentMethod,
  { icon: string; color: string; defaultLabel: string; description: string }
> = {
  pix: {
    icon: 'ic:baseline-pix',
    color: '#00BFA5',
    defaultLabel: 'PIX',
    description: 'Transferência instantânea via QR Code ou Chave',
  },
  cash: {
    icon: 'solar:wad-of-money-bold-duotone',
    color: 'success.main',
    defaultLabel: 'Dinheiro',
    description: 'Pagamento em espécie na gaveta (calcula troco)',
  },
  credit_card: {
    icon: 'solar:card-bold-duotone',
    color: 'primary.main',
    defaultLabel: 'Cartão de Crédito',
    description: 'Maquininha / TEF Crédito à vista ou parcelado',
  },
  debit_card: {
    icon: 'solar:card-transfer-bold-duotone',
    color: 'info.main',
    defaultLabel: 'Cartão de Débito',
    description: 'Maquininha / TEF Débito imediato',
  },
  store_credit: {
    icon: 'solar:ticket-sale-bold-duotone',
    color: 'warning.main',
    defaultLabel: 'Vale-Troca',
    description: 'Crédito de devolução ou troca da loja',
  },
  credit_tab: {
    icon: 'solar:wallet-money-bold-duotone',
    color: 'error.main',
    defaultLabel: 'Crediário / Fiado (A Prazo)',
    description: 'Lança no saldo devedor do cliente vinculado',
  },
};

type Props = {
  open: boolean;
  onClose: () => void;
  selected: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
};

export function PaymentMethodListDialog({ open, onClose, selected, onSelect }: Props) {
  const { t } = useTranslate('common');
  const [search, setSearch] = useState('');

  const options = PAYMENT_METHODS.map((value) => {
    const meta = PAYMENT_METHOD_META[value];
    const label = t(`pos.paymentMethods.${value}`, { defaultValue: meta.defaultLabel });
    return {
      value,
      label,
      description: meta.description,
      icon: meta.icon,
      color: meta.color,
    };
  });

  const dataFiltered = options.filter(
    (opt) =>
      !search ||
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.description.toLowerCase().includes(search.toLowerCase())
  );

  const notFound = !dataFiltered.length && !!search;

  const handleSelect = useCallback(
    (method: PaymentMethod) => {
      onSelect(method);
      setSearch('');
      onClose();
    },
    [onClose, onSelect]
  );

  return (
    <Dialog fullWidth maxWidth="xs" open={open} onClose={onClose}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ p: 3, pb: 2 }}
      >
        <Typography variant="h6">
          {t('pos.fields.paymentMethod', { defaultValue: 'Forma de pagamento' })}
        </Typography>
      </Stack>

      <Stack sx={{ px: 3, pb: 1 }}>
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar forma de pagamento..."
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
      </Stack>

      {notFound ? (
        <SearchNotFound query={search} sx={{ px: 3, pt: 5, pb: 10 }} />
      ) : (
        <Scrollbar sx={{ p: 3, pt: 2, maxHeight: 480 }}>
          <Stack spacing={2}>
            {dataFiltered.map((option) => {
              const isSelected = selected === option.value;
              return (
                <Paper
                  key={option.value}
                  variant="outlined"
                  onClick={() => handleSelect(option.value)}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    transition: (theme) => theme.transitions.create(['box-shadow', 'border-color']),
                    ...(isSelected && {
                      boxShadow: (theme) => `0 0 0 2px ${theme.vars.palette.text.primary}`,
                    }),
                  }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center">
                        <Iconify
                          icon={
                            isSelected
                              ? 'eva:checkmark-circle-2-fill'
                              : 'eva:radio-button-off-fill'
                          }
                          width={22}
                          sx={{
                            mr: 1.5,
                            color: isSelected ? 'primary.main' : 'text.secondary',
                          }}
                        />

                        <Box component="span" sx={{ flexGrow: 1, typography: 'subtitle2' }}>
                          {option.label}
                        </Box>

                        <Stack spacing={0.5} direction="row" alignItems="center">
                          {option.value === 'credit_card' && (
                            <>
                              <Iconify icon="logos:mastercard" width={22} />
                              <Iconify icon="logos:visa" width={22} />
                            </>
                          )}
                          <Iconify
                            icon={option.icon}
                            width={22}
                            sx={{ color: option.color }}
                          />
                        </Stack>
                      </Stack>
                    }
                    secondary={option.description}
                    secondaryTypographyProps={{
                      typography: 'caption',
                      color: 'text.secondary',
                      sx: { display: 'block', mt: 0.5, pl: 4.25 },
                    }}
                  />
                </Paper>
              );
            })}
          </Stack>
        </Scrollbar>
      )}
    </Dialog>
  );
}

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { formatPhoneBr } from 'src/utils/br-docs';
import { fCurrency } from 'src/utils/format-number';

import { Form } from 'src/components/hook-form';
import { Iconify } from 'src/components/iconify';

import { TableOrderSchema } from './public-store-validation';

import type { PublicCartLine } from './public-cart-context';
import type { TableOrderFormValues } from './public-store-validation';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  tableNumber: string;
  linkedCustomerName?: string;
  linkedCustomerPhone?: string;
  initialName?: string;
  initialPhone?: string;
  lines: PublicCartLine[];
  subtotal: number;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (data: { firstName: string; phone: string; notes?: string }) => Promise<void>;
};

export function PublicTableOrderDialog({
  open,
  tableNumber,
  linkedCustomerName,
  linkedCustomerPhone,
  initialName,
  initialPhone,
  lines,
  subtotal,
  submitting,
  onClose,
  onConfirm,
}: Props) {
  const isLockedToRequester = Boolean(linkedCustomerName && linkedCustomerPhone);

  const methods = useForm<TableOrderFormValues>({
    resolver: zodResolver(TableOrderSchema),
    mode: 'onTouched',
    defaultValues: {
      firstName: '',
      phone: '',
      notes: '',
    },
  });

  const { control, reset, handleSubmit } = methods;

  useEffect(() => {
    if (open) {
      reset({
        firstName: linkedCustomerName || initialName || '',
        phone: formatPhoneBr(linkedCustomerPhone || initialPhone || ''),
        notes: '',
      });
    }
  }, [open, linkedCustomerName, linkedCustomerPhone, initialName, initialPhone, reset]);

  const onSubmit = handleSubmit(async (data) => {
    await onConfirm({
      firstName: data.firstName.trim(),
      phone: formatPhoneBr(data.phone),
      notes: data.notes?.trim() || undefined,
    });
  });

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="xs">
      <Form methods={methods} onSubmit={onSubmit}>
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Iconify icon="solar:plate-bold-duotone" width={24} sx={{ color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Enviar pedido · Mesa {tableNumber}
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info" sx={{ borderRadius: 1.5 }}>
              Seu pedido vai <strong>direto para a cozinha (Em Preparo)</strong> e a mesa continua
              aberta para novos pedidos até o encerramento pelo garçom.
            </Alert>

            <Controller
              name="firstName"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  fullWidth
                  required
                  label="Primeiro Nome"
                  placeholder="Ex.: Carlos"
                  disabled={submitting || isLockedToRequester}
                  error={Boolean(error)}
                  helperText={
                    error?.message ||
                    (isLockedToRequester
                      ? 'Mesa vinculada ao solicitante até o encerramento.'
                      : undefined)
                  }
                />
              )}
            />

            <Controller
              name="phone"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  fullWidth
                  required
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  label="Telefone / WhatsApp"
                  placeholder="(11) 99999-9999"
                  onChange={(e) => field.onChange(formatPhoneBr(e.target.value))}
                  disabled={submitting || isLockedToRequester}
                  error={Boolean(error)}
                  helperText={error?.message}
                />
              )}
            />

            <Controller
              name="notes"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  fullWidth
                  multiline
                  rows={2}
                  label="Observação para a cozinha (opcional)"
                  placeholder="Ex.: Sem cebola, trazer copo extra..."
                  disabled={submitting}
                  error={Boolean(error)}
                  helperText={error?.message}
                />
              )}
            />

            <Divider sx={{ borderStyle: 'dashed' }} />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Itens deste pedido ({lines.reduce((acc, l) => acc + l.qty, 0)})
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                {lines.map((line) => (
                  <Stack
                    key={line.productId}
                    direction="row"
                    justifyContent="space-between"
                    sx={{ typography: 'body2' }}
                  >
                    <Typography variant="body2" noWrap sx={{ pr: 1 }}>
                      <strong>{line.qty}x</strong> {line.name}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {fCurrency(line.unitPrice * line.qty)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{
                  mt: 1.5,
                  pt: 1,
                  borderTop: (theme) => `1px dashed ${theme.vars.palette.divider}`,
                }}
              >
                <Typography variant="subtitle2">Total deste pedido</Typography>
                <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 800 }}>
                  {fCurrency(subtotal)}
                </Typography>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <LoadingButton
            type="submit"
            variant="contained"
            color="primary"
            loading={submitting}
            startIcon={<Iconify icon="solar:fire-bold-duotone" />}
          >
            Enviar para a cozinha
          </LoadingButton>
        </DialogActions>
      </Form>
    </Dialog>
  );
}

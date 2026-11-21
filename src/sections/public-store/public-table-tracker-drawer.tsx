import type { PublicTableSessionStatus } from 'src/api/firestore/online-orders';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Drawer from '@mui/material/Drawer';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { fTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';

import { varAlpha } from 'src/theme/styles';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';

import { getFulfillmentLabel, OrderProgressStepper } from './order-progress-stepper';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  tableStatus: PublicTableSessionStatus | null;
  fallbackTableNumber: string;
  refreshing?: boolean;
  onRefresh: () => void;
  onClose: () => void;
};

export function PublicTableTrackerDrawer({
  open,
  tableStatus,
  fallbackTableNumber,
  refreshing,
  onRefresh,
  onClose,
}: Props) {
  const tableNumber = tableStatus?.table?.number || fallbackTableNumber;
  const session = tableStatus?.session ?? null;
  const orders = tableStatus?.orders ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      PaperProps={{ sx: { width: { xs: '100%', sm: 440 } } }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2.5, py: 2 }}
      >
        <Stack spacing={0.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Comanda · Mesa {tableNumber}
            </Typography>
            <Label variant="soft" color={session ? 'warning' : 'success'}>
              {session ? 'Aberta' : 'Livre'}
            </Label>
          </Stack>
          {session?.customerName && (
            <Typography variant="caption" color="text.secondary">
              Solicitante: <strong>{session.customerName}</strong>
              {session.customerPhone ? ` · ${session.customerPhone}` : ''}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={0.5}>
          <IconButton onClick={onRefresh} disabled={refreshing} title="Atualizar status">
            {refreshing ? (
              <CircularProgress size={18} />
            ) : (
              <Iconify icon="solar:refresh-bold" width={20} />
            )}
          </IconButton>
          <IconButton onClick={onClose}>
            <Iconify icon="mingcute:close-line" />
          </IconButton>
        </Stack>
      </Stack>

      <Divider sx={{ borderStyle: 'dashed' }} />

      <Scrollbar fillContent sx={{ flex: '1 1 auto' }}>
        <Stack spacing={2} sx={{ p: 2.5 }}>
          {session && (
            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                bgcolor: (theme) => varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Total acumulado na mesa
                  </Typography>
                  <Typography variant="h5" color="primary.main" sx={{ fontWeight: 800 }}>
                    {fCurrency(session.total)}
                  </Typography>
                </Box>
                <Label variant="filled" color="primary">
                  {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}
                </Label>
              </Stack>
              {session.waiterName && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  Atendimento: Garçom <strong>{session.waiterName}</strong>
                </Typography>
              )}
            </Box>
          )}

          {orders.length === 0 ? (
            <Stack alignItems="center" spacing={1} sx={{ py: 6, textAlign: 'center' }}>
              <Iconify
                icon="solar:plate-bold-duotone"
                width={48}
                sx={{ color: 'text.disabled' }}
              />
              <Typography variant="subtitle2">Nenhum pedido em aberto nesta mesa</Typography>
              <Typography variant="caption" color="text.secondary">
                Escolha os itens no cardápio e envie direto para a cozinha.
              </Typography>
            </Stack>
          ) : (
            orders.map((ord) => {
              const badge = getFulfillmentLabel(ord.fulfillmentStatus, 'table');
              return (
                <Box
                  key={ord.id}
                  sx={{
                    p: 2,
                    borderRadius: 1.5,
                    border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 1.25 }}
                  >
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {ord.code}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {ord.requestedByType === 'waiter'
                          ? `Lançado pelo Garçom (${ord.waiterName || 'Equipe'})`
                          : 'Solicitado na Mesa (QR)'}
                        {ord.createdAt ? ` · ${fTime(ord.createdAt)}` : ''}
                      </Typography>
                    </Box>

                    <Label variant="soft" color={badge.color}>
                      {badge.label}
                    </Label>
                  </Stack>

                  <Box sx={{ mb: 1.5 }}>
                    <OrderProgressStepper
                      compact
                      status={ord.fulfillmentStatus}
                      deliveryType="table"
                    />
                  </Box>

                  <Divider sx={{ my: 1.25, borderStyle: 'dashed' }} />

                  <Stack spacing={0.5}>
                    {ord.items.map((item, idx) => (
                      <Stack
                        key={`${item.productId}-${idx}`}
                        direction="row"
                        justifyContent="space-between"
                        sx={{ typography: 'body2' }}
                      >
                        <Typography variant="caption" color="text.primary">
                          <strong>{item.qty}x</strong> {item.productName}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {fCurrency(item.lineTotal)}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              );
            })
          )}
        </Stack>
      </Scrollbar>

      <Divider />
      <Box sx={{ p: 2 }}>
        <Button
          fullWidth
          size="large"
          variant="contained"
          onClick={onClose}
          startIcon={<Iconify icon="mingcute:add-line" />}
        >
          Fazer novo pedido na mesa
        </Button>
      </Box>
    </Drawer>
  );
}

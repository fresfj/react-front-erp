import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Drawer from '@mui/material/Drawer';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { fCurrency } from 'src/utils/format-number';
import { fTime, fDateTime } from 'src/utils/format-time';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { PaymentMethodIcon } from 'src/components/payment-method-icon';

import {
  getFulfillmentLabel,
  OrderProgressStepper,
} from 'src/sections/public-store/order-progress-stepper';

import {
  getOrderSlaInfo,
  getOrderColumnId,
  buildOrderJourney,
  getNextKanbanColumn,
  buildWhatsappPhoneUrl,
} from './online-order-kanban-utils';

// ----------------------------------------------------------------------

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
};

type Props = {
  order: OnlineOrder | null;
  open: boolean;
  busy?: boolean;
  estimatedMinutes: number;
  nowMs: number;
  onClose: () => void;
  onAccept: (orderId: string) => void;
  onRequestReject: (order: OnlineOrder) => void;
  onChangeStatus: (
    orderId: string,
    next: 'accepted' | 'preparing' | 'out_for_delivery' | 'delivered'
  ) => void;
  onPrintReceipt: (order: OnlineOrder) => void;
  onSaveInternalNotes: (orderId: string, notes: string) => Promise<void>;
};

export function OnlineOrderDetailsDrawer({
  order,
  open,
  busy,
  estimatedMinutes,
  nowMs,
  onClose,
  onAccept,
  onRequestReject,
  onChangeStatus,
  onPrintReceipt,
  onSaveInternalNotes,
}: Props) {
  const { t } = useTranslate('common');
  const router = useRouter();
  const [internalNotesDraft, setInternalNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setInternalNotesDraft(order?.internalNotes ?? '');
  }, [order?.id, order?.internalNotes]);

  if (!order) {
    return <Drawer open={false} anchor="right" onClose={onClose} />;
  }

  const notesDirty = internalNotesDraft.trim() !== (order.internalNotes ?? '').trim();

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onSaveInternalNotes(order.id, internalNotesDraft);
    } finally {
      setSavingNotes(false);
    }
  };

  const badge = getFulfillmentLabel(order.fulfillmentStatus, order.deliveryType);
  const sla = getOrderSlaInfo(order, estimatedMinutes, nowMs);
  const currentCol = getOrderColumnId(order);
  const nextCol = currentCol ? getNextKanbanColumn(currentCol) : null;
  const waUrl = buildWhatsappPhoneUrl(
    order.customerPhone,
    `Olá ${order.customerName}! Sobre o seu pedido ${order.code}:`
  );

  const handleCopyAddress = async () => {
    if (!order.customerAddress) return;
    try {
      await navigator.clipboard.writeText(order.customerAddress);
      toast.success(t('onlineOrders.kanban.actions.addressCopied'));
    } catch {
      toast.error('Não foi possível copiar o endereço');
    }
  };

  const isAwaitingOnlinePix =
    order.paymentChannel === 'online' && order.paymentStatus === 'awaiting_confirmation';

  const getNextActionLabel = () => {
    if (!nextCol) return null;
    if (nextCol === 'accepted') {
      return isAwaitingOnlinePix
        ? 'Confirmar PIX e Aceitar'
        : t('onlineOrders.kanban.actions.accept');
    }
    if (nextCol === 'preparing') return t('onlineOrders.kanban.actions.startPreparing');
    if (nextCol === 'out_for_delivery') {
      return order.deliveryType === 'delivery'
        ? t('onlineOrders.kanban.actions.dispatchDelivery')
        : t('onlineOrders.kanban.actions.readyPickup');
    }
    return t('onlineOrders.kanban.actions.finish');
  };

  const handlePrimaryAdvance = () => {
    if (!nextCol) return;
    if (order.status === 'pending' && nextCol === 'accepted') {
      onAccept(order.id);
      return;
    }
    onChangeStatus(order.id, nextCol);
  };

  const slaColor = sla.isFinished
    ? 'success'
    : sla.severity === 'overdue'
      ? 'error'
      : sla.severity === 'warning'
        ? 'warning'
        : 'default';

  const journey = buildOrderJourney(order);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      slotProps={{ backdrop: { invisible: true } }}
      PaperProps={{ sx: { width: { xs: '100%', sm: 460 } } }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2.5, py: 2 }}
      >
        <Stack spacing={0.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {order.code || order.id}
            </Typography>
            <Label variant="soft" color={badge.color}>
              {badge.label}
            </Label>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {order.createdAt ? fDateTime(order.createdAt) : '—'}
          </Typography>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Chip
            size="small"
            color={slaColor}
            variant={sla.severity === 'overdue' ? 'filled' : 'outlined'}
            icon={
              <Iconify
                icon={sla.isFinished ? 'solar:check-circle-bold' : 'solar:clock-circle-bold'}
                width={15}
              />
            }
            label={sla.label}
          />
          <IconButton onClick={onClose}>
            <Iconify icon="mingcute:close-line" />
          </IconButton>
        </Stack>
      </Stack>

      <Divider sx={{ borderStyle: 'dashed' }} />

      <Scrollbar fillContent sx={{ flex: '1 1 auto' }}>
        <Stack spacing={2.5} sx={{ p: 2.5 }}>
          {/* Progress Stepper (espelha a tela pública do cliente) */}
          <Box
            sx={{
              p: 2,
              borderRadius: 1.5,
              bgcolor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.06),
            }}
          >
            <OrderProgressStepper
              compact
              status={order.fulfillmentStatus}
              deliveryType={order.deliveryType}
              rejectedReason={order.rejectedReason}
            />

            {journey.length > 0 && (
              <Box sx={{ mt: 2, pt: 1.5, borderTop: (theme) => `1px dashed ${theme.vars.palette.divider}` }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                    {t('onlineOrders.kanban.drawer.journeyTitle')}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: sla.isFinished ? 'success.main' : 'text.primary',
                    }}
                  >
                    {t('onlineOrders.kanban.drawer.totalWaitTime')}: {sla.label}
                  </Typography>
                </Stack>

                <Stack spacing={0.5}>
                  {journey.map((step) => (
                    <Stack
                      key={step.key}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor:
                              step.key === 'delivered'
                                ? 'success.main'
                                : step.key === 'rejected'
                                  ? 'error.main'
                                  : 'primary.main',
                          }}
                        />
                        <Typography variant="caption" color="text.primary">
                          {t(`onlineOrders.kanban.drawer.journey.${step.key}`)}
                        </Typography>
                      </Stack>

                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        {step.deltaLabel && (
                          <Typography variant="caption" color="text.disabled">
                            ({step.deltaLabel})
                          </Typography>
                        )}
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {fTime(step.timestamp)}
                        </Typography>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>

          {/* Cliente & Entrega */}
          <Stack spacing={1.25}>
            <Typography variant="overline" color="text.secondary">
              {t('onlineOrders.kanban.drawer.customer')}
            </Typography>

            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Box>
                <Typography variant="subtitle2">{order.customerName || '—'}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {order.customerPhone || '—'}
                </Typography>
              </Box>

              {waUrl && (
                <Button
                  size="small"
                  variant="soft"
                  color="success"
                  component="a"
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  startIcon={<Iconify icon="ic:baseline-whatsapp" width={18} />}
                >
                  {t('onlineOrders.kanban.actions.whatsapp')}
                </Button>
              )}
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <Label
                variant="soft"
                color={order.deliveryType === 'delivery' ? 'info' : 'default'}
                startIcon={
                  <Iconify
                    icon={
                      order.deliveryType === 'delivery' ? 'solar:scooter-bold' : 'solar:shop-bold'
                    }
                    width={15}
                  />
                }
              >
                {order.deliveryType === 'delivery'
                  ? t('onlineOrders.kanban.delivery')
                  : t('onlineOrders.kanban.pickup')}
              </Label>

              <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                <PaymentMethodIcon method={order.paymentMethod} size={18} />
                <Typography variant="body2" color="text.secondary">
                  {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}
                </Typography>
                {isAwaitingOnlinePix && (
                  <Label variant="soft" color="warning">
                    PIX Online · Aguardando confirmação
                  </Label>
                )}
                {order.paymentChannel === 'online' && order.paymentStatus === 'confirmed' && (
                  <Label variant="soft" color="success">
                    PIX Online · Confirmado
                  </Label>
                )}
              </Stack>
            </Stack>

            {order.deliveryType === 'delivery' && order.customerAddress && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  border: (theme) => `1px dashed ${theme.vars.palette.divider}`,
                }}
              >
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {t('onlineOrders.kanban.drawer.address')}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.25 }}>
                      {order.customerAddress}
                    </Typography>
                  </Box>
                  <Tooltip title={t('onlineOrders.kanban.actions.copyAddress')}>
                    <IconButton size="small" onClick={handleCopyAddress}>
                      <Iconify icon="solar:copy-bold-duotone" width={18} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
            )}
          </Stack>

          <Divider sx={{ borderStyle: 'dashed' }} />

          {/* Itens */}
          <Stack spacing={1.25}>
            <Typography variant="overline" color="text.secondary">
              {t('onlineOrders.kanban.drawer.items')} ({order.items.length})
            </Typography>

            <Stack spacing={1}>
              {order.items.map((item, idx) => (
                <Box
                  key={`${item.productId}-${idx}`}
                  sx={{
                    p: 1.25,
                    borderRadius: 1.25,
                    bgcolor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.05),
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {item.qty}x {item.productName}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ whiteSpace: 'nowrap' }}>
                      {fCurrency(item.lineTotal)}
                    </Typography>
                  </Stack>
                  {item.notes && (
                    <Typography
                      variant="caption"
                      color="warning.dark"
                      sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}
                    >
                      Obs.: {item.notes}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>

            {order.notes && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1.25,
                  bgcolor: (theme) => varAlpha(theme.vars.palette.warning.mainChannel, 0.12),
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                  {t('onlineOrders.kanban.drawer.notes')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {order.notes}
                </Typography>
              </Box>
            )}
          </Stack>

          <Divider sx={{ borderStyle: 'dashed' }} />

          {/* Totais */}
          <Stack spacing={0.75}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                {t('onlineOrders.kanban.drawer.subtotal')}
              </Typography>
              <Typography variant="body2">{fCurrency(order.subtotal)}</Typography>
            </Stack>

            {order.deliveryType === 'delivery' && (
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  {t('onlineOrders.kanban.drawer.deliveryFee')}
                </Typography>
                <Typography variant="body2">{fCurrency(order.deliveryFee)}</Typography>
              </Stack>
            )}

            <Stack direction="row" justifyContent="space-between" sx={{ pt: 0.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t('onlineOrders.kanban.drawer.total')}
              </Typography>
              <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 700 }}>
                {fCurrency(order.total)}
              </Typography>
            </Stack>
          </Stack>

          <Divider sx={{ borderStyle: 'dashed' }} />

          {/* Notas internas (controle exclusivo da empresa) */}
          <Stack spacing={1.25}>
            <Box>
              <Typography variant="overline" color="text.secondary" display="block">
                {t('onlineOrders.kanban.drawer.internalNotes')}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {t('onlineOrders.kanban.drawer.internalNotesHint')}
              </Typography>
            </Box>

            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={5}
              size="small"
              value={internalNotesDraft}
              onChange={(e) => setInternalNotesDraft(e.target.value)}
              placeholder={t('onlineOrders.kanban.drawer.internalNotesPlaceholder')}
              disabled={savingNotes}
            />

            <Stack direction="row" justifyContent="flex-end">
              <LoadingButton
                size="small"
                variant="soft"
                color="primary"
                loading={savingNotes}
                disabled={!notesDirty}
                onClick={handleSaveNotes}
                startIcon={<Iconify icon="solar:diskette-bold-duotone" width={16} />}
              >
                {t('onlineOrders.kanban.drawer.saveInternalNotes')}
              </LoadingButton>
            </Stack>
          </Stack>
        </Stack>
      </Scrollbar>

      {/* Footer Actions */}
      <Divider />
      <Stack spacing={1.25} sx={{ p: 2 }}>
        {nextCol && (
          <LoadingButton
            fullWidth
            size="large"
            variant="contained"
            color={nextCol === 'delivered' ? 'success' : 'primary'}
            loading={busy}
            onClick={handlePrimaryAdvance}
          >
            {getNextActionLabel()}
          </LoadingButton>
        )}

        <Stack direction="row" spacing={1}>
          {order.status === 'pending' && (
            <Button
              fullWidth
              variant="outlined"
              color="error"
              disabled={busy}
              onClick={() => onRequestReject(order)}
              startIcon={<Iconify icon="solar:close-circle-bold" />}
            >
              {t('onlineOrders.kanban.actions.reject')}
            </Button>
          )}

          {order.saleId && (
            <>
              <Button
                fullWidth
                variant="soft"
                color="inherit"
                onClick={() => onPrintReceipt(order)}
                startIcon={<Iconify icon="solar:printer-minimalistic-bold" />}
              >
                {t('onlineOrders.kanban.actions.printReceipt')}
              </Button>
              <Button
                fullWidth
                variant="soft"
                color="primary"
                onClick={() => router.push(paths.dashboard.pos.saleDetails(order.saleId!))}
                endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
              >
                {t('onlineOrders.kanban.actions.viewSale')}
              </Button>
            </>
          )}
        </Stack>
      </Stack>
    </Drawer>
  );
}

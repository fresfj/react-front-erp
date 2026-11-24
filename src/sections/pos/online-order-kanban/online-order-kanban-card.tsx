import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { memo } from 'react';
import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import ListItem from '@mui/material/ListItem';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import { styled, useTheme } from '@mui/material/styles';

import { fCurrency } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';
import { varAlpha, stylesMode } from 'src/theme/styles';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { PaymentMethodIcon } from 'src/components/payment-method-icon';

import { getOrderSlaInfo, getNextKanbanColumn } from './online-order-kanban-utils';

import type { KanbanColumnId } from './online-order-kanban-utils';

// ----------------------------------------------------------------------

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  credit_card: 'Crédito',
  debit_card: 'Débito',
};

const StyledItemWrap = styled(ListItem)(() => ({
  padding: 0,
  transformOrigin: '0 0',
  touchAction: 'manipulation',
}));

const StyledCard = styled(Stack)(({ theme }) => ({
  width: '100%',
  cursor: 'grab',
  outline: 'none',
  overflow: 'hidden',
  position: 'relative',
  touchAction: 'manipulation',
  boxShadow: theme.customShadows.z1,
  borderRadius: 'var(--item-radius, 12px)',
  WebkitTapHighlightColor: 'transparent',
  backgroundColor: theme.vars.palette.common.white,
  border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
  transition: theme.transitions.create(['box-shadow', 'border-color', 'opacity']),
  [stylesMode.dark]: {
    backgroundColor: theme.vars.palette.grey[900],
  },
  '&:hover': {
    boxShadow: theme.customShadows.z8,
  },
}));

// ----------------------------------------------------------------------

type CardContentProps = {
  order: OnlineOrder;
  columnId: KanbanColumnId;
  estimatedMinutes: number;
  nowMs: number;
  busy?: boolean;
  isOverlay?: boolean;
  onOpenDetails?: (order: OnlineOrder) => void;
  onAccept?: (orderId: string) => void;
  onRequestReject?: (order: OnlineOrder) => void;
  onChangeStatus?: (
    orderId: string,
    next: 'preparing' | 'out_for_delivery' | 'delivered'
  ) => void;
  onPrintReceipt?: (order: OnlineOrder) => void;
};

export const OnlineOrderKanbanCardContent = memo(
  ({
    order,
    columnId,
    estimatedMinutes,
    nowMs,
    busy,
    isOverlay,
    onOpenDetails,
    onAccept,
    onRequestReject,
    onChangeStatus,
    onPrintReceipt,
  }: CardContentProps) => {
    const { t } = useTranslate('common');
    const theme = useTheme();

    const sla = getOrderSlaInfo(order, estimatedMinutes, nowMs);
    const nextCol = getNextKanbanColumn(columnId);
    const hasNotes = Boolean(order.notes || order.items.some((i) => Boolean(i.notes)));
    const previewItems = order.items.slice(0, 2);
    const extraItemsCount = Math.max(0, order.items.length - previewItems.length);

    const slaColor = sla.isFinished
      ? 'success'
      : sla.severity === 'overdue'
        ? 'error'
        : sla.severity === 'warning'
          ? 'warning'
          : 'default';

    const isAwaitingOnlinePix =
      order.paymentChannel === 'online' && order.paymentStatus === 'awaiting_confirmation';

    const getPrimaryButtonLabel = () => {
      if (!nextCol) return null;
      if (nextCol === 'preparing' && columnId === 'pending') {
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

    const handlePrimaryClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!nextCol) return;
      if (columnId === 'pending' && nextCol === 'preparing') {
        onAccept?.(order.id);
        return;
      }
      onChangeStatus?.(order.id, nextCol);
    };

    return (
      <Stack
        spacing={1.25}
        onClick={() => onOpenDetails?.(order)}
        sx={{
          p: 1.75,
          borderLeft:
            columnId === 'pending'
              ? `4px solid ${theme.vars.palette.warning.main}`
              : sla.severity === 'overdue'
                ? `4px solid ${theme.vars.palette.error.main}`
                : undefined,
          ...(isOverlay && {
            boxShadow: theme.customShadows.z20,
            cursor: 'grabbing',
          }),
        }}
      >
        {/* Top Row: Code + Delivery Badge + SLA */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.75}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
              {order.code || order.id}
            </Typography>
            <Label
              variant="soft"
              color={
                order.deliveryType === 'delivery'
                  ? 'info'
                  : order.deliveryType === 'table'
                    ? 'secondary'
                    : 'default'
              }
              sx={{ height: 22, px: 0.75, fontSize: 11 }}
            >
              <Iconify
                icon={
                  order.deliveryType === 'delivery'
                    ? 'solar:scooter-bold'
                    : order.deliveryType === 'table'
                      ? 'solar:plate-bold'
                      : 'solar:shop-bold'
                }
                width={13}
                sx={{ mr: 0.4 }}
              />
              {order.deliveryType === 'delivery'
                ? t('onlineOrders.kanban.delivery')
                : order.deliveryType === 'table'
                  ? `Mesa ${order.tableNumber || ''}`.trim()
                  : t('onlineOrders.kanban.pickup')}
            </Label>
          </Stack>

          <Tooltip
            title={
              sla.isFinished
                ? `${t('onlineOrders.kanban.drawer.totalWaitTime')}: ${sla.label}`
                : undefined
            }
          >
            <Chip
              size="small"
              color={slaColor}
              variant={sla.severity === 'overdue' ? 'filled' : 'outlined'}
              icon={
                sla.isFinished ? (
                  <Iconify icon="solar:check-circle-bold" width={13} />
                ) : (
                  <Iconify icon="solar:clock-circle-bold" width={13} />
                )
              }
              label={sla.label}
              sx={{
                height: 22,
                '& .MuiChip-label': { px: 0.65, fontSize: 11, fontWeight: 700 },
                '& .MuiChip-icon': { ml: 0.5, mr: -0.25 },
              }}
            />
          </Tooltip>
        </Stack>

        {/* Customer + Address */}
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.5}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {order.customerName || '—'}
            </Typography>
            {hasNotes && (
              <Tooltip title={order.notes || 'Pedido possui observações'}>
                <Iconify
                  icon="solar:chat-round-dots-bold"
                  width={16}
                  sx={{ color: 'warning.main', flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </Stack>

          {order.deliveryType === 'table' && (
            <Typography
              variant="caption"
              color="secondary.main"
              noWrap
              sx={{ display: 'block', mt: 0.25, fontWeight: 600 }}
            >
              {order.requestedByType === 'waiter'
                ? `Garçom: ${order.waiterName || 'Equipe'}`
                : 'Solicitado pelo Cliente (QR Mesa)'}
            </Typography>
          )}

          {order.deliveryType === 'delivery' && order.customerAddress && (
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: 'block', mt: 0.25 }}
            >
              <Iconify
                icon="mingcute:location-fill"
                width={12}
                sx={{ mr: 0.35, verticalAlign: 'middle' }}
              />
              {order.customerAddress}
            </Typography>
          )}
        </Box>

        {/* Compact Items Summary */}
        <Box
          sx={{
            px: 1.25,
            py: 0.85,
            borderRadius: 1,
            bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.06),
          }}
        >
          {previewItems.map((item, idx) => (
            <Typography
              key={`${item.productId}-${idx}`}
              variant="caption"
              color="text.primary"
              noWrap
              sx={{ display: 'block', lineHeight: 1.5 }}
            >
              <strong>{item.qty}x</strong> {item.productName}
            </Typography>
          ))}
          {extraItemsCount > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              +{extraItemsCount} {extraItemsCount === 1 ? 'item' : 'itens'}
            </Typography>
          )}
        </Box>

        {/* Internal Company Note Preview (if any) */}
        {order.internalNotes && (
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="flex-start"
            sx={{
              px: 1,
              py: 0.65,
              borderRadius: 1,
              bgcolor: varAlpha(theme.vars.palette.info.mainChannel, 0.08),
              border: `1px dashed ${varAlpha(theme.vars.palette.info.mainChannel, 0.32)}`,
            }}
          >
            <Iconify
              icon="solar:notes-bold-duotone"
              width={14}
              sx={{ color: 'info.main', mt: 0.2, flexShrink: 0 }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: 1.35,
              }}
            >
              {order.internalNotes}
            </Typography>
          </Stack>
        )}

        {/* Payment + Total */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.75}>
          <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
            <PaymentMethodIcon method={order.paymentMethod} size={16} />
            <Typography variant="caption" color="text.secondary">
              {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}
            </Typography>
            {isAwaitingOnlinePix && (
              <Label variant="soft" color="warning" sx={{ height: 18, fontSize: 10, px: 0.6 }}>
                PIX Online · Confirmar
              </Label>
            )}
            {order.paymentChannel === 'online' && order.paymentStatus === 'confirmed' && (
              <Label variant="soft" color="success" sx={{ height: 18, fontSize: 10, px: 0.6 }}>
                PIX Pago
              </Label>
            )}
          </Stack>

          <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {fCurrency(order.total)}
          </Typography>
        </Stack>

        {/* Quick 1-click actions */}
        <Divider sx={{ borderStyle: 'dashed' }} />

        <Stack direction="row" spacing={0.75} alignItems="center">
          {nextCol ? (
            <LoadingButton
              fullWidth
              size="small"
              variant="contained"
              color={
                columnId === 'pending'
                  ? 'success'
                  : nextCol === 'delivered'
                    ? 'success'
                    : 'primary'
              }
              loading={busy}
              onClick={handlePrimaryClick}
              onPointerDown={(e) => e.stopPropagation()}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {getPrimaryButtonLabel()}
            </LoadingButton>
          ) : (
            <Button
              fullWidth
              size="small"
              variant="soft"
              color="inherit"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails?.(order);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {t('onlineOrders.kanban.drawer.orderDetails')}
            </Button>
          )}

          {columnId === 'pending' && (
            <Tooltip title={t('onlineOrders.kanban.actions.reject')}>
              <IconButton
                size="small"
                color="error"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestReject?.(order);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                sx={{
                  border: `1px solid ${varAlpha(theme.vars.palette.error.mainChannel, 0.32)}`,
                  borderRadius: 1,
                }}
              >
                <Iconify icon="solar:close-circle-bold" width={18} />
              </IconButton>
            </Tooltip>
          )}

          {order.saleId && columnId !== 'pending' && (
            <Tooltip title={t('onlineOrders.kanban.actions.printReceipt')}>
              <IconButton
                size="small"
                color="default"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onPrintReceipt?.(order);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                sx={{
                  border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.24)}`,
                  borderRadius: 1,
                }}
              >
                <Iconify icon="solar:printer-minimalistic-bold" width={18} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    );
  }
);

// ----------------------------------------------------------------------

type SortableCardProps = CardContentProps & {
  disabled?: boolean;
};

export function OnlineOrderKanbanCard({
  order,
  columnId,
  disabled,
  ...rest
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: order.id,
    disabled,
    data: {
      type: 'order',
      columnId,
      order,
    },
  });

  return (
    <StyledItemWrap
      ref={setNodeRef}
      sx={{
        transition,
        transform: CSS.Translate.toString(transform),
      }}
    >
      <StyledCard
        {...attributes}
        {...listeners}
        sx={{
          ...(isDragging && { opacity: 0.25, filter: 'grayscale(0.6)' }),
        }}
      >
        <OnlineOrderKanbanCardContent order={order} columnId={columnId} {...rest} />
      </StyledCard>
    </StyledItemWrap>
  );
}

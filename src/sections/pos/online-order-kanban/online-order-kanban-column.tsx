import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled, useTheme } from '@mui/material/styles';

import { fCurrency } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';
import { varAlpha, stylesMode, hideScrollY } from 'src/theme/styles';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';

import { OnlineOrderKanbanCard } from './online-order-kanban-card';

import type { KanbanColumnDef } from './online-order-kanban-utils';

// ----------------------------------------------------------------------

const StyledColumn = styled(Stack)(({ theme }) => ({
  flexShrink: 0,
  width: 'var(--column-width, 320px)',
  height: '100%',
  borderWidth: 1,
  position: 'relative',
  borderStyle: 'solid',
  borderColor: 'transparent',
  padding: 'var(--column-padding, 16px 12px 12px 12px)',
  borderRadius: 'var(--column-radius, 16px)',
  backgroundColor: theme.vars.palette.background.neutral,
  transition: theme.transitions.create(['background-color', 'border-color']),
  [stylesMode.dark]: {
    backgroundColor: theme.vars.palette.grey[800],
  },
}));

// ----------------------------------------------------------------------

type Props = {
  column: KanbanColumnDef;
  orders: OnlineOrder[];
  columnFixed: boolean;
  estimatedMinutes: number;
  nowMs: number;
  busyId: string | null;
  isDropBlocked?: boolean;
  onOpenDetails: (order: OnlineOrder) => void;
  onAccept: (orderId: string) => void;
  onRequestReject: (order: OnlineOrder) => void;
  onChangeStatus: (
    orderId: string,
    next: 'preparing' | 'out_for_delivery' | 'delivered'
  ) => void;
  onPrintReceipt: (order: OnlineOrder) => void;
};

export function OnlineOrderKanbanColumn({
  column,
  orders,
  columnFixed,
  estimatedMinutes,
  nowMs,
  busyId,
  isDropBlocked,
  onOpenDetails,
  onAccept,
  onRequestReject,
  onChangeStatus,
  onPrintReceipt,
}: Props) {
  const { t } = useTranslate('common');
  const theme = useTheme();

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', columnId: column.id },
  });

  const columnTotal = orders.reduce((acc, item) => acc + (item.total || 0), 0);
  const title = t(`onlineOrders.kanban.columns.${column.id}`);
  const paletteColor = theme.vars.palette[column.color];

  return (
    <StyledColumn
      ref={setNodeRef}
      spacing={2}
      sx={{
        ...(isOver &&
          !isDropBlocked && {
            borderColor: paletteColor.main,
            backgroundColor: varAlpha(paletteColor.mainChannel, 0.08),
          }),
        ...(isOver &&
          isDropBlocked && {
            borderColor: theme.vars.palette.error.main,
            backgroundColor: varAlpha(theme.vars.palette.error.mainChannel, 0.08),
          }),
        ...(column.id === 'pending' &&
          orders.length > 0 &&
          !isOver && {
            borderColor: varAlpha(theme.vars.palette.warning.mainChannel, 0.36),
          }),
      }}
    >
      {/* Column Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ px: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: varAlpha(paletteColor.mainChannel, 0.16),
              color: paletteColor.main,
              flexShrink: 0,
            }}
          >
            <Iconify icon={column.icon} width={18} />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {fCurrency(columnTotal)}
            </Typography>
          </Box>
        </Stack>

        <Label
          variant={orders.length > 0 ? 'filled' : 'soft'}
          color={column.color}
          sx={{ minWidth: 26, height: 24, borderRadius: 1.5 }}
        >
          {orders.length}
        </Label>
      </Stack>

      {/* Cards List */}
      <SortableContext items={orders.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        <Box
          component="ul"
          sx={{
            m: 0,
            p: 0,
            listStyle: 'none',
            minHeight: 140,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--item-gap, 12px)',
            ...(columnFixed && {
              ...hideScrollY,
              flex: '1 1 auto',
              maxHeight: { md: 'calc(100vh - 340px)' },
            }),
          }}
        >
          {orders.length === 0 ? (
            <Stack
              alignItems="center"
              justifyContent="center"
              spacing={0.75}
              sx={{
                py: 5,
                px: 2,
                borderRadius: 1.5,
                border: `1px dashed ${varAlpha(theme.vars.palette.grey['500Channel'], 0.24)}`,
                color: 'text.disabled',
              }}
            >
              <Iconify icon={column.icon} width={28} sx={{ opacity: 0.45 }} />
              <Typography variant="caption" align="center">
                {t('onlineOrders.kanban.emptyColumn')}
              </Typography>
            </Stack>
          ) : (
            orders.map((order) => (
              <OnlineOrderKanbanCard
                key={order.id}
                order={order}
                columnId={column.id}
                estimatedMinutes={estimatedMinutes}
                nowMs={nowMs}
                busy={busyId === order.id}
                disabled={busyId === order.id}
                onOpenDetails={onOpenDetails}
                onAccept={onAccept}
                onRequestReject={onRequestReject}
                onChangeStatus={onChangeStatus}
                onPrintReceipt={onPrintReceipt}
              />
            ))
          )}
        </Box>
      </SortableContext>
    </StyledColumn>
  );
}

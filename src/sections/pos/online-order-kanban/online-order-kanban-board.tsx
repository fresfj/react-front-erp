import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import type { OnlineOrder, OnlineOrderFulfillmentStatus } from 'src/api/firestore/online-orders';

import { useMemo, useState, useCallback } from 'react';
import {
  useSensor,
  DndContext,
  useSensors,
  MouseSensor,
  TouchSensor,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  rectIntersection,
  MeasuringStrategy,
} from '@dnd-kit/core';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';

import { useTranslate } from 'src/locales';
import { varAlpha, stylesMode } from 'src/theme/styles';

import { toast } from 'src/components/snackbar';

import { OnlineOrderKanbanColumn } from './online-order-kanban-column';
import { OnlineOrderKanbanCardContent } from './online-order-kanban-card';
import {
  KANBAN_COLUMNS,
  isKanbanColumnId,
  getOrderColumnId,
  groupOrdersByColumn,
  resolveKanbanTransition,
} from './online-order-kanban-utils';

import type { KanbanColumnId } from './online-order-kanban-utils';

// ----------------------------------------------------------------------

const BOARD_CSS_VARS = {
  '--item-gap': '12px',
  '--item-radius': '12px',
  '--column-gap': '16px',
  '--column-width': '316px',
  '--column-radius': '16px',
  '--column-padding': '16px 12px 12px 12px',
};

type Props = {
  orders: OnlineOrder[];
  loading: boolean;
  columnFixed: boolean;
  estimatedMinutes: number;
  nowMs: number;
  busyId: string | null;
  optimisticMap: Record<string, OnlineOrderFulfillmentStatus>;
  onOpenDetails: (order: OnlineOrder) => void;
  onAccept: (orderId: string) => void;
  onRequestReject: (order: OnlineOrder) => void;
  onChangeStatus: (
    orderId: string,
    next: 'preparing' | 'out_for_delivery' | 'delivered'
  ) => void;
  onPrintReceipt: (order: OnlineOrder) => void;
};

export function OnlineOrderKanbanBoard({
  orders,
  loading,
  columnFixed,
  estimatedMinutes,
  nowMs,
  busyId,
  optimisticMap,
  onOpenDetails,
  onAccept,
  onRequestReject,
  onChangeStatus,
  onPrintReceipt,
}: Props) {
  const { t } = useTranslate('common');
  const theme = useTheme();

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<KanbanColumnId | null>(null);

  const grouped = useMemo(
    () => groupOrdersByColumn(orders, optimisticMap),
    [orders, optimisticMap]
  );

  const activeOrder = useMemo(
    () => (activeOrderId ? orders.find((o) => o.id === activeOrderId) ?? null : null),
    [activeOrderId, orders]
  );

  const activeOrderColumn = useMemo(
    () => (activeOrder ? getOrderColumnId(activeOrder) : null),
    [activeOrder]
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const findColumnForId = useCallback(
    (id: string): KanbanColumnId | null => {
      if (isKanbanColumnId(id)) return id;
      const found = KANBAN_COLUMNS.find((col) => grouped[col.id].some((o) => o.id === id));
      return found ? found.id : null;
    },
    [grouped]
  );

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveOrderId(String(active.id));
  }, []);

  const handleDragOver = useCallback(
    ({ over }: DragOverEvent) => {
      if (!over) {
        setOverColumnId(null);
        return;
      }
      setOverColumnId(findColumnForId(String(over.id)));
    },
    [findColumnForId]
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      const draggedId = String(active.id);
      const targetId = over ? String(over.id) : null;

      setActiveOrderId(null);
      setOverColumnId(null);

      if (!targetId) return;

      const order = orders.find((o) => o.id === draggedId);
      const targetColumn = findColumnForId(targetId);
      if (!order || !targetColumn) return;

      const plan = resolveKanbanTransition(order, targetColumn);
      if (!plan.allowed) {
        if (plan.reason === 'cannot_revert_to_pending') {
          toast.warning(t('onlineOrders.kanban.cannotRevertPending'));
        } else if (plan.reason === 'must_accept_first') {
          toast.warning(t('onlineOrders.kanban.mustAcceptFirst'));
        }
        return;
      }

      if (plan.action === 'accept') {
        onAccept(order.id);
      } else if (plan.action === 'update_status') {
        onChangeStatus(order.id, plan.target);
      }
    },
    [findColumnForId, onAccept, onChangeStatus, orders, t]
  );

  const handleDragCancel = useCallback(() => {
    setActiveOrderId(null);
    setOverColumnId(null);
  }, []);

  if (loading) {
    return (
      <Stack
        direction="row"
        alignItems="flex-start"
        sx={{ ...BOARD_CSS_VARS, gap: 'var(--column-gap)', overflowX: 'auto', pb: 2 }}
      >
        {KANBAN_COLUMNS.map((col, idx) => (
          <Paper
            key={col.id}
            variant="outlined"
            sx={{
              p: 2,
              flexShrink: 0,
              width: 'var(--column-width)',
              borderRadius: 'var(--column-radius)',
              bgcolor: 'background.neutral',
              [stylesMode.dark]: { bgcolor: 'grey.800' },
            }}
          >
            <Stack spacing={1.5}>
              <Skeleton animation="wave" variant="rounded" height={34} />
              <Skeleton animation="wave" variant="rounded" height={156} />
              {idx % 2 === 0 && <Skeleton animation="wave" variant="rounded" height={140} />}
            </Stack>
          </Paper>
        ))}
      </Stack>
    );
  }

  return (
    <Box sx={{ ...BOARD_CSS_VARS, width: '100%' }}>
      <DndContext
        id="dnd-online-orders-kanban"
        sensors={sensors}
        collisionDetection={(args) => {
          const pointerHits = pointerWithin(args);
          return pointerHits.length > 0 ? pointerHits : rectIntersection(args);
        }}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <Stack
          direction="row"
          alignItems="stretch"
          sx={{
            gap: 'var(--column-gap)',
            overflowX: 'auto',
            pb: 2,
            minHeight: columnFixed ? { md: 'calc(100vh - 250px)' } : 420,
          }}
        >
          {KANBAN_COLUMNS.map((col) => {
            const isDropBlocked = Boolean(
              activeOrder &&
                overColumnId === col.id &&
                !resolveKanbanTransition(activeOrder, col.id).allowed &&
                activeOrderColumn !== col.id
            );

            return (
              <OnlineOrderKanbanColumn
                key={col.id}
                column={col}
                orders={grouped[col.id]}
                columnFixed={columnFixed}
                estimatedMinutes={estimatedMinutes}
                nowMs={nowMs}
                busyId={busyId}
                isDropBlocked={isDropBlocked}
                onOpenDetails={onOpenDetails}
                onAccept={onAccept}
                onRequestReject={onRequestReject}
                onChangeStatus={onChangeStatus}
                onPrintReceipt={onPrintReceipt}
              />
            );
          })}
        </Stack>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
          {activeOrder && activeOrderColumn ? (
            <Box
              sx={{
                width: 'var(--column-width)',
                borderRadius: 'var(--item-radius)',
                backdropFilter: 'blur(6px)',
                backgroundColor: varAlpha(theme.vars.palette.common.whiteChannel, 0.92),
                [stylesMode.dark]: {
                  backgroundColor: varAlpha(theme.vars.palette.grey['900Channel'], 0.92),
                },
                boxShadow: theme.customShadows.z20,
              }}
            >
              <OnlineOrderKanbanCardContent
                order={activeOrder}
                columnId={activeOrderColumn}
                estimatedMinutes={estimatedMinutes}
                nowMs={nowMs}
                isOverlay
              />
            </Box>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Box>
  );
}

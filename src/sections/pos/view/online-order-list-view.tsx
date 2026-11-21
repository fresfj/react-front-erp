import type { Sale } from 'src/api/firestore/sales';
import type { Enterprise } from 'src/api/firestore/platform';
import type {
  OnlineOrder,
  OnlineOrderFulfillmentStatus,
} from 'src/api/firestore/online-orders';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import TableBody from '@mui/material/TableBody';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import InputAdornment from '@mui/material/InputAdornment';
import TableContainer from '@mui/material/TableContainer';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { paths } from 'src/routes/paths';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { getSale } from 'src/api/firestore/sales';
import { DashboardContent } from 'src/layouts/dashboard';
import { getEnterprise } from 'src/api/firestore/platform';
import {
  acceptOnlineOrderCf,
  rejectOnlineOrderCf,
  subscribeOnlineOrders,
  updateOnlineOrderStatusCf,
  updateOnlineOrderInternalNotes,
} from 'src/api/firestore/online-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { ErpTableToolbar, ErpTableAnalytic } from 'src/components/erp-table';
import {
  useTable,
  emptyRows,
  TableNoData,
  getComparator,
  TableSkeleton,
  TableEmptyRows,
  TableHeadCustom,
  TableSelectedAction,
  TablePaginationCustom,
} from 'src/components/table';

import { getFulfillmentLabel } from 'src/sections/public-store/order-progress-stepper';

import { useAuthContext } from 'src/auth/hooks';

import { ReceiptDialog } from '../receipt-dialog';
import { OnlineOrderTableRow } from '../online-order-table-row';
import { OnlineOrderKanbanBoard } from '../online-order-kanban/online-order-kanban-board';
import { OnlineOrderRejectDialog } from '../online-order-kanban/online-order-reject-dialog';
import { OnlineOrderDetailsDrawer } from '../online-order-kanban/online-order-details-drawer';
import { filterOrdersByKanbanPeriod } from '../online-order-kanban/online-order-kanban-utils';

import type { KanbanPeriodFilter } from '../online-order-kanban/online-order-kanban-utils';

// ----------------------------------------------------------------------

type StatusTab = 'all' | 'pending' | 'accepted' | 'rejected';
type ViewMode = 'kanban' | 'list';

const VIEW_MODE_STORAGE_KEY = 'erp.onlineOrders.viewMode';
const AUTO_PRINT_STORAGE_KEY = 'erp.onlineOrders.autoPrintOnAccept';

const TABLE_HEAD = [
  { id: 'createdAt', label: 'Pedido / Data', minWidth: 180, hideable: false },
  { id: 'customerName', label: 'Cliente', minWidth: 190 },
  { id: 'deliveryType', label: 'Modalidade / Pgto', width: 160 },
  { id: 'total', label: 'Total', width: 130, align: 'right' },
  { id: 'status', label: 'Status / Andamento', width: 220 },
  { id: 'actions', label: '', width: 180, align: 'right', hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  createdAt: true,
  customerName: true,
  deliveryType: true,
  total: true,
  status: true,
  actions: true,
};

const DELIVERY_OPTIONS = [
  { value: 'delivery', label: 'Entrega' },
  { value: 'pickup', label: 'Retirada' },
  { value: 'table', label: 'Mesa' },
];

const PAYMENT_OPTIONS = [
  { value: 'pix', label: 'PIX' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
];

function readInitialViewMode(): ViewMode {
  try {
    const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (saved === 'list' || saved === 'kanban') return saved;
  } catch {
    // ignore storage errors
  }
  return 'kanban';
}

function readInitialAutoPrint(): boolean {
  try {
    return window.localStorage.getItem(AUTO_PRINT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------

export function OnlineOrderListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });
  const { user } = useAuthContext();
  const confirmBulkReject = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [viewMode, setViewMode] = useState<ViewMode>(readInitialViewMode);
  const [columnFixed, setColumnFixed] = useState(true);
  const [autoPrintOnAccept, setAutoPrintOnAccept] = useState<boolean>(readInitialAutoPrint);
  const [kanbanPeriod, setKanbanPeriod] = useState<KanbanPeriodFilter>('today');

  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OnlineOrder[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveryFilters, setDeliveryFilters] = useState<string[]>([]);
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [optimisticMap, setOptimisticMap] = useState<Record<string, OnlineOrderFulfillmentStatus>>(
    {}
  );

  // Live SLA clock (updates every 30s)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Details Drawer & Reject Dialog & Receipt Dialog
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OnlineOrder | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [receiptAutoPrint, setReceiptAutoPrint] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!enterpriseId) {
      setEnterprise(null);
      return;
    }
    getEnterprise(enterpriseId)
      .then((ent) => setEnterprise(ent))
      .catch(() => {});
  }, [enterpriseId]);

  useEffect(() => {
    if (!enterpriseId) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const unsub = subscribeOnlineOrders(enterpriseId, (next) => {
      setRows(next);
      setLoading(false);
    });
    return unsub;
  }, [enterpriseId]);

  // Clear optimistic entries once Firestore reflects the target status
  useEffect(() => {
    setOptimisticMap((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      keys.forEach((id) => {
        const live = rows.find((r) => r.id === id);
        if (!live || live.fulfillmentStatus === prev[id]) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [rows]);

  const estimatedMinutes = Number(enterprise?.onlineStore?.estimatedMinutes || 40);

  const selectedOrder = useMemo(
    () => (selectedOrderId ? rows.find((r) => r.id === selectedOrderId) ?? null : null),
    [rows, selectedOrderId]
  );

  const handleChangeViewMode = useCallback(
    (_: React.MouseEvent<HTMLElement>, nextMode: ViewMode | null) => {
      if (!nextMode) return;
      setViewMode(nextMode);
      try {
        window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, nextMode);
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const handleToggleAutoPrint = useCallback((checked: boolean) => {
    setAutoPrintOnAccept(checked);
    try {
      window.localStorage.setItem(AUTO_PRINT_STORAGE_KEY, String(checked));
    } catch {
      // ignore storage errors
    }
  }, []);

  const openReceiptForSaleId = useCallback(
    async (saleId: string, autoPrint: boolean) => {
      if (!enterpriseId) return;
      try {
        const sale = await getSale(enterpriseId, saleId);
        if (!sale) {
          toast.error('Venda vinculada não encontrada para impressão.');
          return;
        }
        setReceiptAutoPrint(autoPrint);
        setReceiptSale(sale);
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar comanda para impressão'));
      }
    },
    [enterpriseId]
  );

  const handlePrintReceipt = useCallback(
    (order: OnlineOrder) => {
      if (!order.saleId) return;
      openReceiptForSaleId(order.saleId, false);
    },
    [openReceiptForSaleId]
  );

  // 4 Indicadores Analíticos (Padrão /dashboard/pos/sales)
  const pendingRows = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows]);
  const acceptedRows = useMemo(() => rows.filter((r) => r.status === 'accepted'), [rows]);
  const rejectedRows = useMemo(
    () => rows.filter((r) => r.status === 'rejected' || r.status === 'cancelled'),
    [rows]
  );
  const deliveredRows = useMemo(
    () => rows.filter((r) => r.fulfillmentStatus === 'delivered'),
    [rows]
  );

  const sumTotal = (list: OnlineOrder[]) => list.reduce((acc, item) => acc + (item.total || 0), 0);

  const totalAmount = useMemo(() => sumTotal(rows), [rows]);
  const pendingAmount = useMemo(() => sumTotal(pendingRows), [pendingRows]);
  const acceptedAmount = useMemo(() => sumTotal(acceptedRows), [acceptedRows]);
  const deliveredAmount = useMemo(() => sumTotal(deliveredRows), [deliveredRows]);

  const getPercent = (count: number) => (rows.length ? (count / rows.length) * 100 : 0);

  // Shared search + delivery + payment filters
  const baseFiltered = useMemo(() => {
    let filtered = rows;

    if (deliveryFilters.length > 0) {
      filtered = filtered.filter((r) => deliveryFilters.includes(r.deliveryType));
    }

    if (paymentFilters.length > 0) {
      filtered = filtered.filter((r) => paymentFilters.includes(r.paymentMethod));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (r) =>
          (r.code || '').toLowerCase().includes(q) ||
          (r.customerName || '').toLowerCase().includes(q) ||
          (r.customerPhone || '').toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [rows, deliveryFilters, paymentFilters, searchQuery]);

  // Orders for Kanban (period filter keeps active orders always visible)
  const kanbanOrders = useMemo(
    () => filterOrdersByKanbanPeriod(baseFiltered, kanbanPeriod),
    [baseFiltered, kanbanPeriod]
  );

  // Orders for List table (status tab + sorting)
  const dataFiltered = useMemo(() => {
    let filtered = baseFiltered;

    if (statusTab !== 'all') {
      filtered = filtered.filter((r) =>
        statusTab === 'rejected'
          ? r.status === 'rejected' || r.status === 'cancelled'
          : r.status === statusTab
      );
    }

    const comparator = getComparator(table.order, table.orderBy);
    const stabilized = filtered.map((el, idx) => [el, idx] as const);
    stabilized.sort((a, b) => {
      const order = comparator(
        a[0] as unknown as Record<string, string | number>,
        b[0] as unknown as Record<string, string | number>
      );
      return order !== 0 ? order : a[1] - b[1];
    });
    return stabilized.map((el) => el[0]);
  }, [baseFiltered, statusTab, table.order, table.orderBy]);

  const pageRows = useMemo(
    () =>
      dataFiltered.slice(
        table.page * table.rowsPerPage,
        table.page * table.rowsPerPage + table.rowsPerPage
      ),
    [dataFiltered, table.page, table.rowsPerPage]
  );

  const visibleHeadLabel = useMemo(
    () => TABLE_HEAD.filter((col) => visibleColumns[col.id] !== false),
    [visibleColumns]
  );

  const handleToggleColumn = useCallback((colId: string) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [colId]: prev[colId] === false,
    }));
  }, []);

  const handleResetColumns = useCallback(() => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
  }, []);

  const handleExportCsv = useCallback(() => {
    const headers = [
      'Pedido',
      'Data',
      'Cliente',
      'Telefone',
      'Modalidade',
      'Pagamento',
      'Total',
      'Status',
    ];
    const csvRows = [
      headers.join(';'),
      ...dataFiltered.map((r) => {
        const badge = getFulfillmentLabel(r.fulfillmentStatus, r.deliveryType);
        return [
          `"${r.code || r.id}"`,
          `"${r.createdAt ? fDateTime(r.createdAt) : ''}"`,
          `"${r.customerName || ''}"`,
          `"${r.customerPhone || ''}"`,
          r.deliveryType === 'delivery' ? 'Entrega' : 'Retirada',
          r.paymentMethod.toUpperCase(),
          r.total.toFixed(2),
          `"${badge.label}"`,
        ].join(';');
      }),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pedidos-online-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dataFiltered]);

  const clearOptimistic = useCallback((orderId: string) => {
    setOptimisticMap((prev) => {
      if (!(orderId in prev)) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  const handleAccept = useCallback(
    async (orderId: string) => {
      if (!enterpriseId) return;
      setBusyId(orderId);
      setOptimisticMap((prev) => ({ ...prev, [orderId]: 'accepted' }));
      try {
        const { saleId } = await acceptOnlineOrderCf(enterpriseId, orderId);
        toast.success(t('onlineOrders.acceptSuccess'));
        if (autoPrintOnAccept && saleId) {
          openReceiptForSaleId(saleId, true);
        }
      } catch (error) {
        clearOptimistic(orderId);
        toast.error(getFirebaseErrorMessage(error, t('onlineOrders.acceptError')));
      } finally {
        setBusyId(null);
      }
    },
    [autoPrintOnAccept, clearOptimistic, enterpriseId, openReceiptForSaleId, t]
  );

  const handleAcceptAndPrepare = useCallback(
    async (orderId: string) => {
      if (!enterpriseId) return;
      setBusyId(orderId);
      setOptimisticMap((prev) => ({ ...prev, [orderId]: 'preparing' }));
      try {
        const { saleId } = await acceptOnlineOrderCf(enterpriseId, orderId);
        await updateOnlineOrderStatusCf(enterpriseId, orderId, 'preparing');
        toast.success(t('onlineOrders.acceptSuccess'));
        if (autoPrintOnAccept && saleId) {
          openReceiptForSaleId(saleId, true);
        }
      } catch (error) {
        clearOptimistic(orderId);
        toast.error(getFirebaseErrorMessage(error, t('onlineOrders.acceptError')));
      } finally {
        setBusyId(null);
      }
    },
    [autoPrintOnAccept, clearOptimistic, enterpriseId, openReceiptForSaleId, t]
  );

  const handleConfirmReject = useCallback(
    async (reason?: string) => {
      if (!enterpriseId || !rejectTarget) return;
      const orderId = rejectTarget.id;
      setBusyId(orderId);
      try {
        await rejectOnlineOrderCf(enterpriseId, orderId, reason);
        toast.success(t('onlineOrders.rejectSuccess'));
        setRejectTarget(null);
        if (selectedOrderId === orderId) {
          setSelectedOrderId(null);
        }
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, t('onlineOrders.rejectError')));
      } finally {
        setBusyId(null);
      }
    },
    [enterpriseId, rejectTarget, selectedOrderId, t]
  );

  const handleChangeStatus = useCallback(
    async (
      orderId: string,
      nextStatus: 'accepted' | 'preparing' | 'out_for_delivery' | 'delivered'
    ) => {
      if (!enterpriseId) return;
      setBusyId(orderId);
      setOptimisticMap((prev) => ({ ...prev, [orderId]: nextStatus }));
      try {
        await updateOnlineOrderStatusCf(enterpriseId, orderId, nextStatus);
        toast.success('Status do pedido atualizado!');
      } catch (error) {
        clearOptimistic(orderId);
        toast.error(getFirebaseErrorMessage(error, 'Erro ao atualizar status do pedido'));
      } finally {
        setBusyId(null);
      }
    },
    [clearOptimistic, enterpriseId]
  );

  const handleSaveInternalNotes = useCallback(
    async (orderId: string, notes: string) => {
      if (!enterpriseId) return;
      try {
        await updateOnlineOrderInternalNotes(enterpriseId, orderId, notes);
        toast.success(t('onlineOrders.kanban.drawer.internalNotesSaved'));
      } catch (error) {
        toast.error(
          getFirebaseErrorMessage(error, t('onlineOrders.kanban.drawer.internalNotesError'))
        );
      }
    },
    [enterpriseId, t]
  );

  const selectedPendingIds = useMemo(
    () =>
      table.selected.filter((id) => {
        const item = rows.find((r) => r.id === id);
        return item?.status === 'pending';
      }),
    [rows, table.selected]
  );

  const handleConfirmBulkReject = useCallback(async () => {
    if (!enterpriseId || !selectedPendingIds.length) return;
    try {
      await Promise.all(selectedPendingIds.map((id) => rejectOnlineOrderCf(enterpriseId, id)));
      toast.success(`${selectedPendingIds.length} pedido(s) recusado(s).`);
      table.onSelectAllRows(false, []);
      confirmBulkReject.onFalse();
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, t('onlineOrders.rejectError')));
    }
  }, [enterpriseId, selectedPendingIds, table, confirmBulkReject, t]);

  const TABS: Array<{
    value: StatusTab;
    label: string;
    color: 'default' | 'warning' | 'success' | 'error';
    count: number;
  }> = [
    { value: 'all', label: t('onlineOrders.tabs.all'), color: 'default', count: rows.length },
    {
      value: 'pending',
      label: t('onlineOrders.tabs.pending'),
      color: 'warning',
      count: pendingRows.length,
    },
    {
      value: 'accepted',
      label: t('onlineOrders.tabs.accepted'),
      color: 'success',
      count: acceptedRows.length,
    },
    {
      value: 'rejected',
      label: t('onlineOrders.tabs.rejected'),
      color: 'error',
      count: rejectedRows.length,
    },
  ];

  const notFound = !loading && dataFiltered.length === 0;

  return (
    <DashboardContent maxWidth={viewMode === 'kanban' ? false : 'lg'}>
      <CustomBreadcrumbs
        heading={t('onlineOrders.heading')}
        links={[
          { name: t('nav.dashboard', { defaultValue: 'Dashboard' }), href: paths.dashboard.root },
          { name: t('nav.pos'), href: paths.dashboard.pos.root },
          { name: t('onlineOrders.heading') },
        ]}
        action={
          <ToggleButtonGroup
            size="small"
            exclusive
            value={viewMode}
            onChange={handleChangeViewMode}
            aria-label="Modo de visualização"
          >
            <ToggleButton value="kanban" sx={{ px: 1.5, gap: 0.75 }}>
              <Iconify icon="solar:widget-5-bold-duotone" width={18} />
              {t('onlineOrders.kanban.viewKanban')}
            </ToggleButton>
            <ToggleButton value="list" sx={{ px: 1.5, gap: 0.75 }}>
              <Iconify icon="solar:list-bold-duotone" width={18} />
              {t('onlineOrders.kanban.viewList')}
            </ToggleButton>
          </ToggleButtonGroup>
        }
        sx={{ mb: { xs: 2.5, md: 3 } }}
      />

      {!enterpriseId ? (
        <EmptyContent
          filled
          title={t('common.noEnterprise', { defaultValue: 'Nenhuma empresa vinculada' })}
        />
      ) : viewMode === 'kanban' ? (
        <Stack spacing={2.5}>
          {/* Compact Operational Control Bar */}
          <Card sx={{ p: 2 }}>
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', lg: 'center' }}
              justifyContent="space-between"
            >
              {/* Search + Delivery Quick Filter */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                sx={{ flex: 1 }}
              >
                <TextField
                  size="small"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por código, cliente ou telefone..."
                  sx={{ minWidth: { sm: 260 }, maxWidth: { sm: 340 } }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
                      </InputAdornment>
                    ),
                    endAdornment: searchQuery ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSearchQuery('')}>
                          <Iconify icon="mingcute:close-line" width={16} />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  }}
                />

                <ToggleButtonGroup
                  size="small"
                  value={deliveryFilters}
                  onChange={(_, next: string[]) => setDeliveryFilters(next)}
                >
                  <ToggleButton value="delivery" sx={{ px: 1.25, gap: 0.5 }}>
                    <Iconify icon="solar:scooter-bold" width={16} />
                    {t('onlineOrders.kanban.delivery')}
                  </ToggleButton>
                  <ToggleButton value="pickup" sx={{ px: 1.25, gap: 0.5 }}>
                    <Iconify icon="solar:shop-bold" width={16} />
                    {t('onlineOrders.kanban.pickup')}
                  </ToggleButton>
                  <ToggleButton value="table" sx={{ px: 1.25, gap: 0.5 }}>
                    <Iconify icon="solar:plate-bold" width={16} />
                    Mesa
                  </ToggleButton>
                </ToggleButtonGroup>

                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={kanbanPeriod}
                  onChange={(_, next: KanbanPeriodFilter | null) => {
                    if (next) setKanbanPeriod(next);
                  }}
                >
                  <ToggleButton value="today" sx={{ px: 1.25 }}>
                    {t('onlineOrders.kanban.periodToday')}
                  </ToggleButton>
                  <ToggleButton value="7d" sx={{ px: 1.25 }}>
                    {t('onlineOrders.kanban.period7d')}
                  </ToggleButton>
                  <ToggleButton value="all" sx={{ px: 1.25 }}>
                    {t('onlineOrders.kanban.periodAll')}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>

              {/* Switches (Auto-print + Fixed Columns) */}
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                justifyContent={{ xs: 'space-between', lg: 'flex-end' }}
                flexWrap="wrap"
              >
                <FormControlLabel
                  label={t('onlineOrders.kanban.autoPrintOnAccept')}
                  labelPlacement="start"
                  sx={{ m: 0, '& .MuiFormControlLabel-label': { typography: 'body2' } }}
                  control={
                    <Switch
                      size="small"
                      checked={autoPrintOnAccept}
                      onChange={(e) => handleToggleAutoPrint(e.target.checked)}
                    />
                  }
                />

                <FormControlLabel
                  label={t('onlineOrders.kanban.columnFixed')}
                  labelPlacement="start"
                  sx={{ m: 0, '& .MuiFormControlLabel-label': { typography: 'body2' } }}
                  control={
                    <Switch
                      size="small"
                      checked={columnFixed}
                      onChange={(e) => setColumnFixed(e.target.checked)}
                    />
                  }
                />
              </Stack>
            </Stack>
          </Card>

          {/* Kanban Board */}
          <OnlineOrderKanbanBoard
            orders={kanbanOrders}
            loading={loading}
            columnFixed={columnFixed}
            estimatedMinutes={estimatedMinutes}
            nowMs={nowMs}
            busyId={busyId}
            optimisticMap={optimisticMap}
            onOpenDetails={(order) => setSelectedOrderId(order.id)}
            onAccept={handleAccept}
            onAcceptAndPrepare={handleAcceptAndPrepare}
            onRequestReject={(order) => setRejectTarget(order)}
            onChangeStatus={handleChangeStatus}
            onPrintReceipt={handlePrintReceipt}
          />
        </Stack>
      ) : (
        <Card>
          {/* 1. Analytics Strip — 4 Indicadores Rápidos (Padrão /dashboard/pos/sales) */}
          <Scrollbar sx={{ minHeight: 108 }}>
            <Stack
              direction="row"
              divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
              sx={{ py: 2.5 }}
            >
              <ErpTableAnalytic
                title="Total"
                primaryValue={fCurrency(totalAmount)}
                secondaryValue={`${rows.length} ${rows.length === 1 ? 'pedido' : 'pedidos'}`}
                percent={100}
                icon="solar:bill-list-bold-duotone"
                color={theme.vars.palette.info.main}
              />

              <ErpTableAnalytic
                title="Pendentes"
                primaryValue={fCurrency(pendingAmount)}
                secondaryValue={`${pendingRows.length} ${pendingRows.length === 1 ? 'pedido' : 'pedidos'}`}
                percent={getPercent(pendingRows.length)}
                icon="solar:clock-circle-bold-duotone"
                color={theme.vars.palette.warning.main}
              />

              <ErpTableAnalytic
                title="Aceitos"
                primaryValue={fCurrency(acceptedAmount)}
                secondaryValue={`${acceptedRows.length} ${acceptedRows.length === 1 ? 'pedido' : 'pedidos'}`}
                percent={getPercent(acceptedRows.length)}
                icon="solar:check-circle-bold-duotone"
                color={theme.vars.palette.primary.main}
              />

              <ErpTableAnalytic
                title="Finalizados"
                primaryValue={fCurrency(deliveredAmount)}
                secondaryValue={`${deliveredRows.length} ${deliveredRows.length === 1 ? 'pedido' : 'pedidos'}`}
                percent={getPercent(deliveredRows.length)}
                icon="solar:verified-check-bold-duotone"
                color={theme.vars.palette.success.main}
              />
            </Stack>
          </Scrollbar>

          <Divider />

          {/* 2. Status Tabs */}
          <Tabs
            value={statusTab}
            onChange={(_, value: StatusTab) => {
              setStatusTab(value);
              table.onResetPage();
            }}
            sx={{
              px: 2.5,
              boxShadow: `inset 0 -2px 0 0 ${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)}`,
            }}
          >
            {TABS.map((tab) => (
              <Tab
                key={tab.value}
                value={tab.value}
                label={tab.label}
                iconPosition="end"
                icon={
                  <Label
                    variant={tab.value === 'all' || tab.value === statusTab ? 'filled' : 'soft'}
                    color={tab.color}
                  >
                    {tab.count}
                  </Label>
                }
              />
            ))}
          </Tabs>

          {/* 3. Toolbar Padrão ERP */}
          <ErpTableToolbar
            searchQuery={searchQuery}
            onSearchChange={(e) => {
              setSearchQuery(e.target.value);
              table.onResetPage();
            }}
            searchPlaceholder="Buscar por código, cliente ou telefone..."
            onResetPage={table.onResetPage}
            selectFilters={[
              {
                id: 'deliveryType',
                label: 'Modalidade',
                options: DELIVERY_OPTIONS,
                value: deliveryFilters,
                onChange: setDeliveryFilters,
              },
              {
                id: 'paymentMethod',
                label: 'Pagamento',
                options: PAYMENT_OPTIONS,
                value: paymentFilters,
                onChange: setPaymentFilters,
              },
            ]}
            columns={TABLE_HEAD.filter((c) => c.id !== 'actions')}
            visibleColumns={visibleColumns}
            onToggleColumn={handleToggleColumn}
            onResetColumns={handleResetColumns}
            onExportCsv={handleExportCsv}
            onPrint={() => window.print()}
            filteredResults={dataFiltered.length}
          />

          {/* 4. Tabela Padrão ERP */}
          <TableContainer sx={{ position: 'relative', overflow: 'unset' }}>
            <TableSelectedAction
              dense={table.dense}
              numSelected={table.selected.length}
              rowCount={dataFiltered.length}
              onSelectAllRows={(checked) =>
                table.onSelectAllRows(
                  checked,
                  dataFiltered.map((row) => row.id)
                )
              }
              action={
                selectedPendingIds.length > 0 ? (
                  <Tooltip title="Recusar pedidos pendentes selecionados">
                    <IconButton color="error" onClick={confirmBulkReject.onTrue}>
                      <Iconify icon="solar:close-circle-bold" />
                    </IconButton>
                  </Tooltip>
                ) : null
              }
            />

            <Scrollbar>
              <Table size={table.dense ? 'small' : 'medium'} sx={{ minWidth: 960 }}>
                <TableHeadCustom
                  order={table.order}
                  orderBy={table.orderBy}
                  headLabel={visibleHeadLabel}
                  rowCount={dataFiltered.length}
                  numSelected={table.selected.length}
                  onSort={table.onSort}
                  onSelectAllRows={(checked) =>
                    table.onSelectAllRows(
                      checked,
                      dataFiltered.map((row) => row.id)
                    )
                  }
                />

                <TableBody>
                  {loading ? (
                    [...Array(5)].map((_, idx) => <TableSkeleton key={idx} />)
                  ) : (
                    <>
                      {pageRows.map((row) => (
                        <OnlineOrderTableRow
                          key={row.id}
                          row={row}
                          selected={table.selected.includes(row.id)}
                          onSelectRow={() => table.onSelectRow(row.id)}
                          busy={busyId === row.id}
                          onAccept={() => handleAccept(row.id)}
                          onReject={() => setRejectTarget(row)}
                          onChangeStatus={(next) => handleChangeStatus(row.id, next)}
                          visibleColumns={visibleColumns}
                        />
                      ))}

                      <TableEmptyRows
                        height={table.dense ? 56 : 76}
                        emptyRows={emptyRows(table.page, table.rowsPerPage, dataFiltered.length)}
                      />

                      <TableNoData notFound={notFound} />
                    </>
                  )}
                </TableBody>
              </Table>
            </Scrollbar>
          </TableContainer>

          <TablePaginationCustom
            page={table.page}
            dense={table.dense}
            count={dataFiltered.length}
            rowsPerPage={table.rowsPerPage}
            onPageChange={table.onChangePage}
            onChangeDense={table.onChangeDense}
            onRowsPerPageChange={table.onChangeRowsPerPage}
          />
        </Card>
      )}

      {/* Drawer Lateral de Detalhes do Pedido */}
      <OnlineOrderDetailsDrawer
        order={selectedOrder}
        open={Boolean(selectedOrder)}
        busy={Boolean(selectedOrder && busyId === selectedOrder.id)}
        estimatedMinutes={estimatedMinutes}
        nowMs={nowMs}
        onClose={() => setSelectedOrderId(null)}
        onAccept={handleAccept}
        onRequestReject={(order) => setRejectTarget(order)}
        onChangeStatus={handleChangeStatus}
        onPrintReceipt={handlePrintReceipt}
        onSaveInternalNotes={handleSaveInternalNotes}
      />

      {/* Modal de Recusa com Motivo */}
      <OnlineOrderRejectDialog
        open={Boolean(rejectTarget)}
        order={rejectTarget}
        busy={Boolean(rejectTarget && busyId === rejectTarget.id)}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleConfirmReject}
      />

      {/* Modal de Impressão da Comanda (ReceiptDialog) */}
      {receiptSale && (
        <ReceiptDialog
          open={Boolean(receiptSale)}
          onClose={() => {
            setReceiptSale(null);
            setReceiptAutoPrint(false);
          }}
          sale={receiptSale}
          enterprise={enterprise}
          autoPrint={receiptAutoPrint}
          onAutoPrintDone={() => setReceiptAutoPrint(false)}
        />
      )}

      <ConfirmDialog
        open={confirmBulkReject.value}
        onClose={confirmBulkReject.onFalse}
        title="Recusar pedidos selecionados"
        content={`Tem certeza que deseja recusar ${selectedPendingIds.length} pedido(s) pendente(s)?`}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmBulkReject}>
            Recusar pedidos
          </Button>
        }
      />
    </DashboardContent>
  );
}

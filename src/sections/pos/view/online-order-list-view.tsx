import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import TableBody from '@mui/material/TableBody';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import TableContainer from '@mui/material/TableContainer';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  acceptOnlineOrderCf,
  rejectOnlineOrderCf,
  subscribeOnlineOrders,
  updateOnlineOrderStatusCf,
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

import { OnlineOrderTableRow } from '../online-order-table-row';

// ----------------------------------------------------------------------

type StatusTab = 'all' | 'pending' | 'accepted' | 'rejected';

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
];

const PAYMENT_OPTIONS = [
  { value: 'pix', label: 'PIX' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
];

// ----------------------------------------------------------------------

export function OnlineOrderListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const router = useRouter();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });
  const { user } = useAuthContext();
  const confirmBulkReject = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OnlineOrder[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveryFilters, setDeliveryFilters] = useState<string[]>([]);
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  // Filtragem e ordenação
  const dataFiltered = useMemo(() => {
    let filtered = rows;

    if (statusTab !== 'all') {
      filtered = filtered.filter((r) =>
        statusTab === 'rejected'
          ? r.status === 'rejected' || r.status === 'cancelled'
          : r.status === statusTab
      );
    }

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
  }, [rows, statusTab, deliveryFilters, paymentFilters, searchQuery, table.order, table.orderBy]);

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
    const headers = ['Pedido', 'Data', 'Cliente', 'Telefone', 'Modalidade', 'Pagamento', 'Total', 'Status'];
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

  const handleAccept = useCallback(
    async (orderId: string) => {
      if (!enterpriseId) return;
      setBusyId(orderId);
      try {
        const { saleId } = await acceptOnlineOrderCf(enterpriseId, orderId);
        toast.success(t('onlineOrders.acceptSuccess'));
        router.push(paths.dashboard.pos.saleDetails(saleId));
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, t('onlineOrders.acceptError')));
      } finally {
        setBusyId(null);
      }
    },
    [enterpriseId, router, t]
  );

  const handleReject = useCallback(
    async (orderId: string) => {
      if (!enterpriseId) return;
      setBusyId(orderId);
      try {
        await rejectOnlineOrderCf(enterpriseId, orderId);
        toast.success(t('onlineOrders.rejectSuccess'));
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, t('onlineOrders.rejectError')));
      } finally {
        setBusyId(null);
      }
    },
    [enterpriseId, t]
  );

  const handleChangeStatus = useCallback(
    async (
      orderId: string,
      nextStatus: 'accepted' | 'preparing' | 'out_for_delivery' | 'delivered'
    ) => {
      if (!enterpriseId) return;
      setBusyId(orderId);
      try {
        await updateOnlineOrderStatusCf(enterpriseId, orderId, nextStatus);
        toast.success('Status do pedido atualizado!');
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Erro ao atualizar status do pedido'));
      } finally {
        setBusyId(null);
      }
    },
    [enterpriseId]
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
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('onlineOrders.heading')}
        links={[
          { name: t('nav.dashboard', { defaultValue: 'Dashboard' }), href: paths.dashboard.root },
          { name: t('nav.pos'), href: paths.dashboard.pos.root },
          { name: t('onlineOrders.heading') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      {!enterpriseId ? (
        <EmptyContent
          filled
          title={t('common.noEnterprise', { defaultValue: 'Nenhuma empresa vinculada' })}
        />
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
                          onReject={() => handleReject(row.id)}
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

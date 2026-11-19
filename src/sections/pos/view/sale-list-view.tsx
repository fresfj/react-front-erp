import type { Sale } from 'src/api/firestore/sales';

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
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import { listSales, cancelSale } from 'src/api/firestore/sales';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
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

import { useAuthContext } from 'src/auth/hooks';

import { SaleAnalytic } from '../sale-analytic';
import { SaleTableRow } from '../sale-table-row';
import { SaleTableToolbar } from '../sale-table-toolbar';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'createdAt', label: 'Venda / Data', minWidth: 180, hideable: false },
  { id: 'customerName', label: 'Cliente', minWidth: 180 },
  { id: 'channel', label: 'Origem', width: 170 },
  { id: 'total', label: 'Total', width: 130, align: 'right' },
  { id: 'totalCost', label: 'Custo CMV', width: 130, align: 'right' },
  { id: 'grossProfit', label: 'Lucro Bruto', width: 130, align: 'right' },
  { id: 'payments', label: 'Forma Pgto', width: 150 },
  { id: 'status', label: 'Status', width: 130 },
  { id: 'actions', label: '', width: 80, align: 'right', hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  createdAt: true,
  customerName: true,
  channel: true,
  total: true,
  totalCost: true,
  grossProfit: true,
  payments: true,
  status: true,
  actions: true,
};

const NFCE_STATUS_OPTIONS = [
  { value: 'authorized', label: 'NFC-e Autorizada' },
  { value: 'pending', label: 'NFC-e Pendente' },
  { value: 'cancelled', label: 'NFC-e Cancelada' },
];

export function SaleListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });
  const { user } = useAuthContext();
  const confirm = useBoolean();
  const confirmMultiple = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const canCancel = user?.role !== 'operador';

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Sale[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [paymentFilters, setPaymentFilters] = useState<string[]>([]);
  const [nfceFilters, setNfceFilters] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);

  const paymentMethodOptions = useMemo(
    () => [
      { value: 'cash', label: t('pos.paymentMethods.cash', { defaultValue: 'Dinheiro' }) },
      { value: 'pix', label: t('pos.paymentMethods.pix', { defaultValue: 'PIX' }) },
      {
        value: 'credit_card',
        label: t('pos.paymentMethods.credit_card', { defaultValue: 'Cartão de Crédito' }),
      },
      {
        value: 'debit_card',
        label: t('pos.paymentMethods.debit_card', { defaultValue: 'Cartão de Débito' }),
      },
      {
        value: 'store_credit',
        label: t('pos.paymentMethods.store_credit', { defaultValue: 'Vale-Troca' }),
      },
      {
        value: 'credit_tab',
        label: t('pos.paymentMethods.credit_tab', { defaultValue: 'Crediário / Fiado' }),
      },
    ],
    [t]
  );

  const loadSales = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listSales(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('pos.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  // KPIs
  const completedSales = useMemo(
    () => tableData.filter((s) => s.status === 'completed'),
    [tableData]
  );
  const cancelledSales = useMemo(
    () => tableData.filter((s) => s.status === 'cancelled'),
    [tableData]
  );

  const totalRevenue = useMemo(
    () => completedSales.reduce((acc, curr) => acc + (curr.total || 0), 0),
    [completedSales]
  );
  const totalProfit = useMemo(
    () => completedSales.reduce((acc, curr) => acc + (curr.grossProfit || 0), 0),
    [completedSales]
  );
  const averageTicket = useMemo(
    () => (completedSales.length ? totalRevenue / completedSales.length : 0),
    [completedSales.length, totalRevenue]
  );
  const profitMargin = useMemo(
    () => (totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0),
    [totalProfit, totalRevenue]
  );

  const percentCompleted = tableData.length
    ? Math.round((completedSales.length / tableData.length) * 100)
    : 0;
  const percentCancelled = tableData.length
    ? Math.round((cancelledSales.length / tableData.length) * 100)
    : 0;

  const TABS = [
    { value: 'all', label: 'Todas', color: 'default', count: tableData.length },
    { value: 'completed', label: 'Concluídas', color: 'success', count: completedSales.length },
    { value: 'cancelled', label: 'Canceladas', color: 'error', count: cancelledSales.length },
  ] as const;

  const dataFiltered = useMemo(() => {
    let rows = [...tableData];

    const comparator = getComparator(table.order, table.orderBy) as (a: any, b: any) => number;
    const stabilizedThis = rows.map(
      (el, index) =>
        [
          {
            ...el,
            customerName: el.customerName || 'Consumidor Final',
          },
          index,
          el,
        ] as const
    );
    stabilizedThis.sort((a, b) => {
      const order = comparator(a[0], b[0]);
      if (order !== 0) return order;
      return a[1] - b[1];
    });
    rows = stabilizedThis.map((el) => el[2]);

    if (currentTab !== 'all') {
      rows = rows.filter((row) => row.status === currentTab);
    }

    if (paymentFilters.length > 0) {
      rows = rows.filter((row) => row.payments?.some((p) => paymentFilters.includes(p.method)));
    }

    if (nfceFilters.length > 0) {
      rows = rows.filter((row) => nfceFilters.includes(row.nfceStatus || 'pending'));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (row) =>
          row.code?.toLowerCase().includes(q) ||
          row.id?.toLowerCase().includes(q) ||
          row.customerName?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [
    tableData,
    table.order,
    table.orderBy,
    currentTab,
    paymentFilters,
    nfceFilters,
    searchQuery,
  ]);

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
      'Venda',
      'Data',
      'Cliente',
      'Origem',
      'Operador',
      'Total',
      'Custo CMV',
      'Lucro Bruto',
      'Forma Pgto',
      'Status',
    ];
    const csvRows = [
      headers.join(';'),
      ...dataFiltered.map((r) =>
        [
          `"${r.code || r.id}"`,
          `"${r.createdAt ? fDateTime(r.createdAt) : ''}"`,
          `"${r.customerName || 'Consumidor Final'}"`,
          r.channel === 'online' || r.onlineOrderId ? 'Loja Online' : 'PDV',
          `"${r.sellerEmail || ''}"`,
          r.total.toFixed(2),
          r.totalCost.toFixed(2),
          (r.grossProfit || 0).toFixed(2),
          `"${r.payments?.map((p) => p.method.toUpperCase()).join(', ') || ''}"`,
          r.status === 'completed' ? 'Concluída' : 'Cancelada',
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendas-pdv-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dataFiltered]);

  const handleAskCancel = useCallback(
    (sale: Sale) => {
      setCancelTarget(sale);
      confirm.onTrue();
    },
    [confirm]
  );

  const handleConfirmCancel = useCallback(async () => {
    if (!enterpriseId || !cancelTarget || !canCancel) return;

    try {
      await cancelSale(enterpriseId, cancelTarget);
      toast.success(t('pos.cancelSuccess'));
      setCancelTarget(null);
      confirm.onFalse();
      await loadSales();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('pos.cancelError')));
    }
  }, [canCancel, cancelTarget, confirm, enterpriseId, loadSales, t]);

  const handleConfirmCancelMultiple = useCallback(async () => {
    if (!enterpriseId || !table.selected.length || !canCancel) return;

    try {
      const targets = tableData.filter(
        (s) => table.selected.includes(s.id) && s.status === 'completed'
      );
      if (targets.length > 0) {
        await Promise.all(targets.map((s) => cancelSale(enterpriseId, s)));
      }
      toast.success(
        targets.length > 0
          ? `${targets.length} venda(s) cancelada(s) e estoque estornado com sucesso!`
          : 'As vendas selecionadas já estavam canceladas.'
      );
      table.onSelectAllRows(false, []);
      confirmMultiple.onFalse();
      await loadSales();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('pos.cancelError')));
    }
  }, [canCancel, confirmMultiple, enterpriseId, loadSales, t, table, tableData]);

  const notFound = !dataFiltered.length && !loading;

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('pos.salesHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.pos'), href: paths.dashboard.pos.root },
            { name: t('pos.salesHeading') },
          ]}
          action={
            <Button
              component={RouterLink}
              href={paths.dashboard.pos.root}
              variant="contained"
              startIcon={<Iconify icon="solar:cart-plus-bold" />}
            >
              {t('pos.openPos')}
            </Button>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('pos.errorMissingEnterprise')}
            sx={{ py: 10 }}
          />
        )}

        {enterpriseId && (
          <Card>
            {/* Analytics Strip integrado no topo do Card da tabela com largura padronizada */}
            <Scrollbar sx={{ minHeight: 108 }}>
              <Stack
                direction="row"
                divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
                sx={{ py: 2.5 }}
              >

                <SaleAnalytic
                  title="Concluídas"
                  primaryValue={fCurrency(totalRevenue)}
                  secondaryValue={`${completedSales.length} concluídas (${percentCompleted}%)`}
                  percent={percentCompleted}
                  icon="solar:check-circle-bold-duotone"
                  color={theme.vars.palette.success.main}
                />

                <SaleAnalytic
                  title="Lucro Bruto"
                  primaryValue={fCurrency(totalProfit)}
                  secondaryValue={`Margem média de ${profitMargin.toFixed(1)}%`}
                  percent={Math.max(0, Math.min(100, Math.round(profitMargin)))}
                  icon="solar:wallet-money-bold-duotone"
                  color={theme.vars.palette.warning.main}
                />

                <SaleAnalytic
                  title="Ticket Médio"
                  primaryValue={fCurrency(averageTicket)}
                  secondaryValue={`Em ${completedSales.length} vendas concluídas`}
                  percent={100}
                  icon="solar:tag-price-bold-duotone"
                  color={theme.vars.palette.primary.main}
                />

                <SaleAnalytic
                  title="Canceladas"
                  primaryValue={`${cancelledSales.length} canceladas`}
                  secondaryValue={`${percentCancelled}% do total`}
                  percent={percentCancelled}
                  icon="solar:close-circle-bold-duotone"
                  color={theme.vars.palette.error.main}
                />
              </Stack>
            </Scrollbar>

            <Divider />

            {/* Status Tabs */}
            <Tabs
              value={currentTab}
              onChange={(_e, val) => {
                table.onResetPage();
                setCurrentTab(val);
              }}
              sx={{
                px: 2.5,
                boxShadow: (th) =>
                  `inset 0 -2px 0 0 ${varAlpha(th.vars.palette.grey['500Channel'], 0.08)}`,
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
                      variant={
                        ((tab.value === 'all' || tab.value === currentTab) && 'filled') || 'soft'
                      }
                      color={tab.color}
                    >
                      {tab.count}
                    </Label>
                  }
                />
              ))}
            </Tabs>

            <SaleTableToolbar
              searchQuery={searchQuery}
              onSearchChange={(e) => setSearchQuery(e.target.value)}
              onResetPage={table.onResetPage}
              paymentOptions={paymentMethodOptions}
              selectedPayments={paymentFilters}
              onChangePayments={setPaymentFilters}
              nfceOptions={NFCE_STATUS_OPTIONS}
              selectedNfce={nfceFilters}
              onChangeNfce={setNfceFilters}
              columns={TABLE_HEAD}
              visibleColumns={visibleColumns}
              onToggleColumn={handleToggleColumn}
              onResetColumns={handleResetColumns}
              onExportCsv={handleExportCsv}
              filteredResults={dataFiltered.length}
            />

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
                  canCancel ? (
                    <Tooltip title="Cancelar vendas selecionadas">
                      <IconButton color="error" onClick={confirmMultiple.onTrue}>
                        <Iconify icon="solar:trash-bin-trash-bold" />
                      </IconButton>
                    </Tooltip>
                  ) : undefined
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
                      [...Array(table.rowsPerPage)].map((_, index) => (
                        <TableSkeleton key={index} sx={{ height: table.dense ? 56 : 76 }} />
                      ))
                    ) : (
                      <>
                        {dataFiltered
                          .slice(
                            table.page * table.rowsPerPage,
                            table.page * table.rowsPerPage + table.rowsPerPage
                          )
                          .map((row) => (
                            <SaleTableRow
                              key={row.id}
                              row={row}
                              selected={table.selected.includes(row.id)}
                              onSelectRow={() => table.onSelectRow(row.id)}
                              canCancel={canCancel}
                              onCancel={() => handleAskCancel(row)}
                              visibleColumns={visibleColumns}
                            />
                          ))}

                        <TableEmptyRows
                          height={table.dense ? 56 : 76}
                          emptyRows={emptyRows(
                            table.page,
                            table.rowsPerPage,
                            dataFiltered.length
                          )}
                        />

                        <TableNoData notFound={notFound} />
                      </>
                    )}
                  </TableBody>
                </Table>
              </Scrollbar>
            </TableContainer>

            <TablePaginationCustom
              count={dataFiltered.length}
              page={table.page}
              rowsPerPage={table.rowsPerPage}
              onPageChange={table.onChangePage}
              onRowsPerPageChange={table.onChangeRowsPerPage}
              dense={table.dense}
              onChangeDense={table.onChangeDense}
            />
          </Card>
        )}
      </DashboardContent>

      <ConfirmDialog
        open={confirm.value}
        onClose={() => {
          setCancelTarget(null);
          confirm.onFalse();
        }}
        title={t('pos.cancelSale', { defaultValue: 'Cancelar / Estornar venda' })}
        content={t('pos.cancelConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmCancel}>
            {t('pos.cancelSale', { defaultValue: 'Cancelar venda' })}
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmMultiple.value}
        onClose={confirmMultiple.onFalse}
        title="Cancelar Vendas Selecionadas"
        content={
          <>
            Tem certeza de que deseja cancelar as <strong>{table.selected.length}</strong> vendas
            selecionadas e estornar as movimentações de estoque?
          </>
        }
        action={
          <Button variant="contained" color="error" onClick={handleConfirmCancelMultiple}>
            Cancelar Selecionadas
          </Button>
        }
      />
    </>
  );
}

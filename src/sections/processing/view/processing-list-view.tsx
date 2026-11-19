import type { ProcessingOrder } from 'src/api/firestore/processing-orders';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import TableBody from '@mui/material/TableBody';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import TableContainer from '@mui/material/TableContainer';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  listProcessingOrders,
  cancelProcessingOrder,
} from 'src/api/firestore/processing-orders';

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

import { useAuthContext } from 'src/auth/hooks';

import { ProcessingTableRow } from '../processing-table-row';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'code', label: 'Ordem / Matéria-prima', hideable: false },
  { id: 'createdAt', label: 'Data / Hora' },
  { id: 'rawQtyUsed', label: 'Insumo Consumido' },
  { id: 'outputs', label: 'Produtos Gerados' },
  { id: 'totalCost', label: 'Custo Rateado' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: '', width: 88, hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  code: true,
  createdAt: true,
  rawQtyUsed: true,
  outputs: true,
  totalCost: true,
  status: true,
  actions: true,
};

// ----------------------------------------------------------------------

export function ProcessingListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuthContext();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });
  const confirmMultiple = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<ProcessingOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [rawProductFilters, setRawProductFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);

  const loadOrders = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listProcessingOrders(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('processing.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleCancelRow = useCallback(
    async (order: ProcessingOrder) => {
      if (!enterpriseId) return;
      try {
        await cancelProcessingOrder(enterpriseId, order);
        toast.success(t('processing.cancelSuccess'));
        await loadOrders();
      } catch (error) {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, t('processing.cancelError')));
      }
    },
    [enterpriseId, loadOrders, t]
  );

  const handleConfirmCancelMultiple = useCallback(async () => {
    if (!enterpriseId || !table.selected.length) return;
    try {
      const targets = tableData.filter(
        (r) => table.selected.includes(r.id) && r.status === 'completed'
      );
      if (targets.length > 0) {
        await Promise.all(targets.map((r) => cancelProcessingOrder(enterpriseId, r)));
      }
      toast.success(
        targets.length > 0
          ? `${targets.length} ordem(ns) cancelada(s) com sucesso!`
          : 'As ordens selecionadas já estavam canceladas.'
      );
      table.onSelectAllRows(false, []);
      confirmMultiple.onFalse();
      await loadOrders();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('processing.cancelError')));
    }
  }, [confirmMultiple, enterpriseId, loadOrders, t, table, tableData]);

  const rawProductOptions = useMemo(() => {
    const names = Array.from(
      new Set(tableData.map((r) => r.rawProductName).filter(Boolean))
    ) as string[];
    return names.map((n) => ({ value: n, label: n }));
  }, [tableData]);

  // Status Tabs Counts
  const completedOrders = useMemo(
    () => tableData.filter((row) => row.status === 'completed'),
    [tableData]
  );
  const cancelledOrders = useMemo(
    () => tableData.filter((row) => row.status === 'cancelled'),
    [tableData]
  );

  const totalCost = useMemo(
    () => tableData.reduce((sum, r) => sum + (r.totalCost || 0), 0),
    [tableData]
  );

  const totalRawInput = useMemo(
    () => tableData.reduce((sum, r) => sum + (r.rawQtyUsed || 0), 0),
    [tableData]
  );
  const totalOutputs = useMemo(
    () =>
      tableData.reduce(
        (sum, r) => sum + (r.outputs || []).reduce((acc, out) => acc + (out.qty || 0), 0),
        0
      ),
    [tableData]
  );
  const averageYield = totalRawInput > 0 ? (totalOutputs / totalRawInput) * 100 : 0;

  const TABS = [
    { value: 'all', label: 'Todas', color: 'default', count: tableData.length },
    { value: 'completed', label: 'Concluídas', color: 'success', count: completedOrders.length },
    { value: 'cancelled', label: 'Canceladas', color: 'error', count: cancelledOrders.length },
  ] as const;

  const dataFiltered = useMemo(() => {
    let rows = [...tableData];

    const comparator = getComparator(table.order, table.orderBy) as (a: any, b: any) => number;
    const stabilizedThis = rows.map((el, index) => [el, index] as const);
    stabilizedThis.sort((a, b) => {
      const order = comparator(a[0], b[0]);
      if (order !== 0) return order;
      return a[1] - b[1];
    });
    rows = stabilizedThis.map((el) => el[0]);

    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    if (rawProductFilters.length > 0) {
      rows = rows.filter((r) => rawProductFilters.includes(r.rawProductName || ''));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.code?.toLowerCase().includes(q) ||
          r.rawProductName?.toLowerCase().includes(q) ||
          r.rawLotCode?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [rawProductFilters, searchQuery, statusFilter, table.order, table.orderBy, tableData]);

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
    const headers = ['Ordem', 'Matéria-prima', 'Data', 'Insumo Consumido', 'Custo Rateado', 'Status'];
    const csvRows = [
      headers.join(';'),
      ...dataFiltered.map((r) =>
        [
          `"${r.code || ''}"`,
          `"${r.rawProductName || ''}"`,
          `"${r.createdAt ? fDateTime(r.createdAt) : ''}"`,
          `${r.rawQtyUsed} ${r.rawUnit || 'kg'}`,
          (r.totalCost || 0).toFixed(2),
          r.status === 'completed' ? 'Concluída' : 'Cancelada',
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `beneficiamento-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dataFiltered]);

  const notFound =
    !dataFiltered.length &&
    (!!searchQuery || statusFilter !== 'all' || rawProductFilters.length > 0);

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('processing.listHeading', { defaultValue: 'Beneficiamento de Produtos' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.processing'), href: paths.dashboard.processing.root },
            { name: t('processing.listHeading', { defaultValue: 'Ordens' }) },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                component={RouterLink}
                href={paths.dashboard.batches.list}
                variant="outlined"
                startIcon={<Iconify icon="solar:box-minimalistic-bold" />}
              >
                Ver Lotes Gerados
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.processing.create}
                variant="contained"
                startIcon={<Iconify icon="mingcute:add-line" />}
              >
                {t('processing.newOrder', { defaultValue: 'Nova Ordem' })}
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('processing.errorMissingEnterprise', {
              defaultValue: 'Empresa não selecionada',
            })}
            sx={{ py: 10 }}
          />
        )}

        {enterpriseId && (
          <Card>
            {/* 4 Indicadores Rápidos integrados no topo do Card da tabela */}
            <Scrollbar sx={{ minHeight: 108 }}>
              <Stack
                direction="row"
                divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
                sx={{ py: 2.5 }}
              >
                <ErpTableAnalytic
                  title="Ordens de Produção"
                  primaryValue={`${tableData.length} ordens`}
                  secondaryValue={`Custo Total: ${fCurrency(totalCost)}`}
                  percent={100}
                  icon="solar:settings-bold-duotone"
                  color={theme.vars.palette.primary.main}
                />

                <ErpTableAnalytic
                  title="Matéria-prima Consumida"
                  primaryValue={`${fNumber(totalRawInput)} kg`}
                  secondaryValue="Insumos Processados"
                  percent={
                    tableData.length
                      ? Math.round((completedOrders.length / tableData.length) * 100)
                      : 0
                  }
                  icon="solar:layers-bold-duotone"
                  color={theme.vars.palette.info.main}
                />

                <ErpTableAnalytic
                  title="Produtos Acabados"
                  primaryValue={`${fNumber(totalOutputs)} un`}
                  secondaryValue={`${completedOrders.length} ordens concluídas`}
                  percent={100}
                  icon="solar:box-minimalistic-bold-duotone"
                  color={theme.vars.palette.success.main}
                />

                <ErpTableAnalytic
                  title="Rendimento Médio"
                  primaryValue={`${averageYield.toFixed(1)}%`}
                  secondaryValue="Aproveitamento Industrial"
                  percent={Math.min(100, Math.round(averageYield))}
                  icon="solar:chart-2-bold-duotone"
                  color={theme.vars.palette.warning.main}
                />
              </Stack>
            </Scrollbar>

            <Divider />

            <Tabs
              value={statusFilter}
              onChange={(_, val) => {
                table.onResetPage();
                setStatusFilter(val);
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
                      variant={
                        ((tab.value === 'all' || tab.value === statusFilter) && 'filled') || 'soft'
                      }
                      color={tab.color}
                    >
                      {tab.count}
                    </Label>
                  }
                />
              ))}
            </Tabs>

            <ErpTableToolbar
              searchQuery={searchQuery}
              onSearchChange={(e) => setSearchQuery(e.target.value)}
              searchPlaceholder="Pesquisar por código da ordem, matéria-prima ou lote..."
              onResetPage={table.onResetPage}
              selectFilters={
                rawProductOptions.length > 0
                  ? [
                      {
                        id: 'rawProduct',
                        label: 'Matéria-prima',
                        options: rawProductOptions,
                        value: rawProductFilters,
                        onChange: setRawProductFilters,
                      },
                    ]
                  : []
              }
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
                  <Tooltip title="Cancelar ordens selecionadas">
                    <IconButton color="error" onClick={confirmMultiple.onTrue}>
                      <Iconify icon="solar:trash-bin-trash-bold" />
                    </IconButton>
                  </Tooltip>
                }
              />

              <Scrollbar>
                <Table size={table.dense ? 'small' : 'medium'} sx={{ minWidth: 800 }}>
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
                            <ProcessingTableRow
                              key={row.id}
                              row={row}
                              selected={table.selected.includes(row.id)}
                              onSelectRow={() => table.onSelectRow(row.id)}
                              onViewRow={() =>
                                router.push(paths.dashboard.processing.details(row.id))
                              }
                              onViewBatches={() => router.push(paths.dashboard.batches.list)}
                              onCancelRow={() => handleCancelRow(row)}
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
      </DashboardContent>

      <ConfirmDialog
        open={confirmMultiple.value}
        onClose={confirmMultiple.onFalse}
        title="Cancelar Ordens Selecionadas"
        content={`Tem certeza de que deseja cancelar as ${table.selected.length} ordens selecionadas e estornar o estoque consumido?`}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmCancelMultiple}>
            Cancelar Selecionadas
          </Button>
        }
      />
    </>
  );
}

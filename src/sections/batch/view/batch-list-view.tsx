import type { Batch } from 'src/api/firestore/batches';

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
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import { listBatches, deactivateBatch } from 'src/api/firestore/batches';

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

import { BatchTableRow } from '../batch-table-row';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'lotCode', label: 'Código do Lote / Produto', hideable: false },
  { id: 'productType', label: 'Tipo' },
  { id: 'initialQty', label: 'Qtd Inicial' },
  { id: 'remainingQty', label: 'Saldo Atual' },
  { id: 'unitCost', label: 'Custo Unitário' },
  { id: 'totalCost', label: 'Custo Total em Estoque' },
  { id: 'active', label: 'Status' },
  { id: 'createdAt', label: 'Data de Entrada' },
  { id: 'actions', label: '', width: 88, hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  lotCode: true,
  productType: true,
  initialQty: true,
  remainingQty: true,
  unitCost: true,
  totalCost: true,
  active: true,
  createdAt: true,
  actions: true,
};

const BATCH_TYPE_OPTIONS = [
  { value: 'raw', label: 'Matéria-prima' },
  { value: 'finished', label: 'Produto Acabado' },
];

const BATCH_STOCK_OPTIONS = [
  { value: 'available', label: 'Com Saldo (> 0)' },
  { value: 'empty', label: 'Esgotado (0)' },
];

// ----------------------------------------------------------------------

export function BatchListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const { user } = useAuthContext();
  const confirm = useBoolean();
  const confirmMultiple = useBoolean();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Batch[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'raw' | 'finished' | 'available' | 'inactive'
  >('all');
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [stockFilters, setStockFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listBatches(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('batches.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const handleAskDeactivate = useCallback(
    (id: string) => {
      setDeactivateId(id);
      confirm.onTrue();
    },
    [confirm]
  );

  const handleConfirmDeactivate = useCallback(async () => {
    if (!enterpriseId || !deactivateId) return;

    try {
      await deactivateBatch(enterpriseId, deactivateId);
      toast.success(t('batches.deactivateSuccess'));
      setDeactivateId(null);
      confirm.onFalse();
      await loadBatches();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('batches.deactivateError')));
    }
  }, [confirm, deactivateId, enterpriseId, loadBatches, t]);

  const handleConfirmDeactivateMultiple = useCallback(async () => {
    if (!enterpriseId || !table.selected.length) return;
    try {
      await Promise.all(table.selected.map((id) => deactivateBatch(enterpriseId, id)));
      toast.success(`${table.selected.length} lote(s) desativado(s) com sucesso!`);
      table.onSelectAllRows(false, []);
      confirmMultiple.onFalse();
      await loadBatches();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('batches.deactivateError')));
    }
  }, [confirmMultiple, enterpriseId, loadBatches, t, table]);

  const rawCount = useMemo(
    () => tableData.filter((r) => r.productType === 'raw').length,
    [tableData]
  );
  const finishedCount = useMemo(
    () => tableData.filter((r) => r.productType === 'finished').length,
    [tableData]
  );
  const availableCount = useMemo(
    () => tableData.filter((r) => r.remainingQty > 0 && r.active).length,
    [tableData]
  );
  const inactiveCount = useMemo(() => tableData.filter((r) => !r.active).length, [tableData]);
  const totalStockValue = useMemo(
    () =>
      tableData
        .filter((r) => r.active && r.remainingQty > 0)
        .reduce((sum, r) => sum + r.remainingQty * r.unitCost, 0),
    [tableData]
  );

  const TABS = [
    { value: 'all', label: 'Todos os Lotes', color: 'default', count: tableData.length },
    { value: 'raw', label: 'Matéria-prima', color: 'warning', count: rawCount },
    { value: 'finished', label: 'Produtos Acabados', color: 'primary', count: finishedCount },
    { value: 'available', label: 'Com Saldo Disponível', color: 'success', count: availableCount },
    { value: 'inactive', label: 'Inativos', color: 'default', count: inactiveCount },
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

    if (statusFilter === 'raw') {
      rows = rows.filter((r) => r.productType === 'raw');
    } else if (statusFilter === 'finished') {
      rows = rows.filter((r) => r.productType === 'finished');
    } else if (statusFilter === 'available') {
      rows = rows.filter((r) => r.remainingQty > 0 && r.active);
    } else if (statusFilter === 'inactive') {
      rows = rows.filter((r) => !r.active);
    }

    if (typeFilters.length > 0) {
      rows = rows.filter((r) => typeFilters.includes(r.productType));
    }

    if (stockFilters.length > 0) {
      rows = rows.filter(
        (r) =>
          (stockFilters.includes('available') && r.remainingQty > 0) ||
          (stockFilters.includes('empty') && r.remainingQty <= 0)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.lotCode?.toLowerCase().includes(q) ||
          r.productName?.toLowerCase().includes(q) ||
          r.supplierName?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [
    searchQuery,
    statusFilter,
    stockFilters,
    table.order,
    table.orderBy,
    tableData,
    typeFilters,
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
      'Lote',
      'Produto',
      'Tipo',
      'Qtd Inicial',
      'Saldo Atual',
      'Custo Unitário',
      'Custo Total',
      'Status',
      'Data Entrada',
    ];
    const csvRows = [
      headers.join(';'),
      ...dataFiltered.map((r) =>
        [
          `"${r.lotCode || ''}"`,
          `"${r.productName || ''}"`,
          r.productType === 'raw' ? 'Matéria-prima' : 'Produto Acabado',
          `${r.initialQty} ${r.unit || 'kg'}`,
          `${r.remainingQty} ${r.unit || 'kg'}`,
          r.unitCost.toFixed(2),
          (r.remainingQty * r.unitCost).toFixed(2),
          r.active ? 'Ativo' : 'Inativo',
          `"${r.createdAt ? fDateTime(r.createdAt) : ''}"`,
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lotes-estoque-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dataFiltered]);

  const notFound =
    !dataFiltered.length &&
    (!!searchQuery || statusFilter !== 'all' || typeFilters.length > 0 || stockFilters.length > 0);

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('batches.listHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.batches'), href: paths.dashboard.batches.root },
            { name: t('batches.listHeading') },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                component={RouterLink}
                href={paths.dashboard.batches.movements}
                variant="outlined"
                startIcon={<Iconify icon="solar:history-bold" />}
              >
                {t('batches.viewMovements')}
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.batches.create}
                variant="contained"
                startIcon={<Iconify icon="mingcute:add-line" />}
              >
                {t('batches.newBatch')}
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 4 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('batches.errorMissingEnterprise')}
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
                  title="Valor em Estoque"
                  primaryValue={fCurrency(totalStockValue)}
                  secondaryValue={`${availableCount} lotes com saldo`}
                  percent={
                    tableData.length ? Math.round((availableCount / tableData.length) * 100) : 0
                  }
                  icon="solar:wallet-money-bold-duotone"
                  color={theme.vars.palette.primary.main}
                />

                <ErpTableAnalytic
                  title="Lotes Matéria-prima"
                  primaryValue={`${rawCount} lotes`}
                  secondaryValue="Insumos p/ beneficiamento"
                  percent={tableData.length ? Math.round((rawCount / tableData.length) * 100) : 0}
                  icon="solar:layers-bold-duotone"
                  color={theme.vars.palette.warning.main}
                />

                <ErpTableAnalytic
                  title="Lotes Acabados"
                  primaryValue={`${finishedCount} lotes`}
                  secondaryValue="Disponíveis para venda"
                  percent={
                    tableData.length ? Math.round((finishedCount / tableData.length) * 100) : 0
                  }
                  icon="solar:box-minimalistic-bold-duotone"
                  color={theme.vars.palette.info.main}
                />

                <ErpTableAnalytic
                  title="Inativos"
                  primaryValue={`${inactiveCount} lotes`}
                  secondaryValue={`${
                    tableData.length ? Math.round((inactiveCount / tableData.length) * 100) : 0
                  }% do total`}
                  percent={
                    tableData.length ? Math.round((inactiveCount / tableData.length) * 100) : 0
                  }
                  icon="solar:close-circle-bold-duotone"
                  color={theme.vars.palette.error.main}
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
              searchPlaceholder="Pesquisar por lote, produto ou fornecedor..."
              onResetPage={table.onResetPage}
              selectFilters={[
                {
                  id: 'productType',
                  label: 'Tipo',
                  options: BATCH_TYPE_OPTIONS,
                  value: typeFilters,
                  onChange: setTypeFilters,
                },
                {
                  id: 'stockBalance',
                  label: 'Saldo',
                  options: BATCH_STOCK_OPTIONS,
                  value: stockFilters,
                  onChange: setStockFilters,
                },
              ]}
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
                  <Tooltip title="Desativar lotes selecionados">
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
                            <BatchTableRow
                              key={row.id}
                              row={row}
                              selected={table.selected.includes(row.id)}
                              onSelectRow={() => table.onSelectRow(row.id)}
                              onDeactivateRow={() => handleAskDeactivate(row.id)}
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
        open={confirm.value}
        onClose={() => {
          setDeactivateId(null);
          confirm.onFalse();
        }}
        title={t('batches.deactivate')}
        content={t('batches.deactivateConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivate}>
            {t('batches.deactivate')}
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmMultiple.value}
        onClose={confirmMultiple.onFalse}
        title="Desativar Lotes Selecionados"
        content={`Tem certeza de que deseja desativar ${table.selected.length} lotes selecionados?`}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivateMultiple}>
            Desativar Todos
          </Button>
        }
      />
    </>
  );
}

import type {
  StockMovement,
  StockMovementType,
} from 'src/api/firestore/stock-movements';

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
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import { listStockMovements } from 'src/api/firestore/stock-movements';

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

import { StockMovementTableRow } from '../stock-movement-table-row';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'createdAt', label: 'Data/Hora', width: 170, hideable: false },
  { id: 'type', label: 'Tipo', width: 170 },
  { id: 'lotCode', label: 'Lote', width: 140 },
  { id: 'productName', label: 'Produto', minWidth: 200 },
  { id: 'qty', label: 'Quantidade', width: 140, align: 'right' },
  { id: 'unitCost', label: 'Custo Un.', width: 130, align: 'right' },
  { id: 'reason', label: 'Motivo / Origem', minWidth: 200 },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  createdAt: true,
  type: true,
  lotCode: true,
  productName: true,
  qty: true,
  unitCost: true,
  reason: true,
};

export function StockMovementListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const { user } = useAuthContext();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });
  const confirmExportSelected = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<StockMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState<'all' | 'in' | 'out' | 'processing'>('all');
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);

  const typeLabels = useMemo<Record<StockMovementType, string>>(
    () => ({
      IN: t('batches.movements.IN', { defaultValue: 'Entrada' }),
      OUT: t('batches.movements.OUT', { defaultValue: 'Saída' }),
      PROCESSING_IN: t('batches.movements.PROCESSING_IN', {
        defaultValue: 'Entrada Beneficiamento',
      }),
      PROCESSING_OUT: t('batches.movements.PROCESSING_OUT', {
        defaultValue: 'Saída Beneficiamento',
      }),
      ADJUST: t('batches.movements.ADJUSTMENT', { defaultValue: 'Ajuste de Estoque' }),
    }),
    [t]
  );

  const typeOptions = useMemo(
    () =>
      (Object.keys(typeLabels) as StockMovementType[]).map((key) => ({
        value: key,
        label: typeLabels[key],
      })),
    [typeLabels]
  );

  const loadMovements = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listStockMovements(enterpriseId);
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
    loadMovements();
  }, [loadMovements]);

  const inCount = useMemo(
    () => tableData.filter((r) => r.type === 'IN' || r.type === 'PROCESSING_IN').length,
    [tableData]
  );
  const outCount = useMemo(
    () => tableData.filter((r) => r.type === 'OUT' || r.type === 'PROCESSING_OUT').length,
    [tableData]
  );
  const processingCount = useMemo(
    () => tableData.filter((r) => r.type === 'PROCESSING_IN' || r.type === 'PROCESSING_OUT').length,
    [tableData]
  );

  const TABS = [
    { value: 'all', label: 'Todas', color: 'default', count: tableData.length },
    { value: 'in', label: 'Entradas', color: 'success', count: inCount },
    { value: 'out', label: 'Saídas', color: 'warning', count: outCount },
    { value: 'processing', label: 'Beneficiamento', color: 'info', count: processingCount },
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

    if (currentTab === 'in') {
      rows = rows.filter((r) => r.type === 'IN' || r.type === 'PROCESSING_IN');
    } else if (currentTab === 'out') {
      rows = rows.filter((r) => r.type === 'OUT' || r.type === 'PROCESSING_OUT');
    } else if (currentTab === 'processing') {
      rows = rows.filter((r) => r.type === 'PROCESSING_IN' || r.type === 'PROCESSING_OUT');
    }

    if (typeFilters.length > 0) {
      rows = rows.filter((row) => typeFilters.includes(row.type));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.lotCode?.toLowerCase().includes(q) ||
          row.productName?.toLowerCase().includes(q) ||
          row.reason?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [currentTab, searchQuery, table.order, table.orderBy, tableData, typeFilters]);

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

  const exportRowsToCsv = useCallback(
    (rowsToExport: StockMovement[]) => {
      const headers = ['Data/Hora', 'Tipo', 'Lote', 'Produto', 'Quantidade', 'Custo Un.', 'Motivo'];
      const csvRows = [
        headers.join(';'),
        ...rowsToExport.map((r) =>
          [
            `"${r.createdAt ? fDateTime(r.createdAt) : ''}"`,
            `"${typeLabels[r.type] || r.type}"`,
            `"${r.lotCode || ''}"`,
            `"${r.productName || ''}"`,
            `${r.qty} ${r.unit || ''}`,
            typeof r.unitCost === 'number' ? r.unitCost.toFixed(2) : '0.00',
            `"${r.reason || ''}"`,
          ].join(';')
        ),
      ];
      const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `movimentacoes-estoque-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    },
    [typeLabels]
  );

  const notFound = !dataFiltered.length && !loading;

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('batches.movementsHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.batches'), href: paths.dashboard.batches.list },
            { name: t('batches.movementsHeading') },
          ]}
          action={
            <Button
              component={RouterLink}
              href={paths.dashboard.batches.list}
              variant="outlined"
              startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
            >
              {t('batches.backToBatches')}
            </Button>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
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
                  title="Total Movimentações"
                  primaryValue={`${tableData.length} registros`}
                  secondaryValue="Histórico auditável FIFO"
                  percent={100}
                  icon="solar:history-bold-duotone"
                  color={theme.vars.palette.primary.main}
                />

                <ErpTableAnalytic
                  title="Entradas de Estoque"
                  primaryValue={`${inCount} entradas`}
                  secondaryValue="Compras e Produção"
                  percent={tableData.length ? Math.round((inCount / tableData.length) * 100) : 0}
                  icon="solar:import-bold-duotone"
                  color={theme.vars.palette.success.main}
                />

                <ErpTableAnalytic
                  title="Saídas de Estoque"
                  primaryValue={`${outCount} saídas`}
                  secondaryValue="Vendas PDV e Consumo"
                  percent={tableData.length ? Math.round((outCount / tableData.length) * 100) : 0}
                  icon="solar:export-bold-duotone"
                  color={theme.vars.palette.warning.main}
                />

                <ErpTableAnalytic
                  title="Beneficiamento"
                  primaryValue={`${processingCount} registros`}
                  secondaryValue="Transformação industrial"
                  percent={
                    tableData.length ? Math.round((processingCount / tableData.length) * 100) : 0
                  }
                  icon="solar:settings-bold-duotone"
                  color={theme.vars.palette.info.main}
                />
              </Stack>
            </Scrollbar>

            <Divider />

            <Tabs
              value={currentTab}
              onChange={(_, val) => {
                table.onResetPage();
                setCurrentTab(val);
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

            <ErpTableToolbar
              searchQuery={searchQuery}
              onSearchChange={(e) => setSearchQuery(e.target.value)}
              searchPlaceholder="Pesquisar por código do lote, produto ou motivo..."
              onResetPage={table.onResetPage}
              selectFilters={[
                {
                  id: 'movementType',
                  label: 'Tipo',
                  options: typeOptions,
                  value: typeFilters,
                  onChange: setTypeFilters,
                },
              ]}
              columns={TABLE_HEAD}
              visibleColumns={visibleColumns}
              onToggleColumn={handleToggleColumn}
              onResetColumns={handleResetColumns}
              onExportCsv={() => exportRowsToCsv(dataFiltered)}
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
                  <Tooltip title="Exportar selecionados">
                    <IconButton color="primary" onClick={confirmExportSelected.onTrue}>
                      <Iconify icon="solar:file-download-bold" />
                    </IconButton>
                  </Tooltip>
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
                            <StockMovementTableRow
                              key={row.id}
                              row={row}
                              selected={table.selected.includes(row.id)}
                              onSelectRow={() => table.onSelectRow(row.id)}
                              typeLabels={typeLabels}
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
        open={confirmExportSelected.value}
        onClose={confirmExportSelected.onFalse}
        title="Exportar Movimentações Selecionadas"
        content={`Deseja exportar as ${table.selected.length} movimentações selecionadas para CSV?`}
        action={
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              const selectedRows = dataFiltered.filter((r) => table.selected.includes(r.id));
              exportRowsToCsv(selectedRows);
              table.onSelectAllRows(false, []);
              confirmExportSelected.onFalse();
            }}
          >
            Exportar Selecionadas
          </Button>
        }
      />
    </>
  );
}

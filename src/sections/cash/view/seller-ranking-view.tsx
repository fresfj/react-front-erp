import type { Sale } from 'src/api/firestore/sales';

import dayjs from 'dayjs';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Checkbox from '@mui/material/Checkbox';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import TableContainer from '@mui/material/TableContainer';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fNumber, fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { listSales } from 'src/api/firestore/sales';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { ErpTableToolbar, ErpTableAnalytic } from 'src/components/erp-table';
import { useDateRangePicker } from 'src/components/custom-date-range-picker';
import {
  PeriodFilterBar,
  resolvePeriodBounds,
  isIsoInPeriodBounds,
  type DateFilterPreset,
} from 'src/components/period-filter';
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

import { aggregateSellerRanking } from '../seller-ranking';

import type { SellerRankingRow } from '../seller-ranking';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'rank', label: '#', width: 72, hideable: false },
  { id: 'sellerKey', label: 'Vendedor', minWidth: 220, hideable: false },
  { id: 'salesCount', label: 'Vendas', width: 140, align: 'right' },
  { id: 'netTotal', label: 'Total Líquido', width: 160, align: 'right' },
  { id: 'totalCost', label: 'CMV', width: 160, align: 'right' },
  { id: 'grossProfit', label: 'Lucro Bruto', width: 160, align: 'right' },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  rank: true,
  sellerKey: true,
  salesCount: true,
  netTotal: true,
  totalCost: true,
  grossProfit: true,
};

const PERFORMANCE_OPTIONS = [
  { value: 'profitable', label: 'Com Lucro Positivo' },
  { value: 'high_volume', label: '5+ Vendas no Período' },
];

export function SellerRankingView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const table = useTable({ defaultOrderBy: 'netTotal', defaultOrder: 'desc' });
  const confirmExportSelected = useBoolean();
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState<'all'>('all');
  const [perfFilters, setPerfFilters] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [preset, setPreset] = useState<DateFilterPreset>('7d');
  const rangePicker = useDateRangePicker(dayjs().subtract(6, 'day'), dayjs());

  const bounds = useMemo(
    () => resolvePeriodBounds(preset, rangePicker.startDate, rangePicker.endDate),
    [preset, rangePicker.startDate, rangePicker.endDate]
  );

  const loadData = useCallback(async () => {
    if (!enterpriseId) {
      setSales([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSales(await listSales(enterpriseId));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar ranking'));
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const ranking = useMemo(() => {
    const filtered = sales.filter((s) => isIsoInPeriodBounds(s.createdAt, bounds));
    return aggregateSellerRanking(filtered);
  }, [sales, bounds]);

  const metrics = useMemo(() => {
    const totalSalesCount = ranking.reduce((acc, r) => acc + r.salesCount, 0);
    const totalNet = ranking.reduce((acc, r) => acc + r.netTotal, 0);
    const totalProfit = ranking.reduce((acc, r) => acc + r.grossProfit, 0);
    const avgTicket = totalSalesCount > 0 ? totalNet / totalSalesCount : 0;
    const profitMargin = totalNet > 0 ? (totalProfit / totalNet) * 100 : 0;

    return {
      totalSalesCount,
      totalNet,
      totalProfit,
      avgTicket,
      profitMargin,
    };
  }, [ranking]);

  const dataFiltered = useMemo(() => {
    let rows = ranking.map((r, index) => ({ ...r, rank: index + 1 }));

    const comparator = getComparator(table.order, table.orderBy) as (a: any, b: any) => number;
    const stabilizedThis = rows.map((el, index) => [el, index] as const);
    stabilizedThis.sort((a, b) => {
      const order = comparator(a[0], b[0]);
      if (order !== 0) return order;
      return a[1] - b[1];
    });
    rows = stabilizedThis.map((el) => el[0]);

    if (perfFilters.length > 0) {
      rows = rows.filter((r) =>
        perfFilters.every((f) => {
          if (f === 'profitable') return r.grossProfit > 0;
          if (f === 'high_volume') return r.salesCount >= 5;
          return true;
        })
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.sellerEmail?.toLowerCase().includes(q) ||
          r.sellerUid?.toLowerCase().includes(q) ||
          r.sellerKey.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [perfFilters, ranking, searchQuery, table.order, table.orderBy]);

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

  const exportRowsToCsv = useCallback((rowsToExport: (SellerRankingRow & { rank: number })[]) => {
    const headers = ['Posição', 'Vendedor', 'Vendas', 'Total Líquido', 'CMV', 'Lucro Bruto'];
    const csvRows = [
      headers.join(';'),
      ...rowsToExport.map((r) =>
        [
          r.rank,
          `"${r.sellerEmail || r.sellerUid || r.sellerKey}"`,
          r.salesCount,
          r.netTotal.toFixed(2),
          r.totalCost.toFixed(2),
          r.grossProfit.toFixed(2),
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ranking-vendedores-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const isVisible = (colId: string) => visibleColumns[colId] !== false;
  const notFound = !dataFiltered.length && !loading;

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('finance.rankingHeading', { defaultValue: 'Ranking de vendedores' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.pos'), href: paths.dashboard.pos.root },
            { name: t('nav.sellerRanking', { defaultValue: 'Ranking' }) },
          ]}
          action={
            <Button
              component={RouterLink}
              href={paths.dashboard.pos.sales}
              variant="outlined"
              startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
            >
              {t('nav.salesHistory')}
            </Button>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        <PeriodFilterBar
          preset={preset}
          onPresetChange={setPreset}
          rangePicker={rangePicker}
          title={t('periodFilter.title', { defaultValue: 'Filtro de período' })}
        />

        <Card>
          {/* 4 Indicadores Rápidos integrados no topo do Card da tabela */}
          <Scrollbar sx={{ minHeight: 108 }}>
            <Stack
              direction="row"
              divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
              sx={{ py: 2.5 }}
            >
              <ErpTableAnalytic
                title="Faturamento Líquido"
                primaryValue={fCurrency(metrics.totalNet)}
                secondaryValue={`${metrics.totalSalesCount} vendas no período`}
                percent={100}
                icon="solar:cup-star-bold-duotone"
                color={theme.vars.palette.primary.main}
              />

              <ErpTableAnalytic
                title="Lucro Bruto Total"
                primaryValue={fCurrency(metrics.totalProfit)}
                secondaryValue={`Margem média de ${metrics.profitMargin.toFixed(1)}%`}
                percent={Math.max(0, Math.min(100, Math.round(metrics.profitMargin)))}
                icon="solar:wallet-money-bold-duotone"
                color={theme.vars.palette.success.main}
              />

              <ErpTableAnalytic
                title="Ticket Médio Geral"
                primaryValue={fCurrency(metrics.avgTicket)}
                secondaryValue="Por venda concluída"
                percent={100}
                icon="solar:tag-price-bold-duotone"
                color={theme.vars.palette.info.main}
              />

              <ErpTableAnalytic
                title="Vendedores Ativos"
                primaryValue={`${ranking.length} colaboradores`}
                secondaryValue="Com vendas no período"
                percent={100}
                icon="solar:users-group-rounded-bold-duotone"
                color={theme.vars.palette.warning.main}
              />
            </Stack>
          </Scrollbar>

          <Divider />

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
            <Tab
              value="all"
              label="Todos os Vendedores"
              iconPosition="end"
              icon={
                <Label variant="filled" color="default">
                  {ranking.length}
                </Label>
              }
            />
          </Tabs>

          <ErpTableToolbar
            searchQuery={searchQuery}
            onSearchChange={(e) => setSearchQuery(e.target.value)}
            searchPlaceholder="Pesquisar vendedor por e-mail ou identificador..."
            onResetPage={table.onResetPage}
            selectFilters={[
              {
                id: 'performance',
                label: 'Desempenho',
                options: PERFORMANCE_OPTIONS,
                value: perfFilters,
                onChange: setPerfFilters,
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
                  dataFiltered.map((row) => row.sellerKey)
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
                      dataFiltered.map((row) => row.sellerKey)
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
                        .map((row) => {
                          const isSelected = table.selected.includes(row.sellerKey);
                          return (
                            <TableRow
                              key={row.sellerKey}
                              hover
                              selected={isSelected}
                              aria-checked={isSelected}
                              tabIndex={-1}
                            >
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={isSelected}
                                  onClick={() => table.onSelectRow(row.sellerKey)}
                                />
                              </TableCell>
                              {isVisible('rank') && (
                                <TableCell sx={{ typography: 'subtitle2' }}>{row.rank}</TableCell>
                              )}
                              {isVisible('sellerKey') && (
                                <TableCell sx={{ typography: 'body2', fontWeight: 600 }}>
                                  {row.sellerEmail || row.sellerUid || row.sellerKey}
                                </TableCell>
                              )}
                              {isVisible('salesCount') && (
                                <TableCell align="right">{fNumber(row.salesCount)}</TableCell>
                              )}
                              {isVisible('netTotal') && (
                                <TableCell align="right" sx={{ typography: 'subtitle2' }}>
                                  {fCurrency(row.netTotal)}
                                </TableCell>
                              )}
                              {isVisible('totalCost') && (
                                <TableCell align="right" sx={{ color: 'text.secondary' }}>
                                  {fCurrency(row.totalCost)}
                                </TableCell>
                              )}
                              {isVisible('grossProfit') && (
                                <TableCell
                                  align="right"
                                  sx={{
                                    typography: 'subtitle2',
                                    color: row.grossProfit >= 0 ? 'success.main' : 'error.main',
                                  }}
                                >
                                  {fCurrency(row.grossProfit)}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}

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
      </DashboardContent>

      <ConfirmDialog
        open={confirmExportSelected.value}
        onClose={confirmExportSelected.onFalse}
        title="Exportar Vendedores Selecionados"
        content={`Deseja exportar os ${table.selected.length} vendedores selecionados para CSV?`}
        action={
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              const selectedRows = dataFiltered.filter((r) =>
                table.selected.includes(r.sellerKey)
              );
              exportRowsToCsv(selectedRows);
              table.onSelectAllRows(false, []);
              confirmExportSelected.onFalse();
            }}
          >
            Exportar Selecionados
          </Button>
        }
      />
    </>
  );
}

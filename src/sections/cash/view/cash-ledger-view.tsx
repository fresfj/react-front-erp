import type { CashSession } from 'src/api/firestore/cash-sessions';

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
import { listCashSessions } from 'src/api/firestore/cash-sessions';

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

import { buildCashLedger } from '../cash-ledger';
import { TYPE_CONFIG, CashLedgerTableRow } from '../cash-ledger-table-row';

import type { CashLedgerLine, CashLedgerLineType } from '../cash-ledger';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'reason', label: 'Lançamento / Transação', minWidth: 260, hideable: false },
  { id: 'type', label: 'Tipo', width: 170 },
  { id: 'createdAt', label: 'Data e Hora', width: 170 },
  { id: 'signedAmount', label: 'Valor', width: 150, align: 'right' },
  { id: 'balanceAfter', label: 'Saldo Resultante', width: 160, align: 'right' },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  reason: true,
  type: true,
  createdAt: true,
  signedAmount: true,
  balanceAfter: true,
};

const LEDGER_TYPE_OPTIONS = (Object.keys(TYPE_CONFIG) as CashLedgerLineType[]).map((key) => ({
  value: key,
  label: TYPE_CONFIG[key].label,
}));

export function CashLedgerView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });
  const confirmExportSelected = useBoolean();
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState<'all' | 'inflow' | 'outflow'>('all');
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [preset, setPreset] = useState<DateFilterPreset>('30d');
  const rangePicker = useDateRangePicker(dayjs().subtract(29, 'day'), dayjs());

  const bounds = useMemo(
    () => resolvePeriodBounds(preset, rangePicker.startDate, rangePicker.endDate),
    [preset, rangePicker.startDate, rangePicker.endDate]
  );

  const loadSessions = useCallback(async () => {
    if (!enterpriseId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listCashSessions(enterpriseId);
      setSessions(rows);
    } catch (error) {
      console.error(error);
      toast.error(
        getFirebaseErrorMessage(
          error,
          t('cashLedger.loadError', {
            defaultValue: 'Não foi possível carregar o extrato bancário/caixa',
          })
        )
      );
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const ledger = useMemo(() => buildCashLedger(sessions, bounds), [sessions, bounds]);

  const inflowLines = useMemo(
    () => ledger.lines.filter((l) => l.signedAmount >= 0),
    [ledger.lines]
  );
  const outflowLines = useMemo(
    () => ledger.lines.filter((l) => l.signedAmount < 0),
    [ledger.lines]
  );

  const TABS = [
    { value: 'all', label: 'Todos', color: 'default', count: ledger.lines.length },
    { value: 'inflow', label: 'Entradas', color: 'success', count: inflowLines.length },
    { value: 'outflow', label: 'Saídas', color: 'error', count: outflowLines.length },
  ] as const;

  const dataFiltered = useMemo(() => {
    let rows = [...ledger.lines];

    const comparator = getComparator(table.order, table.orderBy) as (a: any, b: any) => number;
    const stabilizedThis = rows.map((el, index) => [el, index] as const);
    stabilizedThis.sort((a, b) => {
      const order = comparator(a[0], b[0]);
      if (order !== 0) return order;
      return a[1] - b[1];
    });
    rows = stabilizedThis.map((el) => el[0]);

    if (currentTab === 'inflow') {
      rows = rows.filter((line) => line.signedAmount >= 0);
    } else if (currentTab === 'outflow') {
      rows = rows.filter((line) => line.signedAmount < 0);
    }

    if (typeFilters.length > 0) {
      rows = rows.filter((line) => typeFilters.includes(line.type));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (line) =>
          line.reason?.toLowerCase().includes(q) ||
          line.sessionCode?.toLowerCase().includes(q) ||
          line.refId?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [currentTab, ledger.lines, searchQuery, table.order, table.orderBy, typeFilters]);

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

  const exportRowsToCsv = useCallback((rowsToExport: CashLedgerLine[]) => {
    const headers = ['Lançamento', 'Sessão', 'Tipo', 'Data/Hora', 'Valor', 'Saldo Resultante'];
    const csvRows = [
      headers.join(';'),
      ...rowsToExport.map((r) =>
        [
          `"${r.type === 'OPENING' ? 'Abertura de Caixa' : r.reason || 'Movimentação avulsa'}"`,
          `"${r.sessionCode || ''}"`,
          `"${TYPE_CONFIG[r.type]?.label || r.type}"`,
          `"${r.createdAt ? fDateTime(r.createdAt) : ''}"`,
          r.signedAmount.toFixed(2),
          r.balanceAfter.toFixed(2),
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `livro-caixa-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const { summary } = ledger;
  const isNetPositive = summary.net >= 0;
  const totalLines = ledger.lines.length;
  const notFound = !dataFiltered.length && !loading;

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading="Livro Caixa e Extrato Bancário"
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: 'Financeiro', href: paths.dashboard.cash.root },
            { name: 'Livro Caixa' },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                component={RouterLink}
                href={paths.dashboard.cash.receivables}
                variant="outlined"
                startIcon={<Iconify icon="solar:card-recive-bold" />}
              >
                A Receber
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.cash.payables}
                variant="outlined"
                startIcon={<Iconify icon="solar:card-send-bold" />}
              >
                A Pagar
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.cash.root}
                variant="contained"
                startIcon={<Iconify icon="solar:wallet-money-bold" />}
              >
                Sessões de Caixa
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        <PeriodFilterBar
          preset={preset}
          onPresetChange={setPreset}
          rangePicker={rangePicker}
          title="Filtrar Período do Extrato"
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
                title="Resultado Líquido"
                primaryValue={`${isNetPositive ? '+' : ''}${fCurrency(summary.net)}`}
                secondaryValue={isNetPositive ? 'Superávit no período' : 'Déficit no período'}
                percent={100}
                icon="solar:wallet-money-bold-duotone"
                color={
                  isNetPositive ? theme.vars.palette.success.main : theme.vars.palette.error.main
                }
              />

              <ErpTableAnalytic
                title="Total Entradas"
                primaryValue={`+${fCurrency(summary.inflow)}`}
                secondaryValue={`${inflowLines.length} lançamentos de entrada`}
                percent={totalLines ? Math.round((inflowLines.length / totalLines) * 100) : 0}
                icon="solar:card-recive-bold-duotone"
                color={theme.vars.palette.success.main}
              />

              <ErpTableAnalytic
                title="Total Saídas"
                primaryValue={`−${fCurrency(summary.outflow)}`}
                secondaryValue={`${outflowLines.length} lançamentos de saída`}
                percent={totalLines ? Math.round((outflowLines.length / totalLines) * 100) : 0}
                icon="solar:card-send-bold-duotone"
                color={theme.vars.palette.error.main}
              />

              <ErpTableAnalytic
                title="Lançamentos"
                primaryValue={`${summary.lineCount} transações`}
                secondaryValue={`${sessions.length} sessões de caixa`}
                percent={100}
                icon="solar:bill-list-bold-duotone"
                color={theme.vars.palette.info.main}
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
            searchPlaceholder="Pesquisar por descrição, sessão de caixa ou referência..."
            onResetPage={table.onResetPage}
            selectFilters={[
              {
                id: 'ledgerType',
                label: 'Tipo',
                options: LEDGER_TYPE_OPTIONS,
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
              <Table size={table.dense ? 'small' : 'medium'} sx={{ minWidth: 900 }}>
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
                          <CashLedgerTableRow
                            key={row.id}
                            row={row}
                            selected={table.selected.includes(row.id)}
                            onSelectRow={() => table.onSelectRow(row.id)}
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
      </DashboardContent>

      <ConfirmDialog
        open={confirmExportSelected.value}
        onClose={confirmExportSelected.onFalse}
        title="Exportar Lançamentos Selecionados"
        content={`Deseja exportar os ${table.selected.length} lançamentos selecionados para CSV?`}
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
            Exportar Selecionados
          </Button>
        }
      />
    </>
  );
}

import type { Sale } from 'src/api/firestore/sales';
import type { CashSession, CashMovementType } from 'src/api/firestore/cash-sessions';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import TableContainer from '@mui/material/TableContainer';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { listSales } from 'src/api/firestore/sales';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  openCashSession,
  listCashSessions,
  closeCashSessionBlind,
  addCashSessionMovement,
} from 'src/api/firestore/cash-sessions';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
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

import {
  emptyTotalsByMethod,
  calculateCashSessionExpected,
  calculateBlindCloseDifference,
} from '../cash-calculator';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'code', label: 'Código', width: 160, hideable: false },
  { id: 'operatorEmail', label: 'Operador', minWidth: 180 },
  { id: 'openingBalance', label: 'Fundo Inicial', width: 130, align: 'right' },
  { id: 'expectedDrawerCash', label: 'Esperado (Gaveta)', width: 150, align: 'right' },
  { id: 'countedDrawerCash', label: 'Informado (Cego)', width: 150, align: 'right' },
  { id: 'differenceAmount', label: 'Sobra / Quebra', width: 140, align: 'right' },
  { id: 'status', label: 'Status', width: 120 },
  { id: 'openedAt', label: 'Abertura', width: 160 },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  code: true,
  operatorEmail: true,
  openingBalance: true,
  expectedDrawerCash: true,
  countedDrawerCash: true,
  differenceAmount: true,
  status: true,
  openedAt: true,
};

const AUDIT_DIFF_OPTIONS = [
  { value: 'exact', label: 'Exato (Sem Divergência)' },
  { value: 'surplus', label: 'Com Sobra (> 0)' },
  { value: 'shortage', label: 'Com Quebra (< 0)' },
];

export function CashSessionView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const table = useTable({ defaultOrderBy: 'openedAt', defaultOrder: 'desc' });
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const openModal = useBoolean();
  const movementModal = useBoolean();
  const blindCloseModal = useBoolean();
  const confirmExportSelected = useBoolean();

  const [currentTab, setCurrentTab] = useState<'all' | 'open' | 'closed'>('all');
  const [auditFilters, setAuditFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  // Form states for modals
  const [openingBalance, setOpeningBalance] = useState<number>(100);
  const [movementType, setMovementType] = useState<CashMovementType>('WITHDRAWAL');
  const [movementAmount, setMovementAmount] = useState<number>(0);
  const [movementReason, setMovementReason] = useState('');

  // Blind close counted inputs (operator types physical counts without seeing expected beforehand!)
  const [countedCash, setCountedCash] = useState<number>(0);
  const [countedPix, setCountedPix] = useState<number>(0);
  const [countedCredit, setCountedCredit] = useState<number>(0);
  const [countedDebit, setCountedDebit] = useState<number>(0);
  const [closeNotes, setCloseNotes] = useState('');

  const loadData = useCallback(async () => {
    if (!enterpriseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [sessList, salesList] = await Promise.all([
        listCashSessions(enterpriseId),
        listSales(enterpriseId),
      ]);
      setSessions(sessList);
      setSales(salesList);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar sessões de caixa'));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === 'open') || null,
    [sessions]
  );

  const sessionSales = useMemo(() => {
    if (!activeSession) return [];
    return sales.filter((s) => s.createdAt >= activeSession.openedAt);
  }, [activeSession, sales]);

  const expectedCalc = useMemo(() => {
    if (!activeSession) return null;
    return calculateCashSessionExpected({
      openingBalance: activeSession.openingBalance,
      movements: activeSession.movements,
      sales: sessionSales,
    });
  }, [activeSession, sessionSales]);

  // Metrics for 4 Analytics
  const metrics = useMemo(() => {
    const openSessions = sessions.filter((s) => s.status === 'open');
    const closedSessions = sessions.filter((s) => s.status === 'closed');
    const exactSessions = closedSessions.filter((s) => (s.differenceAmount || 0) === 0);
    const divergentSessions = closedSessions.filter((s) => (s.differenceAmount || 0) !== 0);
    const totalDiff = closedSessions.reduce((acc, s) => acc + (s.differenceAmount || 0), 0);

    return {
      total: sessions.length,
      openCount: openSessions.length,
      closedCount: closedSessions.length,
      exactCount: exactSessions.length,
      divergentCount: divergentSessions.length,
      totalDiff,
      percentClosed: sessions.length
        ? Math.round((closedSessions.length / sessions.length) * 100)
        : 0,
      percentExact: closedSessions.length
        ? Math.round((exactSessions.length / closedSessions.length) * 100)
        : 0,
      percentDivergent: closedSessions.length
        ? Math.round((divergentSessions.length / closedSessions.length) * 100)
        : 0,
    };
  }, [sessions]);

  const TABS = [
    { value: 'all', label: 'Todas', color: 'default', count: sessions.length },
    { value: 'open', label: 'Abertos', color: 'warning', count: metrics.openCount },
    { value: 'closed', label: 'Fechados', color: 'success', count: metrics.closedCount },
  ] as const;

  const handleOpenSession = async () => {
    if (!enterpriseId) return;
    try {
      const code = `CX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random()
        .toString(36)
        .slice(2, 5)
        .toUpperCase()}`;
      await openCashSession(enterpriseId, {
        code,
        openingBalance,
        operatorUid: user?.id,
        operatorEmail: user?.email,
      });
      toast.success('Caixa aberto com sucesso!');
      openModal.onFalse();
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao abrir caixa'));
    }
  };

  const handleAddMovement = async () => {
    if (!enterpriseId || !activeSession || movementAmount <= 0) return;
    try {
      await addCashSessionMovement(enterpriseId, activeSession, {
        type: movementType,
        amount: movementAmount,
        reason: movementReason.trim() || (movementType === 'WITHDRAWAL' ? 'Sangria' : 'Suprimento'),
        createdBy: user?.email,
      });
      toast.success(
        movementType === 'WITHDRAWAL'
          ? 'Sangria registrada com sucesso!'
          : 'Suprimento registrado com sucesso!'
      );
      setMovementAmount(0);
      setMovementReason('');
      movementModal.onFalse();
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao registrar movimentação'));
    }
  };

  const handleBlindClose = async () => {
    if (!enterpriseId || !activeSession || !expectedCalc) return;
    try {
      const diff = calculateBlindCloseDifference({
        expectedDrawerCash: expectedCalc.expectedDrawerCash,
        countedDrawerCash: countedCash,
      });

      const countedTotals = {
        ...emptyTotalsByMethod(),
        cash: countedCash,
        pix: countedPix,
        credit_card: countedCredit,
        debit_card: countedDebit,
      };

      await closeCashSessionBlind(enterpriseId, activeSession.id, {
        expectedTotals: expectedCalc.expectedTotals,
        countedTotals,
        expectedDrawerCash: expectedCalc.expectedDrawerCash,
        countedDrawerCash: countedCash,
        differenceAmount: diff.differenceAmount,
        notes: closeNotes.trim() || undefined,
      });

      toast.success(
        `Caixa fechado! Diferença apurada na gaveta: ${fCurrency(diff.differenceAmount)}`
      );
      blindCloseModal.onFalse();
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao fechar caixa'));
    }
  };

  const dataFiltered = useMemo(() => {
    let rows = [...sessions];

    const comparator = getComparator(table.order, table.orderBy) as (a: any, b: any) => number;
    const stabilizedThis = rows.map((el, index) => [el, index] as const);
    stabilizedThis.sort((a, b) => {
      const order = comparator(a[0], b[0]);
      if (order !== 0) return order;
      return a[1] - b[1];
    });
    rows = stabilizedThis.map((el) => el[0]);

    if (currentTab !== 'all') {
      rows = rows.filter((s) => s.status === currentTab);
    }

    if (auditFilters.length > 0) {
      rows = rows.filter((s) => {
        const diff = s.differenceAmount;
        if (typeof diff !== 'number') return false;
        return (
          (auditFilters.includes('exact') && diff === 0) ||
          (auditFilters.includes('surplus') && diff > 0) ||
          (auditFilters.includes('shortage') && diff < 0)
        );
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (s) =>
          s.code?.toLowerCase().includes(q) ||
          s.operatorEmail?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [auditFilters, currentTab, searchQuery, sessions, table.order, table.orderBy]);

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

  const exportRowsToCsv = useCallback((rowsToExport: CashSession[]) => {
    const headers = [
      'Código',
      'Operador',
      'Fundo Inicial',
      'Esperado (Gaveta)',
      'Informado (Cego)',
      'Sobra / Quebra',
      'Status',
      'Abertura',
    ];
    const csvRows = [
      headers.join(';'),
      ...rowsToExport.map((r) =>
        [
          `"${r.code || ''}"`,
          `"${r.operatorEmail || ''}"`,
          r.openingBalance.toFixed(2),
          typeof r.expectedDrawerCash === 'number' ? r.expectedDrawerCash.toFixed(2) : '',
          typeof r.countedDrawerCash === 'number' ? r.countedDrawerCash.toFixed(2) : '',
          typeof r.differenceAmount === 'number' ? r.differenceAmount.toFixed(2) : '',
          r.status === 'open' ? 'Aberto' : 'Fechado',
          `"${r.openedAt ? fDateTime(r.openedAt) : ''}"`,
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sessoes-caixa-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const isVisible = (colId: string) => visibleColumns[colId] !== false;
  const notFound = !dataFiltered.length && !loading;

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('cash.heading', { defaultValue: 'Controle de Caixa (Fechamento Cego)' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('cash.heading', { defaultValue: 'Caixa' }) },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                component={RouterLink}
                href={paths.dashboard.cash.dre}
                variant="outlined"
                startIcon={<Iconify icon="solar:chart-square-bold" />}
              >
                {t('nav.dre', { defaultValue: 'Relatório DRE' })}
              </Button>
              {!activeSession ? (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Iconify icon="mingcute:add-line" />}
                  onClick={openModal.onTrue}
                >
                  Abrir Caixa
                </Button>
              ) : (
                <>
                  <Button
                    variant="soft"
                    color="warning"
                    startIcon={<Iconify icon="solar:transfer-horizontal-bold" />}
                    onClick={() => {
                      setMovementType('WITHDRAWAL');
                      movementModal.onTrue();
                    }}
                  >
                    Sangria / Suprimento
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<Iconify icon="solar:lock-password-bold" />}
                    onClick={() => {
                      setCountedCash(0);
                      setCountedPix(0);
                      setCountedCredit(0);
                      setCountedDebit(0);
                      blindCloseModal.onTrue();
                    }}
                  >
                    Fechamento Cego
                  </Button>
                </>
              )}
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {activeSession && (
          <Card sx={{ mb: 4 }}>
            <CardHeader
              title={`Sessão Aberta: ${activeSession.code}`}
              subheader={`Operador: ${activeSession.operatorEmail || '—'} • Aberto em ${fDateTime(activeSession.openedAt)}`}
              action={
                <Label color="success" variant="soft">
                  CAIXA ABERTO
                </Label>
              }
              sx={{ mb: 3 }}
            />
            <Divider />
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={3}
              justifyContent="space-between"
              sx={{ p: 3 }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Fundo de Troco (Abertura)
                </Typography>
                <Typography variant="h6">{fCurrency(activeSession.openingBalance)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Suprimentos (+)
                </Typography>
                <Typography variant="h6" color="success.main">
                  {fCurrency(expectedCalc?.totalSupplies ?? 0)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Sangrias (-)
                </Typography>
                <Typography variant="h6" color="error.main">
                  {fCurrency(expectedCalc?.totalWithdrawals ?? 0)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Vendas Realizadas na Sessão
                </Typography>
                <Typography variant="h6">{sessionSales.length} vendas</Typography>
              </Box>
            </Stack>
          </Card>
        )}

        <Card>
          {/* 4 Indicadores Rápidos integrados no topo do Card da tabela */}
          <Scrollbar sx={{ minHeight: 108 }}>
            <Stack
              direction="row"
              divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
              sx={{ py: 2.5 }}
            >
              <ErpTableAnalytic
                title="Total de Sessões"
                primaryValue={`${metrics.total} sessões`}
                secondaryValue={`${metrics.openCount} aberta(s) • ${metrics.closedCount} fechada(s)`}
                percent={100}
                icon="solar:wallet-money-bold-duotone"
                color={theme.vars.palette.primary.main}
              />

              <ErpTableAnalytic
                title="Caixas Fechados"
                primaryValue={`${metrics.closedCount} sessões`}
                secondaryValue={`${metrics.percentClosed}% do histórico`}
                percent={metrics.percentClosed}
                icon="solar:lock-keyhole-minimalistic-bold-duotone"
                color={theme.vars.palette.success.main}
              />

              <ErpTableAnalytic
                title="Fechamentos Exatos"
                primaryValue={`${metrics.exactCount} sessões`}
                secondaryValue="Gaveta sem divergência"
                percent={metrics.percentExact}
                icon="solar:check-circle-bold-duotone"
                color={theme.vars.palette.info.main}
              />

              <ErpTableAnalytic
                title="Sobra / Quebra"
                primaryValue={
                  metrics.totalDiff > 0
                    ? `+${fCurrency(metrics.totalDiff)}`
                    : fCurrency(metrics.totalDiff)
                }
                secondaryValue={`${metrics.divergentCount} sessão(ões) com diferença`}
                percent={metrics.percentDivergent}
                icon="solar:danger-triangle-bold-duotone"
                color={
                  metrics.totalDiff < 0
                    ? theme.vars.palette.error.main
                    : theme.vars.palette.warning.main
                }
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
            searchPlaceholder="Pesquisar caixa por código ou operador…"
            onResetPage={table.onResetPage}
            selectFilters={[
              {
                id: 'auditDiff',
                label: 'Conferência',
                options: AUDIT_DIFF_OPTIONS,
                value: auditFilters,
                onChange: setAuditFilters,
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
                <Tooltip title="Exportar sessões selecionadas">
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
                        .map((row) => {
                          const isSelected = table.selected.includes(row.id);
                          const diff = row.differenceAmount;
                          return (
                            <TableRow
                              key={row.id}
                              hover
                              selected={isSelected}
                              aria-checked={isSelected}
                              tabIndex={-1}
                            >
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={isSelected}
                                  onClick={() => table.onSelectRow(row.id)}
                                />
                              </TableCell>

                              {isVisible('code') && (
                                <TableCell sx={{ typography: 'subtitle2' }}>{row.code}</TableCell>
                              )}

                              {isVisible('operatorEmail') && (
                                <TableCell sx={{ typography: 'body2' }}>
                                  {row.operatorEmail || '—'}
                                </TableCell>
                              )}

                              {isVisible('openingBalance') && (
                                <TableCell align="right" sx={{ typography: 'body2' }}>
                                  {fCurrency(row.openingBalance)}
                                </TableCell>
                              )}

                              {isVisible('expectedDrawerCash') && (
                                <TableCell align="right" sx={{ typography: 'body2' }}>
                                  {typeof row.expectedDrawerCash === 'number'
                                    ? fCurrency(row.expectedDrawerCash)
                                    : '—'}
                                </TableCell>
                              )}

                              {isVisible('countedDrawerCash') && (
                                <TableCell align="right" sx={{ typography: 'subtitle2' }}>
                                  {typeof row.countedDrawerCash === 'number'
                                    ? fCurrency(row.countedDrawerCash)
                                    : '—'}
                                </TableCell>
                              )}

                              {isVisible('differenceAmount') && (
                                <TableCell align="right">
                                  {typeof diff === 'number' ? (
                                    <Label
                                      color={diff === 0 ? 'success' : diff > 0 ? 'info' : 'error'}
                                      variant="soft"
                                    >
                                      {diff > 0 ? `+${fCurrency(diff)}` : fCurrency(diff)}
                                    </Label>
                                  ) : (
                                    '—'
                                  )}
                                </TableCell>
                              )}

                              {isVisible('status') && (
                                <TableCell>
                                  <Label
                                    color={row.status === 'open' ? 'warning' : 'success'}
                                    variant="soft"
                                  >
                                    {row.status === 'open' ? 'Aberto' : 'Fechado'}
                                  </Label>
                                </TableCell>
                              )}

                              {isVisible('openedAt') && (
                                <TableCell sx={{ typography: 'body2', color: 'text.secondary' }}>
                                  {fDateTime(row.openedAt) || '—'}
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

      {/* Modal: Confirmar Exportação de Selecionados */}
      <ConfirmDialog
        open={confirmExportSelected.value}
        onClose={confirmExportSelected.onFalse}
        title="Exportar Sessões Selecionadas"
        content={`Deseja exportar as ${table.selected.length} sessões de caixa selecionadas para CSV?`}
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

      {/* Modal: Abrir Caixa */}
      <Dialog open={openModal.value} onClose={openModal.onFalse} fullWidth maxWidth="xs">
        <DialogTitle>Abrir Novo Caixa</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              type="number"
              label="Saldo inicial / Fundo de troco"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(Math.max(0, Number(e.target.value)))}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box component="span" sx={{ color: 'text.disabled' }}>
                      R$
                    </Box>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={openModal.onFalse}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleOpenSession}>
            Confirmar abertura
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Sangria / Suprimento */}
      <Dialog open={movementModal.value} onClose={movementModal.onFalse} fullWidth maxWidth="xs">
        <DialogTitle>Registrar Sangria ou Suprimento</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <TextField
              select
              fullWidth
              label="Tipo de movimentação"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as CashMovementType)}
            >
              <MenuItem value="WITHDRAWAL">Sangria (Retirada de dinheiro da gaveta)</MenuItem>
              <MenuItem value="SUPPLY">Suprimento (Entrada de troco na gaveta)</MenuItem>
            </TextField>

            <TextField
              fullWidth
              type="number"
              label="Valor"
              value={movementAmount}
              onChange={(e) => setMovementAmount(Math.max(0, Number(e.target.value)))}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box component="span" sx={{ color: 'text.disabled' }}>
                      R$
                    </Box>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              fullWidth
              label="Motivo / Observação"
              value={movementReason}
              onChange={(e) => setMovementReason(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={movementModal.onFalse}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleAddMovement}>
            Salvar movimentação
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Fechamento Cego */}
      <Dialog
        open={blindCloseModal.value}
        onClose={blindCloseModal.onFalse}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Fechamento Cego de Caixa (Blindagem)</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Informe os valores físicos contados na gaveta e nos comprovantes. O sistema calculará
              automaticamente a diferença (Sobra ou Quebra) após a confirmação.
            </Typography>

            <Box
              columnGap={2}
              rowGap={3}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
            >
              <TextField
                type="number"
                label="Dinheiro físico na gaveta"
                value={countedCash}
                onChange={(e) => setCountedCash(Math.max(0, Number(e.target.value)))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        R$
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                type="number"
                label="Total em PIX conferido"
                value={countedPix}
                onChange={(e) => setCountedPix(Math.max(0, Number(e.target.value)))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        R$
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                type="number"
                label="Total Cartão de Crédito"
                value={countedCredit}
                onChange={(e) => setCountedCredit(Math.max(0, Number(e.target.value)))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        R$
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                type="number"
                label="Total Cartão de Débito"
                value={countedDebit}
                onChange={(e) => setCountedDebit(Math.max(0, Number(e.target.value)))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        R$
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <TextField
              label="Observações de fechamento"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={blindCloseModal.onFalse}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={handleBlindClose}>
            Confirmar Fechamento Cego
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

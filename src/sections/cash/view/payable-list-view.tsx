import type { Payable } from 'src/api/firestore/payables';

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

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import { seedDemoPayables } from 'src/api/firestore/seed-demo';
import { getOpenCashSession, NoOpenCashSessionError } from 'src/api/firestore/cash-sessions';
import {
  listPayables,
  markPayablePaid,
  syncSubscriptionPayablesCf,
} from 'src/api/firestore/payables';

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

import { PayableTableRow } from '../payable-table-row';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'supplierName', label: 'Fornecedor / Descrição', minWidth: 220, hideable: false },
  { id: 'category', label: 'Categoria', width: 140 },
  { id: 'amount', label: 'Valor', width: 130, align: 'right' },
  { id: 'dueDate', label: 'Vencimento', width: 130 },
  { id: 'status', label: 'Status', width: 130 },
  { id: 'actions', label: '', width: 80, align: 'right', hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  supplierName: true,
  category: true,
  amount: true,
  dueDate: true,
  status: true,
  actions: true,
};

function isPayableOverdue(p: Payable): boolean {
  if (p.status !== 'open' || !p.dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return p.dueDate < today;
}

// ----------------------------------------------------------------------

export function PayableListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const table = useTable({ defaultOrderBy: 'dueDate', defaultOrder: 'asc' });
  const confirmPayMultiple = useBoolean();
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [tableData, setTableData] = useState<Payable[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState<'all' | 'open' | 'overdue' | 'paid'>('all');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);

  const loadPayables = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const canSyncSub =
        Boolean(user?.platformAdmin) || user?.role === 'admin' || user?.role === 'gestor';
      const syncKey = `erp_sub_payables_synced_${enterpriseId}`;
      if (canSyncSub && !window.sessionStorage.getItem(syncKey)) {
        await syncSubscriptionPayablesCf(enterpriseId)
          .then(() => window.sessionStorage.setItem(syncKey, '1'))
          .catch(() => {});
      }
      let rows = await listPayables(enterpriseId);
      if (rows.length === 0) {
        await seedDemoPayables(enterpriseId);
        rows = await listPayables(enterpriseId);
      }
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('finance.payablesLoadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t, user?.platformAdmin, user?.role]);

  const handleSeedDemo = async () => {
    if (!enterpriseId) return;
    setSeeding(true);
    try {
      await seedDemoPayables(enterpriseId);
      toast.success('Contas a pagar de teste geradas com sucesso!');
      await loadPayables();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar dados de teste');
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    loadPayables();
  }, [loadPayables]);

  const categoryOptions = useMemo(() => {
    const cats = Array.from(new Set(tableData.map((p) => p.category).filter(Boolean))) as string[];
    const base = cats.length > 0 ? cats : ['subscription', 'supplier', 'tax', 'rent', 'other'];
    return base.map((c) => ({
      value: c,
      label: t(`finance.categories.${c}`, { defaultValue: c }),
    }));
  }, [tableData, t]);

  // Indicadores de Alto Nível (4 KPIs)
  const metrics = useMemo(() => {
    let totalOpen = 0;
    let countOpen = 0;
    let totalOverdue = 0;
    let countOverdue = 0;
    let totalPaid = 0;
    let countPaid = 0;
    let totalSuppliers = 0;
    let countSuppliers = 0;

    tableData.forEach((p) => {
      if (p.status === 'open') {
        totalOpen += p.amount;
        countOpen += 1;

        if (isPayableOverdue(p)) {
          totalOverdue += p.amount;
          countOverdue += 1;
        }

        if (p.category === 'supplier' || Boolean(p.supplierId)) {
          totalSuppliers += p.amount;
          countSuppliers += 1;
        }
      } else if (p.status === 'paid') {
        totalPaid += p.amount;
        countPaid += 1;
      }
    });

    return {
      totalOpen,
      countOpen,
      totalOverdue,
      countOverdue,
      totalPaid,
      countPaid,
      totalSuppliers,
      countSuppliers,
    };
  }, [tableData]);

  const TABS = [
    { value: 'all', label: 'Todas', color: 'default', count: tableData.length },
    {
      value: 'open',
      label: 'Em aberto',
      color: 'warning',
      count: metrics.countOpen - metrics.countOverdue,
    },
    { value: 'overdue', label: 'Vencidas', color: 'error', count: metrics.countOverdue },
    { value: 'paid', label: 'Pagas', color: 'success', count: metrics.countPaid },
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

    if (currentTab === 'open') {
      rows = rows.filter((p) => p.status === 'open' && !isPayableOverdue(p));
    } else if (currentTab === 'overdue') {
      rows = rows.filter((p) => isPayableOverdue(p));
    } else if (currentTab === 'paid') {
      rows = rows.filter((p) => p.status === 'paid');
    }

    if (categoryFilters.length > 0) {
      rows = rows.filter((p) => categoryFilters.includes(p.category || ''));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.supplierName?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [categoryFilters, currentTab, searchQuery, table.order, table.orderBy, tableData]);

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
    const headers = ['Fornecedor', 'Descrição', 'Categoria', 'Valor', 'Vencimento', 'Status'];
    const csvRows = [
      headers.join(';'),
      ...dataFiltered.map((r) =>
        [
          `"${r.supplierName || ''}"`,
          `"${r.description || ''}"`,
          `"${r.category || ''}"`,
          r.amount.toFixed(2),
          `"${r.dueDate || ''}"`,
          isPayableOverdue(r) ? 'Vencida' : r.status === 'paid' ? 'Pago' : 'Em aberto',
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contas-a-pagar-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dataFiltered]);

  const handleMarkPaid = useCallback(
    async (row: Payable) => {
      if (!enterpriseId || !user) return;
      try {
        const session = await getOpenCashSession(enterpriseId);
        await markPayablePaid(enterpriseId, row, {
          session,
          createdBy: user.displayName || user.email || 'Operador',
        });
        toast.success(t('finance.payablePaidSuccess'));
        await loadPayables();
      } catch (error) {
        if (error instanceof NoOpenCashSessionError) {
          toast.error(
            'É necessário ter um caixa aberto no sistema para registrar a baixa financeira.'
          );
        } else {
          console.error(error);
          toast.error(getFirebaseErrorMessage(error, t('finance.payablePaidError')));
        }
      }
    },
    [enterpriseId, loadPayables, t, user]
  );

  const handleConfirmPayMultiple = useCallback(async () => {
    if (!enterpriseId || !user || !table.selected.length) return;
    try {
      const session = await getOpenCashSession(enterpriseId);
      const targets = tableData.filter(
        (r) => table.selected.includes(r.id) && r.status === 'open'
      );
      if (targets.length > 0) {
        await Promise.all(
          targets.map((r) =>
            markPayablePaid(enterpriseId, r, {
              session,
              createdBy: user.displayName || user.email || 'Operador',
            })
          )
        );
      }
      toast.success(`${targets.length} conta(s) baixada(s) no caixa com sucesso!`);
      table.onSelectAllRows(false, []);
      confirmPayMultiple.onFalse();
      await loadPayables();
    } catch (error) {
      if (error instanceof NoOpenCashSessionError) {
        toast.error(
          'É necessário ter um caixa aberto no sistema para registrar a baixa financeira.'
        );
      } else {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, t('finance.payablePaidError')));
      }
    }
  }, [confirmPayMultiple, enterpriseId, loadPayables, t, table, tableData, user]);

  const notFound = !dataFiltered.length && !loading;

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('finance.payablesHeading', { defaultValue: 'Contas a pagar' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.cash', { defaultValue: 'Financeiro' }), href: paths.dashboard.cash.root },
            { name: t('nav.payables', { defaultValue: 'A pagar' }) },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="soft"
                color="primary"
                disabled={seeding}
                onClick={handleSeedDemo}
                startIcon={<Iconify icon="solar:magic-stick-3-bold" />}
              >
                {seeding ? 'Gerando...' : 'Gerar dados de teste'}
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.cash.payableNew}
                variant="contained"
                startIcon={<Iconify icon="mingcute:add-line" />}
              >
                {t('finance.newPayable', { defaultValue: 'Nova conta a pagar' })}
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 4 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('products.errorMissingEnterprise', {
              defaultValue: 'Empresa não configurada na sessão',
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
                  title="Total a Pagar"
                  primaryValue={fCurrency(metrics.totalOpen)}
                  secondaryValue={`${metrics.countOpen} conta(s) em aberto`}
                  percent={
                    tableData.length ? Math.round((metrics.countOpen / tableData.length) * 100) : 0
                  }
                  icon="solar:clock-circle-bold-duotone"
                  color={theme.vars.palette.warning.main}
                />

                <ErpTableAnalytic
                  title="Vencidas (Em atraso)"
                  primaryValue={fCurrency(metrics.totalOverdue)}
                  secondaryValue={`${metrics.countOverdue} conta(s) vencida(s)`}
                  percent={
                    tableData.length
                      ? Math.round((metrics.countOverdue / tableData.length) * 100)
                      : 0
                  }
                  icon="solar:bell-bing-bold-duotone"
                  color={theme.vars.palette.error.main}
                />

                <ErpTableAnalytic
                  title="Fornecedores / Insumos"
                  primaryValue={fCurrency(metrics.totalSuppliers)}
                  secondaryValue={`${metrics.countSuppliers} título(s) de matéria-prima`}
                  percent={
                    tableData.length
                      ? Math.round((metrics.countSuppliers / tableData.length) * 100)
                      : 0
                  }
                  icon="solar:box-minimalistic-bold-duotone"
                  color={theme.vars.palette.info.main}
                />

                <ErpTableAnalytic
                  title="Total Pago"
                  primaryValue={fCurrency(metrics.totalPaid)}
                  secondaryValue={`${metrics.countPaid} baixada(s)`}
                  percent={
                    tableData.length ? Math.round((metrics.countPaid / tableData.length) * 100) : 0
                  }
                  icon="solar:check-circle-bold-duotone"
                  color={theme.vars.palette.success.main}
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
              searchPlaceholder="Pesquisar por fornecedor, descrição ou categoria..."
              onResetPage={table.onResetPage}
              selectFilters={[
                {
                  id: 'category',
                  label: 'Categoria',
                  options: categoryOptions,
                  value: categoryFilters,
                  onChange: setCategoryFilters,
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
                  <Tooltip title="Baixar (pagar) contas selecionadas">
                    <IconButton color="success" onClick={confirmPayMultiple.onTrue}>
                      <Iconify icon="solar:check-circle-bold" />
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
                            <PayableTableRow
                              key={row.id}
                              row={row}
                              selected={table.selected.includes(row.id)}
                              onSelectRow={() => table.onSelectRow(row.id)}
                              isOverdue={isPayableOverdue(row)}
                              onPay={() => handleMarkPaid(row)}
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
        open={confirmPayMultiple.value}
        onClose={confirmPayMultiple.onFalse}
        title="Confirmar Pagamento em Lote"
        content={`Tem certeza de que deseja marcar as ${table.selected.length} contas selecionadas como pagas e registrar a saída no caixa aberto?`}
        action={
          <Button variant="contained" color="success" onClick={handleConfirmPayMultiple}>
            Confirmar Pagamento
          </Button>
        }
      />
    </>
  );
}

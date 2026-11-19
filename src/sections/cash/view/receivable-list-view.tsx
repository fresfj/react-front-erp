import type { Customer } from 'src/api/firestore/customers';
import type { Receivable } from 'src/api/firestore/receivables';

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
import { listCustomers } from 'src/api/firestore/customers';
import { seedDemoReceivables } from 'src/api/firestore/seed-demo';
import { getOpenCashSession, NoOpenCashSessionError } from 'src/api/firestore/cash-sessions';
import {
  listReceivables,
  markReceivablePaid,
  settleCustomerDebtWithSession,
} from 'src/api/firestore/receivables';

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

import { ReceivableTableRow } from '../receivable-table-row';

import type { ReceivableRow } from '../receivable-table-row';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'customerName', label: 'Cliente / Documento', minWidth: 220, hideable: false },
  { id: 'refType', label: 'Origem', width: 170 },
  { id: 'installment', label: 'Parcela', width: 110 },
  { id: 'description', label: 'Descrição', minWidth: 200 },
  { id: 'amount', label: 'Valor', width: 130, align: 'right' },
  { id: 'dueDate', label: 'Vencimento', width: 160 },
  { id: 'status', label: 'Status', width: 130 },
  { id: 'actions', label: '', width: 80, align: 'right', hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  customerName: true,
  refType: true,
  installment: true,
  description: true,
  amount: true,
  dueDate: true,
  status: true,
  actions: true,
};

const ORIGIN_OPTIONS = [
  { value: 'credit_card', label: 'Repasse Cartão' },
  { value: 'sale', label: 'Crediário / Fiado' },
  { value: 'customer_debt', label: 'Débito Cliente' },
  { value: 'invoice', label: 'Faturamento' },
  { value: 'manual', label: 'Avulso' },
];

export function ReceivableListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const table = useTable({ defaultOrderBy: 'dueDate', defaultOrder: 'asc' });
  const confirmPayMultiple = useBoolean();
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState<'all' | 'open' | 'overdue' | 'paid'>('all');
  const [originFilters, setOriginFilters] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);

  const loadData = useCallback(async () => {
    if (!enterpriseId) {
      setReceivables([]);
      setCustomers({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let [recs, custs] = await Promise.all([
        listReceivables(enterpriseId),
        listCustomers(enterpriseId),
      ]);

      if (recs.length === 0) {
        await seedDemoReceivables(enterpriseId);
        [recs, custs] = await Promise.all([
          listReceivables(enterpriseId),
          listCustomers(enterpriseId),
        ]);
      }

      setReceivables(recs);
      const map: Record<string, Customer> = {};
      custs.forEach((c) => {
        map[c.id] = c;
      });
      setCustomers(map);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar contas a receber'));
      setReceivables([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSeedDemo = async () => {
    if (!enterpriseId) return;
    setSeeding(true);
    try {
      await seedDemoReceivables(enterpriseId);
      toast.success('Dados de contas a receber e clientes devedores gerados com sucesso!');
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(getFirebaseErrorMessage(err, 'Erro ao gerar dados de teste'));
    } finally {
      setSeeding(false);
    }
  };

  const rows: ReceivableRow[] = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    const normalRows: ReceivableRow[] = receivables.map((r) => {
      const cust = r.customerId ? customers[r.customerId] : undefined;
      const isOverdue = r.status === 'open' && Boolean(r.dueDate && r.dueDate < today);
      return {
        ...r,
        customerDocument: cust?.document,
        customerPhone: cust?.phone,
        customerEmail: cust?.email,
        customerDebt: cust?.currentDebt ?? 0,
        isOverdue,
      };
    });

    const openAmountsByCust: Record<string, number> = {};
    receivables.forEach((r) => {
      if (r.customerId && r.status === 'open') {
        openAmountsByCust[r.customerId] =
          Math.round(((openAmountsByCust[r.customerId] || 0) + r.amount) * 100) / 100;
      }
    });

    const syntheticDebtRows: ReceivableRow[] = [];
    Object.values(customers).forEach((cust) => {
      const debt = Number(cust.currentDebt ?? 0);
      if (debt <= 0.001) return;
      const openAmount = openAmountsByCust[cust.id] || 0;
      const uncoveredDebt = Math.round((debt - openAmount) * 100) / 100;
      if (uncoveredDebt > 0.001) {
        syntheticDebtRows.push({
          id: `debt-${cust.id}`,
          description: `Débito / Fiado em Aberto — ${cust.name}`,
          category: 'other',
          amount: uncoveredDebt,
          startDate: cust.createdAt ? cust.createdAt.slice(0, 10) : today,
          dueDate: today,
          customerId: cust.id,
          customerName: cust.name,
          recurrence: 'none',
          status: 'open',
          installmentIndex: 1,
          installmentCount: 1,
          active: true,
          refType: 'customer_debt',
          refId: cust.id,
          createdAt: cust.createdAt || today,
          updatedAt: cust.updatedAt || today,
          customerDocument: cust.document,
          customerPhone: cust.phone,
          customerEmail: cust.email,
          customerDebt: cust.currentDebt,
          isOverdue: false,
        });
      }
    });

    return [...normalRows, ...syntheticDebtRows];
  }, [customers, receivables]);

  // Indicadores de Alto Nível (4 KPIs)
  const metrics = useMemo(() => {
    let totalOpen = 0;
    let countOpen = 0;
    let totalOverdue = 0;
    let countOverdue = 0;
    let totalPaid = 0;
    let countPaid = 0;
    let totalCard = 0;
    let countCard = 0;

    rows.forEach((r) => {
      if (r.status === 'open') {
        totalOpen += r.amount;
        countOpen += 1;
        if (r.isOverdue) {
          totalOverdue += r.amount;
          countOverdue += 1;
        }
        if (r.refType === 'credit_card') {
          totalCard += r.amount;
          countCard += 1;
        }
      } else if (r.status === 'paid') {
        totalPaid += r.amount;
        countPaid += 1;
      }
    });

    const debtorCusts = Object.values(customers).filter((c) => (c.currentDebt ?? 0) > 0.001);
    const totalDebtorAmount = debtorCusts.reduce((acc, c) => acc + (c.currentDebt || 0), 0);

    return {
      totalOpen,
      countOpen,
      totalOverdue,
      countOverdue,
      totalPaid,
      countPaid,
      totalCard,
      countCard,
      debtorCount: debtorCusts.length,
      debtorTotal: totalDebtorAmount,
    };
  }, [rows, customers]);

  const TABS = [
    { value: 'all', label: 'Todas', color: 'default', count: rows.length },
    {
      value: 'open',
      label: 'Em aberto',
      color: 'warning',
      count: metrics.countOpen - metrics.countOverdue,
    },
    { value: 'overdue', label: 'Vencidas', color: 'error', count: metrics.countOverdue },
    { value: 'paid', label: 'Recebidas', color: 'success', count: metrics.countPaid },
  ] as const;

  const dataFiltered = useMemo(() => {
    let list = [...rows];

    const comparator = getComparator(table.order, table.orderBy) as (a: any, b: any) => number;
    const stabilizedThis = list.map((el, index) => [el, index] as const);
    stabilizedThis.sort((a, b) => {
      const order = comparator(a[0], b[0]);
      if (order !== 0) return order;
      return a[1] - b[1];
    });
    list = stabilizedThis.map((el) => el[0]);

    if (currentTab === 'open') {
      list = list.filter((r) => r.status === 'open' && !r.isOverdue);
    } else if (currentTab === 'overdue') {
      list = list.filter((r) => r.isOverdue);
    } else if (currentTab === 'paid') {
      list = list.filter((r) => r.status === 'paid');
    }

    if (originFilters.length > 0) {
      list = list.filter((r) => originFilters.includes(r.refType || 'manual'));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.customerName?.toLowerCase().includes(q) ||
          r.customerDocument?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [currentTab, originFilters, rows, searchQuery, table.order, table.orderBy]);

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
    const headers = ['Cliente', 'Documento', 'Origem', 'Parcela', 'Descrição', 'Valor', 'Vencimento', 'Status'];
    const csvRows = [
      headers.join(';'),
      ...dataFiltered.map((r) =>
        [
          `"${r.customerName || 'Cliente balcão'}"`,
          `"${r.customerDocument || ''}"`,
          `"${r.refType || 'manual'}"`,
          `"${r.installmentIndex || 1}/${r.installmentCount || 1}"`,
          `"${r.description || ''}"`,
          r.amount.toFixed(2),
          `"${r.dueDate || ''}"`,
          r.isOverdue ? 'Vencida' : r.status === 'paid' ? 'Recebido' : 'Em aberto',
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contas-a-receber-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dataFiltered]);

  const handleMarkPaid = useCallback(
    async (row: Receivable) => {
      if (!enterpriseId || !user) return;
      try {
        const session = await getOpenCashSession(enterpriseId);
        await markReceivablePaid(enterpriseId, row, {
          session,
          createdBy: user.displayName || user.email || 'Operador',
        });
        toast.success(
          t('finance.receivablePaidSuccess', { defaultValue: 'Conta baixada no caixa!' })
        );
        await loadData();
      } catch (error) {
        if (error instanceof NoOpenCashSessionError) {
          toast.error(
            'É necessário ter um caixa aberto no sistema para registrar a baixa financeira.'
          );
        } else {
          console.error(error);
          toast.error(getFirebaseErrorMessage(error, 'Erro ao baixar conta a receber'));
        }
      }
    },
    [enterpriseId, loadData, t, user]
  );

  const handleSettleCustomerDebt = useCallback(
    async (row: ReceivableRow) => {
      if (!enterpriseId || !user || !row.customerId) return;
      try {
        const session = await getOpenCashSession(enterpriseId);
        await settleCustomerDebtWithSession(
          enterpriseId,
          {
            id: row.customerId,
            name: row.customerName,
            currentDebt: row.customerDebt,
          },
          row.amount,
          {
            session,
            createdBy: user.displayName || user.email || 'Operador',
          }
        );
        toast.success(
          `Débito do cliente quitado no valor de R$ ${row.amount.toFixed(2)} e lançado no caixa!`
        );
        await loadData();
      } catch (error) {
        if (error instanceof NoOpenCashSessionError) {
          toast.error(
            'É necessário ter um caixa aberto no sistema para registrar o recebimento no caixa.'
          );
        } else {
          console.error(error);
          toast.error(getFirebaseErrorMessage(error, 'Erro ao quitar débito do cliente'));
        }
      }
    },
    [enterpriseId, loadData, user]
  );

  const handleConfirmPayMultiple = useCallback(async () => {
    if (!enterpriseId || !user || !table.selected.length) return;
    try {
      const session = await getOpenCashSession(enterpriseId);
      const targets = rows.filter(
        (r) =>
          table.selected.includes(r.id) && r.status === 'open' && !r.id.startsWith('debt-')
      );
      if (targets.length > 0) {
        await Promise.all(
          targets.map((r) =>
            markReceivablePaid(enterpriseId, r, {
              session,
              createdBy: user.displayName || user.email || 'Operador',
            })
          )
        );
      }
      toast.success(`${targets.length} título(s) recebido(s) e lançado(s) no caixa!`);
      table.onSelectAllRows(false, []);
      confirmPayMultiple.onFalse();
      await loadData();
    } catch (error) {
      if (error instanceof NoOpenCashSessionError) {
        toast.error(
          'É necessário ter um caixa aberto no sistema para registrar o recebimento no caixa.'
        );
      } else {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, 'Erro ao baixar títulos selecionados'));
      }
    }
  }, [confirmPayMultiple, enterpriseId, loadData, rows, table, user]);

  const notFound = !dataFiltered.length && !loading;

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('finance.receivablesTitle', { defaultValue: 'Contas a Receber' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.cash', { defaultValue: 'Financeiro' }), href: paths.dashboard.cash.root },
            { name: t('finance.receivablesTitle', { defaultValue: 'Contas a Receber' }) },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="outlined"
                color="inherit"
                disabled={seeding}
                onClick={handleSeedDemo}
                startIcon={<Iconify icon="solar:magic-stick-3-bold" />}
              >
                {seeding ? 'Gerando...' : 'Gerar dados de teste'}
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.cash.receivableNew}
                variant="contained"
                startIcon={<Iconify icon="mingcute:add-line" />}
              >
                {t('finance.newReceivable', { defaultValue: 'Nova Conta' })}
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 4 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('products.errorMissingEnterprise', {
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
                  title="Total a Receber"
                  primaryValue={fCurrency(metrics.totalOpen)}
                  secondaryValue={`${metrics.countOpen} promessa(s) em aberto`}
                  percent={rows.length ? Math.round((metrics.countOpen / rows.length) * 100) : 0}
                  icon="solar:clock-circle-bold-duotone"
                  color={theme.vars.palette.warning.main}
                />

                <ErpTableAnalytic
                  title="Vencidos (Em atraso)"
                  primaryValue={fCurrency(metrics.totalOverdue)}
                  secondaryValue={`${metrics.countOverdue} título(s) vencido(s)`}
                  percent={
                    rows.length ? Math.round((metrics.countOverdue / rows.length) * 100) : 0
                  }
                  icon="solar:bell-bing-bold-duotone"
                  color={theme.vars.palette.error.main}
                />

                <ErpTableAnalytic
                  title="Repasses e Fiado"
                  primaryValue={fCurrency(metrics.totalCard + metrics.debtorTotal)}
                  secondaryValue={`${metrics.countCard} cartão • ${metrics.debtorCount} fiado`}
                  percent={100}
                  icon="solar:card-2-bold-duotone"
                  color={theme.vars.palette.info.main}
                />

                <ErpTableAnalytic
                  title="Total Recebido"
                  primaryValue={fCurrency(metrics.totalPaid)}
                  secondaryValue={`${metrics.countPaid} baixado(s)`}
                  percent={rows.length ? Math.round((metrics.countPaid / rows.length) * 100) : 0}
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
              searchPlaceholder="Pesquisar por cliente, CPF/CNPJ ou descrição..."
              onResetPage={table.onResetPage}
              selectFilters={[
                {
                  id: 'origin',
                  label: 'Origem',
                  options: ORIGIN_OPTIONS,
                  value: originFilters,
                  onChange: setOriginFilters,
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
                  <Tooltip title="Baixar (receber) títulos selecionados">
                    <IconButton color="success" onClick={confirmPayMultiple.onTrue}>
                      <Iconify icon="solar:check-circle-bold" />
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
                            <ReceivableTableRow
                              key={row.id}
                              row={row}
                              selected={table.selected.includes(row.id)}
                              onSelectRow={() => table.onSelectRow(row.id)}
                              onPay={() => handleMarkPaid(row)}
                              onSettleDebt={() => handleSettleCustomerDebt(row)}
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
        title="Confirmar Recebimento em Lote"
        content={`Tem certeza de que deseja marcar os ${table.selected.length} títulos selecionados como recebidos e lançar a entrada no caixa aberto?`}
        action={
          <Button variant="contained" color="success" onClick={handleConfirmPayMultiple}>
            Confirmar Recebimento
          </Button>
        }
      />
    </>
  );
}

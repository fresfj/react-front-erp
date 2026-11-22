import type { Customer } from 'src/api/firestore/customers';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import TableBody from '@mui/material/TableBody';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';
import { useSetState } from 'src/hooks/use-set-state';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import { getOpenCashSession } from 'src/api/firestore/cash-sessions';
import { settleCustomerDebtWithSession } from 'src/api/firestore/receivables';
import { listCustomers, deactivateCustomer } from 'src/api/firestore/customers';

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
  rowInPage,
  TableNoData,
  getComparator,
  TableSkeleton,
  TableEmptyRows,
  TableHeadCustom,
  TableSelectedAction,
  TablePaginationCustom,
} from 'src/components/table';

import { useAuthContext } from 'src/auth/hooks';

import { CustomerTableRow } from '../customer-table-row';

import type { CustomerTableFilters } from '../customer-table-toolbar';

// ----------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'with_debt', label: 'Com Débito' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
];

const CREDIT_SITUATION_OPTIONS = [
  { value: 'has_debt', label: 'Com Débito (Fiado)' },
  { value: 'no_debt', label: 'Sem Débito' },
  { value: 'has_limit', label: 'Com Limite de Crédito' },
];

const TABLE_HEAD = [
  { id: 'name', label: 'Cliente', hideable: false },
  { id: 'phone', label: 'Telefone / WhatsApp', width: 180 },
  { id: 'creditLimit', label: 'Limite de Crédito', width: 160 },
  { id: 'currentDebt', label: 'Débito Atual (Fiado)', width: 170 },
  { id: 'status', label: 'Status', width: 110 },
  { id: 'actions', label: '', width: 110, hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  name: true,
  phone: true,
  creditLimit: true,
  currentDebt: true,
  status: true,
  actions: true,
};

// ----------------------------------------------------------------------

export function CustomerListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const table = useTable();
  const router = useRouter();
  const { user } = useAuthContext();

  const confirmMultiple = useBoolean();
  const settleDialog = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const filters = useSetState<CustomerTableFilters>({ name: '', status: 'all' });

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Customer[]>([]);
  const [creditFilters, setCreditFilters] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [settleTarget, setSettleTarget] = useState<Customer | null>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);

  const loadCustomers = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listCustomers(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar clientes'));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const metrics = useMemo(() => {
    const activeCount = tableData.filter((c) => c.active).length;
    const withDebt = tableData.filter((c) => (c.currentDebt || 0) > 0);
    const totalDebt = tableData.reduce((acc, c) => acc + (c.currentDebt || 0), 0);
    const totalCreditLimit = tableData.reduce((acc, c) => acc + (c.creditLimit || 0), 0);

    return {
      total: tableData.length,
      activeCount,
      withDebtCount: withDebt.length,
      totalDebt,
      totalCreditLimit,
      percentActive: tableData.length ? Math.round((activeCount / tableData.length) * 100) : 0,
      percentWithDebt: tableData.length
        ? Math.round((withDebt.length / tableData.length) * 100)
        : 0,
    };
  }, [tableData]);

  const dataFiltered = useMemo(() => {
    let list = applyFilter({
      inputData: tableData,
      comparator: getComparator(table.order, table.orderBy),
      filters: filters.state,
    });

    if (creditFilters.length > 0) {
      list = list.filter((c) => {
        const hasDebt = (c.currentDebt || 0) > 0;
        const hasLimit = (c.creditLimit || 0) > 0;
        return (
          (creditFilters.includes('has_debt') && hasDebt) ||
          (creditFilters.includes('no_debt') && !hasDebt) ||
          (creditFilters.includes('has_limit') && hasLimit)
        );
      });
    }

    return list;
  }, [creditFilters, filters.state, table.order, table.orderBy, tableData]);

  const dataInPage = rowInPage(dataFiltered, table.page, table.rowsPerPage);

  const canReset =
    !!filters.state.name || filters.state.status !== 'all' || creditFilters.length > 0;
  const notFound = (!dataFiltered.length && canReset) || (!dataFiltered.length && !loading);

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
    const headers = ['Cliente', 'Documento', 'Telefone', 'E-mail', 'Limite Crédito', 'Débito Atual', 'Status'];
    const csvRows = [
      headers.join(';'),
      ...dataFiltered.map((r) =>
        [
          `"${r.name || ''}"`,
          `"${r.document || ''}"`,
          `"${r.phone || ''}"`,
          `"${r.email || ''}"`,
          (r.creditLimit || 0).toFixed(2),
          (r.currentDebt || 0).toFixed(2),
          r.active ? 'Ativo' : 'Inativo',
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dataFiltered]);

  const handleEditRow = useCallback(
    (id: string) => {
      router.push(paths.dashboard.customers.edit(id));
    },
    [router]
  );

  const handleDeleteRow = useCallback(
    async (id: string) => {
      if (!enterpriseId) return;

      try {
        await deactivateCustomer(enterpriseId, id);
        toast.success('Cliente desativado com sucesso!');
        await loadCustomers();
        table.onUpdatePageDeleteRow(dataInPage.length);
      } catch (error) {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, 'Erro ao desativar cliente'));
      }
    },
    [dataInPage.length, enterpriseId, loadCustomers, table]
  );

  const handleDeleteRows = useCallback(async () => {
    if (!enterpriseId || !table.selected.length) return;

    try {
      await Promise.all(table.selected.map((id) => deactivateCustomer(enterpriseId, id)));
      toast.success(`${table.selected.length} clientes desativados com sucesso!`);
      table.onSelectAllRows(false, []);
      confirmMultiple.onFalse();
      await loadCustomers();
      table.onUpdatePageDeleteRows({
        totalRowsInPage: dataInPage.length,
        totalRowsFiltered: dataFiltered.length,
      });
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao desativar clientes selecionados'));
    }
  }, [confirmMultiple, dataFiltered.length, dataInPage.length, enterpriseId, loadCustomers, table]);

  const handleFilterStatus = useCallback(
    (_event: React.SyntheticEvent, newValue: string) => {
      table.onResetPage();
      filters.setState({ status: newValue });
    },
    [filters, table]
  );

  const handleOpenSettle = useCallback(
    (customer: Customer) => {
      setSettleTarget(customer);
      setSettleAmount(customer.currentDebt || 0);
      settleDialog.onTrue();
    },
    [settleDialog]
  );

  const handleConfirmSettle = useCallback(async () => {
    if (!enterpriseId || !settleTarget || settleAmount <= 0) return;

    try {
      const openSession = await getOpenCashSession(enterpriseId);
      if (!openSession) {
        toast.error('Abra o caixa em Financeiro → Caixa antes de receber um pagamento de débito.');
        return;
      }
      await settleCustomerDebtWithSession(enterpriseId, settleTarget, settleAmount, {
        session: openSession,
        createdBy: user?.email,
      });
      toast.success('Pagamento de débito registrado no caixa com sucesso!');
      setSettleTarget(null);
      settleDialog.onFalse();
      await loadCustomers();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao baixar débito'));
    }
  }, [enterpriseId, loadCustomers, settleAmount, settleDialog, settleTarget, user?.email]);

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('customers.listHeading', { defaultValue: 'Clientes' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            {
              name: t('nav.customers', { defaultValue: 'Clientes' }),
              href: paths.dashboard.customers.root,
            },
            { name: t('customers.listHeading', { defaultValue: 'Lista de clientes' }) },
          ]}
          action={
            <Button
              component={RouterLink}
              href={paths.dashboard.customers.create}
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
            >
              {t('customers.newCustomer', { defaultValue: 'Novo cliente' })}
            </Button>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent filled title="Empresa não selecionada na sessão" sx={{ py: 10 }} />
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
                  title="Total de Clientes"
                  primaryValue={`${metrics.total} clientes`}
                  secondaryValue={`${metrics.activeCount} ativos no cadastro`}
                  percent={100}
                  icon="solar:users-group-rounded-bold-duotone"
                  color={theme.vars.palette.primary.main}
                />

                <ErpTableAnalytic
                  title="Clientes Ativos"
                  primaryValue={`${metrics.activeCount} ativos`}
                  secondaryValue={`${metrics.percentActive}% da base`}
                  percent={metrics.percentActive}
                  icon="solar:user-check-rounded-bold-duotone"
                  color={theme.vars.palette.success.main}
                />

                <ErpTableAnalytic
                  title="Com Débito (Fiado)"
                  primaryValue={fCurrency(metrics.totalDebt)}
                  secondaryValue={`${metrics.withDebtCount} cliente(s) com débito`}
                  percent={metrics.percentWithDebt}
                  icon="solar:wad-of-money-bold-duotone"
                  color={theme.vars.palette.error.main}
                />

                <ErpTableAnalytic
                  title="Limite de Crédito"
                  primaryValue={fCurrency(metrics.totalCreditLimit)}
                  secondaryValue="Total liberado p/ crediário"
                  percent={100}
                  icon="solar:card-2-bold-duotone"
                  color={theme.vars.palette.info.main}
                />
              </Stack>
            </Scrollbar>

            <Divider />

            <Tabs
              value={filters.state.status}
              onChange={handleFilterStatus}
              sx={{
                px: 2.5,
                boxShadow: (th) =>
                  `inset 0 -2px 0 0 ${varAlpha(th.vars.palette.grey['500Channel'], 0.08)}`,
              }}
            >
              {STATUS_OPTIONS.map((tab) => {
                let count = tableData.length;
                let color:
                  | 'default'
                  | 'primary'
                  | 'secondary'
                  | 'info'
                  | 'success'
                  | 'warning'
                  | 'error' = 'default';

                if (tab.value === 'with_debt') {
                  count = tableData.filter((c) => (c.currentDebt || 0) > 0).length;
                  color = count > 0 ? 'error' : 'default';
                } else if (tab.value === 'active') {
                  count = tableData.filter((c) => c.active).length;
                  color = 'success';
                } else if (tab.value === 'inactive') {
                  count = tableData.filter((c) => !c.active).length;
                  color = 'default';
                }

                return (
                  <Tab
                    key={tab.value}
                    iconPosition="end"
                    value={tab.value}
                    label={tab.label}
                    icon={
                      <Label
                        variant={
                          ((tab.value === 'all' || tab.value === filters.state.status) &&
                            'filled') ||
                          'soft'
                        }
                        color={color}
                      >
                        {count}
                      </Label>
                    }
                  />
                );
              })}
            </Tabs>

            <ErpTableToolbar
              searchQuery={filters.state.name}
              onSearchChange={(e) => filters.setState({ name: e.target.value })}
              searchPlaceholder="Pesquisar por nome, CPF/CNPJ, e-mail ou telefone..."
              onResetPage={table.onResetPage}
              selectFilters={[
                {
                  id: 'creditSituation',
                  label: 'Situação Financeira',
                  options: CREDIT_SITUATION_OPTIONS,
                  value: creditFilters,
                  onChange: setCreditFilters,
                },
              ]}
              columns={TABLE_HEAD}
              visibleColumns={visibleColumns}
              onToggleColumn={handleToggleColumn}
              onResetColumns={handleResetColumns}
              onExportCsv={handleExportCsv}
              filteredResults={dataFiltered.length}
            />

            <Box sx={{ position: 'relative' }}>
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
                  <Tooltip title="Desativar selecionados">
                    <IconButton color="error" onClick={confirmMultiple.onTrue}>
                      <Iconify icon="solar:trash-bin-trash-bold" />
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
                        {dataInPage.map((row) => (
                          <CustomerTableRow
                            key={row.id}
                            row={row}
                            selected={table.selected.includes(row.id)}
                            onSelectRow={() => table.onSelectRow(row.id)}
                            onEditRow={() => handleEditRow(row.id)}
                            onDeleteRow={() => handleDeleteRow(row.id)}
                            onSettleDebt={() => handleOpenSettle(row)}
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
            </Box>

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

      {/* Modal para Quitar Débito */}
      <Dialog open={settleDialog.value} onClose={settleDialog.onFalse} fullWidth maxWidth="xs">
        <DialogTitle>Baixar Débito do Cliente</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField disabled label="Cliente" value={settleTarget?.name || ''} />
            <TextField
              type="number"
              label="Valor recebido (R$)"
              value={settleAmount}
              onChange={(e) => setSettleAmount(Math.max(0, Number(e.target.value)))}
              inputProps={{ min: 0.01, step: 'any' }}
              helperText={`Débito em aberto: R$ ${(settleTarget?.currentDebt || 0).toFixed(2)}`}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={settleDialog.onFalse}>
            Cancelar
          </Button>
          <Button variant="contained" color="success" onClick={handleConfirmSettle}>
            Confirmar Recebimento
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de confirmação para desativar em massa */}
      <ConfirmDialog
        open={confirmMultiple.value}
        onClose={confirmMultiple.onFalse}
        title="Desativar Clientes Selecionados"
        content={`Tem certeza de que deseja desativar ${table.selected.length} clientes selecionados?`}
        action={
          <Button variant="contained" color="error" onClick={handleDeleteRows}>
            Desativar
          </Button>
        }
      />
    </>
  );
}

// ----------------------------------------------------------------------

type ApplyFilterProps = {
  inputData: Customer[];
  filters: CustomerTableFilters;
  comparator: (a: any, b: any) => number;
};

function applyFilter({ inputData, comparator, filters }: ApplyFilterProps) {
  const { name, status } = filters;

  const stabilizedThis = inputData.map((el, index) => [el, index] as const);

  stabilizedThis.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) return order;
    return a[1] - b[1];
  });

  inputData = stabilizedThis.map((el) => el[0]);

  if (status === 'with_debt') {
    inputData = inputData.filter((customer) => (customer.currentDebt || 0) > 0);
  } else if (status === 'active') {
    inputData = inputData.filter((customer) => customer.active);
  } else if (status === 'inactive') {
    inputData = inputData.filter((customer) => !customer.active);
  }

  if (name) {
    const query = name.toLowerCase();
    inputData = inputData.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        (customer.document && customer.document.toLowerCase().includes(query)) ||
        (customer.email && customer.email.toLowerCase().includes(query)) ||
        (customer.phone && customer.phone.toLowerCase().includes(query))
    );
  }

  return inputData;
}

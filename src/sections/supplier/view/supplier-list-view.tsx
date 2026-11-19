import type { Supplier } from 'src/api/firestore/suppliers';

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

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import { listSuppliers, deactivateSupplier } from 'src/api/firestore/suppliers';

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

import { SupplierTableRow } from '../supplier-table-row';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'name', label: 'Fornecedor / Razão Social', hideable: false },
  { id: 'phone', label: 'Telefone' },
  { id: 'email', label: 'E-mail' },
  { id: 'contactPerson', label: 'Contato' },
  { id: 'active', label: 'Status' },
  { id: 'actions', label: '', width: 88, hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  name: true,
  phone: true,
  email: true,
  contactPerson: true,
  active: true,
  actions: true,
};

const SUPPLIER_DATA_OPTIONS = [
  { value: 'has_doc', label: 'Com CNPJ/CPF' },
  { value: 'has_phone', label: 'Com Telefone' },
  { value: 'has_email', label: 'Com E-mail' },
];

// ----------------------------------------------------------------------

export function SupplierListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuthContext();
  const table = useTable({ defaultOrderBy: 'name', defaultOrder: 'asc' });

  const confirmSingle = useBoolean();
  const confirmMultiple = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const canWrite = user?.role !== 'operador';

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Supplier[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [dataFilters, setDataFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const loadSuppliers = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listSuppliers(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('suppliers.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleAskDeactivate = (id: string) => {
    setDeactivateId(id);
    confirmSingle.onTrue();
  };

  const handleConfirmDeactivateSingle = async () => {
    if (!enterpriseId || !deactivateId || !canWrite) return;
    try {
      await deactivateSupplier(enterpriseId, deactivateId);
      toast.success(t('suppliers.deactivateSuccess'));
      await loadSuppliers();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('suppliers.deactivateError')));
    } finally {
      confirmSingle.onFalse();
      setDeactivateId(null);
    }
  };

  const handleConfirmDeactivateMultiple = async () => {
    if (!enterpriseId || !table.selected.length || !canWrite) return;
    try {
      await Promise.all(table.selected.map((id) => deactivateSupplier(enterpriseId, id)));
      toast.success(`${table.selected.length} fornecedores desativados com sucesso!`);
      table.onSelectAllRows(false, []);
      await loadSuppliers();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('suppliers.deactivateError')));
    } finally {
      confirmMultiple.onFalse();
    }
  };

  const activeCount = useMemo(() => tableData.filter((r) => r.active).length, [tableData]);
  const inactiveCount = useMemo(() => tableData.filter((r) => !r.active).length, [tableData]);
  const withDocCount = useMemo(
    () => tableData.filter((r) => Boolean(r.document?.trim())).length,
    [tableData]
  );

  const percentActive = tableData.length ? Math.round((activeCount / tableData.length) * 100) : 0;
  const percentInactive = tableData.length
    ? Math.round((inactiveCount / tableData.length) * 100)
    : 0;
  const percentWithDoc = tableData.length
    ? Math.round((withDocCount / tableData.length) * 100)
    : 0;

  const TABS = [
    { value: 'all', label: 'Todos', color: 'default', count: tableData.length },
    { value: 'active', label: 'Ativos', color: 'success', count: activeCount },
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

    if (statusFilter === 'active') {
      rows = rows.filter((r) => r.active);
    } else if (statusFilter === 'inactive') {
      rows = rows.filter((r) => !r.active);
    }

    if (dataFilters.length > 0) {
      rows = rows.filter((r) =>
        dataFilters.every((f) => {
          if (f === 'has_doc') return Boolean(r.document?.trim());
          if (f === 'has_phone') return Boolean(r.phone?.trim());
          if (f === 'has_email') return Boolean(r.email?.trim());
          return true;
        })
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.tradeName?.toLowerCase().includes(q) ||
          r.document?.includes(q) ||
          r.phone?.includes(q) ||
          r.email?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [dataFilters, searchQuery, statusFilter, table.order, table.orderBy, tableData]);

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
    const headers = ['Razão Social', 'Nome Fantasia', 'CNPJ/CPF', 'Telefone', 'E-mail', 'Contato', 'Status'];
    const csvRows = [
      headers.join(';'),
      ...dataFiltered.map((r) =>
        [
          `"${r.name || ''}"`,
          `"${r.tradeName || ''}"`,
          `"${r.document || ''}"`,
          `"${r.phone || ''}"`,
          `"${r.email || ''}"`,
          `"${r.contactPerson || ''}"`,
          r.active ? 'Ativo' : 'Inativo',
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fornecedores-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dataFiltered]);

  const notFound =
    !dataFiltered.length && (!!searchQuery || statusFilter !== 'all' || dataFilters.length > 0);

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('suppliers.listHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.suppliers'), href: paths.dashboard.suppliers.root },
            { name: t('suppliers.listHeading') },
          ]}
          action={
            <Button
              component={RouterLink}
              href={paths.dashboard.suppliers.create}
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
            >
              {t('suppliers.newSupplier')}
            </Button>
          }
          sx={{ mb: { xs: 3, md: 4 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('suppliers.errorMissingEnterprise')}
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
                  title="Total Fornecedores"
                  primaryValue={`${tableData.length} cadastrados`}
                  secondaryValue="Base de parceiros"
                  percent={100}
                  icon="solar:buildings-2-bold-duotone"
                  color={theme.vars.palette.primary.main}
                />

                <ErpTableAnalytic
                  title="Fornecedores Ativos"
                  primaryValue={`${activeCount} ativos`}
                  secondaryValue={`${percentActive}% do total`}
                  percent={percentActive}
                  icon="solar:check-circle-bold-duotone"
                  color={theme.vars.palette.success.main}
                />

                <ErpTableAnalytic
                  title="Com CNPJ / CPF"
                  primaryValue={`${withDocCount} regularizados`}
                  secondaryValue={`${percentWithDoc}% com documento`}
                  percent={percentWithDoc}
                  icon="solar:document-text-bold-duotone"
                  color={theme.vars.palette.info.main}
                />

                <ErpTableAnalytic
                  title="Inativos"
                  primaryValue={`${inactiveCount} inativos`}
                  secondaryValue={`${percentInactive}% do total`}
                  percent={percentInactive}
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
              searchPlaceholder="Pesquisar por fornecedor, CNPJ/CPF, telefone ou e-mail..."
              onResetPage={table.onResetPage}
              selectFilters={[
                {
                  id: 'supplierData',
                  label: 'Dados Cadastrais',
                  options: SUPPLIER_DATA_OPTIONS,
                  value: dataFilters,
                  onChange: setDataFilters,
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
                  <Tooltip title="Desativar selecionados">
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
                            <SupplierTableRow
                              key={row.id}
                              row={row}
                              selected={table.selected.includes(row.id)}
                              onSelectRow={() => table.onSelectRow(row.id)}
                              onEditRow={() => router.push(paths.dashboard.suppliers.edit(row.id))}
                              onDeleteRow={() => handleAskDeactivate(row.id)}
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
        open={confirmSingle.value}
        onClose={() => {
          setDeactivateId(null);
          confirmSingle.onFalse();
        }}
        title={t('suppliers.deactivate')}
        content={t('suppliers.deactivateConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivateSingle}>
            {t('suppliers.deactivate')}
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmMultiple.value}
        onClose={confirmMultiple.onFalse}
        title="Desativar Fornecedores Selecionados"
        content={`Tem certeza de que deseja desativar ${table.selected.length} fornecedores selecionados?`}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivateMultiple}>
            Desativar Todos
          </Button>
        }
      />
    </>
  );
}

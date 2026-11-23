import type { Product } from 'src/api/firestore/products';

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
import { exportProductsToCsv } from 'src/utils/product-import-export';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import { seedDemoErpCatalog } from 'src/api/firestore/seed-demo';
import { listProducts, deactivateProduct } from 'src/api/firestore/products';

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

import { ProductTableRow } from '../product-table-row';
import { ProductImportDialog } from '../product-import-dialog';
import { ProductBulkFiscalDialog } from '../product-bulk-fiscal-dialog';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'name', label: 'Produto / SKU', hideable: false },
  { id: 'type', label: 'Tipo' },
  { id: 'salePrice', label: 'Preço Venda / Custo' },
  { id: 'minStock', label: 'Estoque Mínimo' },
  { id: 'active', label: 'Status' },
  { id: 'createdAt', label: 'Cadastrado em' },
  { id: 'actions', label: '', width: 88, hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  name: true,
  type: true,
  salePrice: true,
  minStock: true,
  active: true,
  createdAt: true,
  actions: true,
};

const PRODUCT_TYPE_OPTIONS = [
  { value: 'raw', label: 'Matéria-prima' },
  { value: 'finished', label: 'Produto Acabado' },
];

// ----------------------------------------------------------------------

export function ProductListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuthContext();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });

  const confirmSingle = useBoolean();
  const confirmMultiple = useBoolean();
  const importDialog = useBoolean();
  const bulkFiscalDialog = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Product[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'raw' | 'finished' | 'active' | 'inactive'
  >('all');
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [unitFilters, setUnitFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setTableData(await listProducts(enterpriseId));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('products.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleAskDeactivate = (id: string) => {
    setDeactivateId(id);
    confirmSingle.onTrue();
  };

  const handleConfirmDeactivateSingle = async () => {
    if (!enterpriseId || !deactivateId) return;
    try {
      await deactivateProduct(enterpriseId, deactivateId);
      toast.success(
        t('products.deactivateSuccess', { defaultValue: 'Produto desativado com sucesso!' })
      );
      await loadProducts();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('products.deactivateError')));
    } finally {
      confirmSingle.onFalse();
      setDeactivateId(null);
    }
  };

  const handleConfirmDeactivateMultiple = async () => {
    if (!enterpriseId || !table.selected.length) return;
    try {
      await Promise.all(table.selected.map((id) => deactivateProduct(enterpriseId, id)));
      toast.success(`${table.selected.length} produtos desativados com sucesso!`);
      table.onSelectAllRows(false, []);
      await loadProducts();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('products.deactivateError')));
    } finally {
      confirmMultiple.onFalse();
    }
  };

  const unitOptions = useMemo(() => {
    const units = Array.from(new Set(tableData.map((p) => p.unit).filter(Boolean))) as string[];
    const base = units.length > 0 ? units : ['un', 'kg', 'L', 'cx'];
    return base.map((u) => ({ value: u, label: u.toUpperCase() }));
  }, [tableData]);

  // Metrics for Analytics strip (4 items)
  const metrics = useMemo(() => {
    let rawCount = 0;
    let finishedCount = 0;
    let activeCount = 0;
    let inactiveCount = 0;

    tableData.forEach((p) => {
      if (p.type === 'raw') rawCount += 1;
      if (p.type === 'finished') finishedCount += 1;
      if (p.active) activeCount += 1;
      else inactiveCount += 1;
    });

    return {
      total: tableData.length,
      rawCount,
      finishedCount,
      activeCount,
      inactiveCount,
    };
  }, [tableData]);

  const TABS = [
    { value: 'all', label: 'Todos', color: 'default', count: tableData.length },
    { value: 'raw', label: 'Matéria-prima', color: 'warning', count: metrics.rawCount },
    { value: 'finished', label: 'Produto Acabado', color: 'info', count: metrics.finishedCount },
    { value: 'active', label: 'Ativos', color: 'success', count: metrics.activeCount },
    { value: 'inactive', label: 'Inativos', color: 'default', count: metrics.inactiveCount },
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
      rows = rows.filter((r) => r.type === 'raw');
    } else if (statusFilter === 'finished') {
      rows = rows.filter((r) => r.type === 'finished');
    } else if (statusFilter === 'active') {
      rows = rows.filter((r) => r.active);
    } else if (statusFilter === 'inactive') {
      rows = rows.filter((r) => !r.active);
    }

    if (typeFilters.length > 0) {
      rows = rows.filter((r) => typeFilters.includes(r.type));
    }

    if (unitFilters.length > 0) {
      rows = rows.filter((r) => unitFilters.includes(r.unit || ''));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.sku?.toLowerCase().includes(q) ||
          r.ean?.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [
    searchQuery,
    statusFilter,
    typeFilters,
    unitFilters,
    table.order,
    table.orderBy,
    tableData,
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
    const csvContent = exportProductsToCsv(dataFiltered);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `produtos-catalogo-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dataFiltered]);

  const notFound =
    !dataFiltered.length &&
    (!!searchQuery || statusFilter !== 'all' || typeFilters.length > 0 || unitFilters.length > 0);

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('products.listHeading', { defaultValue: 'Lista de Produtos' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.products'), href: paths.dashboard.products.root },
            { name: t('products.listHeading', { defaultValue: 'Lista de Produtos' }) },
          ]}
          action={
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<Iconify icon="solar:cloud-upload-bold-duotone" />}
                onClick={importDialog.onTrue}
              >
                Importar / Exportar
              </Button>
              <Button
                variant="soft"
                color="info"
                startIcon={<Iconify icon="solar:magic-stick-3-bold" />}
                onClick={async () => {
                  if (!enterpriseId) return;
                  try {
                    await seedDemoErpCatalog(enterpriseId);
                    toast.success(
                      'Produtos, Combos, Promoções, Fornecedor e Lotes de teste carregados com sucesso!'
                    );
                    await loadProducts();
                  } catch (error) {
                    toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar produtos demo'));
                  }
                }}
              >
                Produtos de Teste
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.products.create}
                variant="contained"
                startIcon={<Iconify icon="mingcute:add-line" />}
              >
                {t('products.newProduct', { defaultValue: 'Novo produto' })}
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 4 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('products.errorMissingEnterprise', { defaultValue: 'Empresa não selecionada' })}
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
                  title="Catálogo de Produtos"
                  primaryValue={`${metrics.total} itens`}
                  secondaryValue={`${metrics.activeCount} ativos para venda`}
                  percent={100}
                  icon="solar:box-minimalistic-bold-duotone"
                  color={theme.vars.palette.primary.main}
                />

                <ErpTableAnalytic
                  title="Matéria-prima (Insumos)"
                  primaryValue={`${metrics.rawCount} produtos`}
                  secondaryValue="Uso no Beneficiamento"
                  percent={metrics.total ? Math.round((metrics.rawCount / metrics.total) * 100) : 0}
                  icon="solar:layers-bold-duotone"
                  color={theme.vars.palette.warning.main}
                />

                <ErpTableAnalytic
                  title="Produtos Acabados"
                  primaryValue={`${metrics.finishedCount} produtos`}
                  secondaryValue="Disponíveis no PDV"
                  percent={
                    metrics.total ? Math.round((metrics.finishedCount / metrics.total) * 100) : 0
                  }
                  icon="solar:cart-4-bold-duotone"
                  color={theme.vars.palette.info.main}
                />

                <ErpTableAnalytic
                  title="Status Ativo"
                  primaryValue={`${metrics.activeCount} itens`}
                  secondaryValue={`${metrics.inactiveCount} desativados`}
                  percent={
                    metrics.total ? Math.round((metrics.activeCount / metrics.total) * 100) : 0
                  }
                  icon="solar:check-circle-bold-duotone"
                  color={theme.vars.palette.success.main}
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
              searchPlaceholder="Pesquisar por produto, SKU, código de barras..."
              onResetPage={table.onResetPage}
              selectFilters={[
                {
                  id: 'productType',
                  label: 'Tipo',
                  options: PRODUCT_TYPE_OPTIONS,
                  value: typeFilters,
                  onChange: setTypeFilters,
                },
                {
                  id: 'unit',
                  label: 'Unidade',
                  options: unitOptions,
                  value: unitFilters,
                  onChange: setUnitFilters,
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
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Atualizar dados fiscais (NCM / Origem / CST-CSOSN)">
                      <IconButton color="primary" onClick={bulkFiscalDialog.onTrue}>
                        <Iconify icon="solar:document-text-bold" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Desativar selecionados">
                      <IconButton color="error" onClick={confirmMultiple.onTrue}>
                        <Iconify icon="solar:trash-bin-trash-bold" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
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
                            <ProductTableRow
                              key={row.id}
                              row={row}
                              selected={table.selected.includes(row.id)}
                              onSelectRow={() => table.onSelectRow(row.id)}
                              onViewRow={() => router.push(paths.dashboard.products.edit(row.id))}
                              onEditRow={() => router.push(paths.dashboard.products.edit(row.id))}
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
        title="Desativar Produto"
        content="Tem certeza de que deseja desativar este produto? Ele não aparecerá mais como ativo no PDV."
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivateSingle}>
            Desativar
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmMultiple.value}
        onClose={confirmMultiple.onFalse}
        title="Desativar Produtos Selecionados"
        content={`Tem certeza de que deseja desativar ${table.selected.length} produtos selecionados?`}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivateMultiple}>
            Desativar Todos
          </Button>
        }
      />

      {enterpriseId && (
        <ProductImportDialog
          open={importDialog.value}
          enterpriseId={enterpriseId}
          existingProducts={tableData}
          onClose={importDialog.onFalse}
          onImported={loadProducts}
        />
      )}

      {enterpriseId && (
        <ProductBulkFiscalDialog
          open={bulkFiscalDialog.value}
          enterpriseId={enterpriseId}
          selectedProductIds={table.selected}
          onClose={bulkFiscalDialog.onFalse}
          onUpdated={async () => {
            table.onSelectAllRows(false, []);
            await loadProducts();
          }}
        />
      )}
    </>
  );
}

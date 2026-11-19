import type { Plan } from 'src/api/firestore/plans';
import type { Enterprise } from 'src/api/firestore/platform';

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

import { fDate } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { listPlans } from 'src/api/firestore/plans';
import { DashboardContent } from 'src/layouts/dashboard';
import { listEnterprisesClient } from 'src/api/firestore/platform';
import {
  getCachedBilling,
  peekBillingCache,
} from 'src/api/firestore/billing-cache';

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

import { EnterpriseTableRow } from '../enterprise-table-row';

// ----------------------------------------------------------------------

export type EnterpriseBillingRow = Enterprise & {
  planCode: string;
  planName: string;
  planPrice: number;
  subscriptionStatus: string;
  billingCycle: string;
  billingMode: string;
  paymentMethod: string;
  periodEnd: string | null;
};

const TABLE_HEAD = [
  { id: 'name', label: 'Empresa / Razão Social', hideable: false },
  { id: 'plan', label: 'Plano Atual' },
  { id: 'subscriptionStatus', label: 'Assinatura' },
  { id: 'active', label: 'Status' },
  { id: 'createdAt', label: 'Criada em' },
  { id: 'actions', label: '', width: 88, hideable: false },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  name: true,
  plan: true,
  subscriptionStatus: true,
  active: true,
  createdAt: true,
  actions: true,
};

const PLAN_OPTIONS = [
  { value: 'free', label: 'Free Starter' },
  { value: 'pro', label: 'Plano Pro' },
  { value: 'ultra', label: 'Plano Ultra' },
];

function enrichEnterprise(row: Enterprise, plansById: Map<string, Plan>): EnterpriseBillingRow {
  const sub = row.subscription;
  const plan =
    (sub?.planId ? plansById.get(sub.planId) : undefined) ||
    Array.from(plansById.values()).find((p) => p.code === (sub?.planCode || 'free'));

  return {
    ...row,
    planCode: sub?.planCode || plan?.code || 'free',
    planName:
      plan?.name || (sub?.planCode === 'free' ? 'Free Starter' : sub?.planCode || 'Free Starter'),
    planPrice: typeof plan?.priceMonthly === 'number' ? plan.priceMonthly : 0,
    subscriptionStatus: sub?.status || 'none',
    billingCycle: sub?.billingCycle || 'monthly',
    billingMode:
      sub?.billingMode ||
      (sub?.paymentMethod === 'credit_card'
        ? 'recurring'
        : sub?.paymentMethod
          ? 'one_time'
          : '—'),
    paymentMethod: sub?.paymentMethod || '—',
    periodEnd: sub?.currentPeriodEnd || null,
  };
}

// ----------------------------------------------------------------------

export function EnterpriseListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuthContext();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });
  const confirmExportSelected = useBoolean();

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<EnterpriseBillingRow[]>([]);
  const [, setPlans] = useState<Plan[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'past_due'>(
    'all'
  );
  const [planFilters, setPlanFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleColumns, setVisibleColumns] =
    useState<Record<string, boolean>>(DEFAULT_VISIBLE_COLUMNS);

  const load = useCallback(
    async (force = false) => {
      if (!user?.platformAdmin) {
        setTableData([]);
        setLoading(false);
        return;
      }

      type Bundle = { enterprises: Enterprise[]; planRows: Plan[] };
      const cacheKey = 'enterprises-list';

      if (!force) {
        const peek = peekBillingCache<Bundle>(cacheKey, 45_000);
        if (peek) {
          setPlans(peek.planRows);
          const byId = new Map(peek.planRows.map((p) => [p.id, p]));
          setTableData(peek.enterprises.map((e) => enrichEnterprise(e, byId)));
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      try {
        const data = await getCachedBilling(
          cacheKey,
          async () => {
            const [enterprises, planRows] = await Promise.all([
              listEnterprisesClient(),
              listPlans(),
            ]);
            return { enterprises, planRows };
          },
          { force, ttlMs: 45_000 }
        );
        setPlans(data.planRows);
        const byId = new Map(data.planRows.map((p) => [p.id, p]));
        setTableData(data.enterprises.map((e) => enrichEnterprise(e, byId)));
      } catch (error) {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, t('enterprises.loadError')));
        setTableData([]);
      } finally {
        setLoading(false);
      }
    },
    [t, user?.platformAdmin]
  );

  useEffect(() => {
    load(false).catch(() => undefined);
  }, [load]);

  // Analytics Metrics (4 items)
  const metrics = useMemo(() => {
    let proCount = 0;
    let ultraCount = 0;
    let freeCount = 0;
    let mrrTotal = 0;
    let activeSubs = 0;
    let pastDueCount = 0;

    tableData.forEach((row) => {
      if (row.planCode === 'pro') proCount += 1;
      else if (row.planCode === 'ultra') ultraCount += 1;
      else freeCount += 1;

      if (row.subscriptionStatus === 'active') {
        activeSubs += 1;
        mrrTotal += row.planPrice || 0;
      } else if (row.subscriptionStatus === 'past_due') {
        pastDueCount += 1;
      }
    });

    return {
      total: tableData.length,
      proCount,
      ultraCount,
      freeCount,
      mrrTotal,
      activeSubs,
      pastDueCount,
    };
  }, [tableData]);

  const activeEnterprises = useMemo(() => tableData.filter((r) => r.active), [tableData]);
  const inactiveEnterprises = useMemo(() => tableData.filter((r) => !r.active), [tableData]);
  const pastDueEnterprises = useMemo(
    () => tableData.filter((r) => r.subscriptionStatus === 'past_due'),
    [tableData]
  );

  const TABS = [
    { value: 'all', label: 'Todas', color: 'default', count: tableData.length },
    { value: 'active', label: 'Ativas', color: 'success', count: activeEnterprises.length },
    { value: 'past_due', label: 'Em atraso', color: 'error', count: pastDueEnterprises.length },
    { value: 'inactive', label: 'Inativas', color: 'default', count: inactiveEnterprises.length },
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
    } else if (statusFilter === 'past_due') {
      rows = rows.filter((r) => r.subscriptionStatus === 'past_due');
    }

    if (planFilters.length > 0) {
      rows = rows.filter((r) => planFilters.includes(r.planCode));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.tradeName?.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.document?.includes(q) ||
          r.adminEmail?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [planFilters, searchQuery, statusFilter, table.order, table.orderBy, tableData]);

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

  const exportRowsToCsv = useCallback((rowsToExport: EnterpriseBillingRow[]) => {
    const headers = ['ID', 'Razão Social', 'Nome Fantasia', 'CNPJ', 'Plano', 'Assinatura', 'Status', 'Criada em'];
    const csvRows = [
      headers.join(';'),
      ...rowsToExport.map((r) =>
        [
          `"${r.id}"`,
          `"${r.name || ''}"`,
          `"${r.tradeName || ''}"`,
          `"${r.document || ''}"`,
          `"${r.planName || ''}"`,
          `"${r.subscriptionStatus || ''}"`,
          r.active ? 'Ativa' : 'Inativa',
          `"${r.createdAt ? fDate(r.createdAt) : ''}"`,
        ].join(';')
      ),
    ];
    const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `empresas-saas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const notFound =
    !dataFiltered.length &&
    (!!searchQuery || statusFilter !== 'all' || planFilters.length > 0);

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('enterprises.listHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('enterprises.title'), href: paths.dashboard.enterprises.list },
            { name: t('enterprises.listHeading') },
          ]}
          action={
            <Button
              component={RouterLink}
              href={paths.dashboard.enterprises.create}
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
            >
              {t('enterprises.newEnterprise')}
            </Button>
          }
          sx={{ mb: { xs: 3, md: 4 } }}
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
                title="Total de Empresas"
                primaryValue={`${metrics.total} cadastradas`}
                secondaryValue={`${metrics.activeSubs} assinaturas ativas`}
                percent={100}
                icon="solar:buildings-bold-duotone"
                color={theme.vars.palette.primary.main}
              />

              <ErpTableAnalytic
                title="Planos Pagos (Pro / Ultra)"
                primaryValue={`${metrics.proCount + metrics.ultraCount} empresas`}
                secondaryValue={`${metrics.proCount} Pro • ${metrics.ultraCount} Ultra`}
                percent={
                  metrics.total
                    ? Math.round(((metrics.proCount + metrics.ultraCount) / metrics.total) * 100)
                    : 0
                }
                icon="solar:crown-bold-duotone"
                color={theme.vars.palette.info.main}
              />

              <ErpTableAnalytic
                title="Free Starter"
                primaryValue={`${metrics.freeCount} empresas`}
                secondaryValue="Entrada gratuita"
                percent={metrics.total ? Math.round((metrics.freeCount / metrics.total) * 100) : 0}
                icon="solar:users-group-rounded-bold-duotone"
                color={theme.vars.palette.success.main}
              />

              <ErpTableAnalytic
                title="MRR SaaS Previsto"
                primaryValue={fCurrency(metrics.mrrTotal)}
                secondaryValue={`${metrics.pastDueCount} em atraso`}
                percent={
                  metrics.total
                    ? Math.min(100, Math.round((metrics.activeSubs / metrics.total) * 100))
                    : 0
                }
                icon="solar:wallet-money-bold-duotone"
                color={theme.vars.palette.warning.main}
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
            searchPlaceholder="Pesquisar por empresa, ID, CNPJ ou e-mail do admin..."
            onResetPage={table.onResetPage}
            selectFilters={[
              {
                id: 'plan',
                label: 'Plano',
                options: PLAN_OPTIONS,
                value: planFilters,
                onChange: setPlanFilters,
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
                <Tooltip title="Exportar selecionadas">
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
                          <EnterpriseTableRow
                            key={row.id}
                            row={row}
                            selected={table.selected.includes(row.id)}
                            onSelectRow={() => table.onSelectRow(row.id)}
                            onViewRow={() => router.push(paths.dashboard.enterprises.details(row.id))}
                            onEditRow={() => router.push(paths.dashboard.enterprises.edit(row.id))}
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
      </DashboardContent>

      <ConfirmDialog
        open={confirmExportSelected.value}
        onClose={confirmExportSelected.onFalse}
        title="Exportar Empresas Selecionadas"
        content={`Deseja exportar as ${table.selected.length} empresas selecionadas para CSV?`}
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

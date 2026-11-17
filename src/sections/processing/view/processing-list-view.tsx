import type { ProcessingOrder } from 'src/api/firestore/processing-orders';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TableBody from '@mui/material/TableBody';
import { useTheme } from '@mui/material/styles';
import TableContainer from '@mui/material/TableContainer';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { varAlpha } from 'src/theme/styles';
import { fNumber, fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  listProcessingOrders,
  cancelProcessingOrder,
} from 'src/api/firestore/processing-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import {
  useTable,
  emptyRows,
  TableNoData,
  getComparator,
  TableEmptyRows,
  TableHeadCustom,
  TablePaginationCustom,
} from 'src/components/table';

import { useAuthContext } from 'src/auth/hooks';

import { ProcessingAnalytic } from '../processing-analytic';
import { ProcessingTableRow } from '../processing-table-row';
import { ProcessingTableToolbar } from '../processing-table-toolbar';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'code', label: 'Ordem / Matéria-prima' },
  { id: 'createdAt', label: 'Data / Hora' },
  { id: 'rawQtyUsed', label: 'Insumo Consumido' },
  { id: 'outputs', label: 'Produtos Gerados' },
  { id: 'totalCost', label: 'Custo Rateado' },
  { id: 'status', label: 'Status' },
  { id: '', width: 88 },
];

// ----------------------------------------------------------------------

export function ProcessingListView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuthContext();
  const table = useTable({ defaultOrderBy: 'createdAt', defaultOrder: 'desc' });

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<ProcessingOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadOrders = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listProcessingOrders(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('processing.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleCancelRow = useCallback(
    async (order: ProcessingOrder) => {
      if (!enterpriseId) return;
      try {
        await cancelProcessingOrder(enterpriseId, order);
        toast.success(t('processing.cancelSuccess'));
        await loadOrders();
      } catch (error) {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, t('processing.cancelError')));
      }
    },
    [enterpriseId, loadOrders, t]
  );

  // Status Tabs Counts
  const completedOrders = useMemo(
    () => tableData.filter((row) => row.status === 'completed'),
    [tableData]
  );
  const cancelledOrders = useMemo(
    () => tableData.filter((row) => row.status === 'cancelled'),
    [tableData]
  );

  const completedCost = useMemo(
    () => completedOrders.reduce((sum, r) => sum + (r.totalCost || 0), 0),
    [completedOrders]
  );
  const cancelledCost = useMemo(
    () => cancelledOrders.reduce((sum, r) => sum + (r.totalCost || 0), 0),
    [cancelledOrders]
  );
  const totalCost = useMemo(
    () => tableData.reduce((sum, r) => sum + (r.totalCost || 0), 0),
    [tableData]
  );

  const totalRawInput = useMemo(
    () => tableData.reduce((sum, r) => sum + (r.rawQtyUsed || 0), 0),
    [tableData]
  );
  const totalOutputs = useMemo(
    () =>
      tableData.reduce(
        (sum, r) => sum + (r.outputs || []).reduce((acc, out) => acc + (out.qty || 0), 0),
        0
      ),
    [tableData]
  );
  const averageYield = totalRawInput > 0 ? (totalOutputs / totalRawInput) * 100 : 0;

  const TABS = [
    { value: 'all', label: 'Todas', color: 'default', count: tableData.length },
    { value: 'completed', label: 'Concluídas', color: 'success', count: completedOrders.length },
    { value: 'cancelled', label: 'Canceladas', color: 'error', count: cancelledOrders.length },
  ] as const;

  // Filtragem
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

    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.code?.toLowerCase().includes(q) ||
          r.rawProductName?.toLowerCase().includes(q) ||
          r.rawLotCode?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [searchQuery, statusFilter, table.order, table.orderBy, tableData]);

  const notFound = !dataFiltered.length && (!!searchQuery || statusFilter !== 'all');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('processing.listHeading', { defaultValue: 'Beneficiamento de Produtos' })}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.processing'), href: paths.dashboard.processing.root },
          { name: t('processing.listHeading', { defaultValue: 'Ordens' }) },
        ]}
        action={
          <Stack direction="row" spacing={1.5}>
            <Button
              component={RouterLink}
              href={paths.dashboard.batches.list}
              variant="outlined"
              startIcon={<Iconify icon="solar:box-minimalistic-bold" />}
            >
              Ver Lotes Gerados
            </Button>
            <Button
              component={RouterLink}
              href={paths.dashboard.processing.create}
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
            >
              {t('processing.newOrder', { defaultValue: 'Nova Ordem' })}
            </Button>
          </Stack>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      {!enterpriseId && (
        <EmptyContent
          filled
          title={t('processing.errorMissingEnterprise', { defaultValue: 'Empresa não selecionada' })}
          sx={{ py: 10 }}
        />
      )}

      {enterpriseId && (
        <>
          {/* Analytics Strip Beneficiamento */}
          <Card sx={{ mb: { xs: 3, md: 5 } }}>
            <Scrollbar sx={{ minHeight: 108 }}>
              <Stack
                direction="row"
                divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
                sx={{ py: 2 }}
              >
                <ProcessingAnalytic
                  title="Ordens de Produção"
                  primaryValue={`${tableData.length} ordens`}
                  secondaryValue={`Custo Total: ${fCurrency(totalCost)}`}
                  percent={100}
                  icon="solar:settings-bold-duotone"
                  color={theme.vars.palette.primary.main}
                />

                <ProcessingAnalytic
                  title="Matéria-prima Consumida"
                  primaryValue={`${fNumber(totalRawInput)} kg`}
                  secondaryValue="Insumos Processados"
                  percent={tableData.length ? Math.round((completedOrders.length / tableData.length) * 100) : 0}
                  icon="solar:layers-bold-duotone"
                  color={theme.vars.palette.info.main}
                />

                <ProcessingAnalytic
                  title="Produtos Acabados"
                  primaryValue={`${fNumber(totalOutputs)} un`}
                  secondaryValue={`${completedOrders.length} ordens concluídas`}
                  percent={100}
                  icon="solar:box-minimalistic-bold-duotone"
                  color={theme.vars.palette.success.main}
                />

                <ProcessingAnalytic
                  title="Rendimento Médio"
                  primaryValue={`${averageYield.toFixed(1)}%`}
                  secondaryValue="Aproveitamento Industrial"
                  percent={Math.min(100, Math.round(averageYield))}
                  icon="solar:chart-2-bold-duotone"
                  color={theme.vars.palette.warning.main}
                />
              </Stack>
            </Scrollbar>
          </Card>

          {/* Tabela estilo Invoice */}
          <Card>
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

            <ProcessingTableToolbar
              searchQuery={searchQuery}
              onSearchChange={(e) => setSearchQuery(e.target.value)}
              onResetPage={table.onResetPage}
            />

            <TableContainer sx={{ position: 'relative', overflow: 'unset' }}>
              <Scrollbar>
                <Table size={table.dense ? 'small' : 'medium'} sx={{ minWidth: 800 }}>
                  <TableHeadCustom
                    order={table.order}
                    orderBy={table.orderBy}
                    headLabel={TABLE_HEAD}
                    rowCount={dataFiltered.length}
                    onSort={table.onSort}
                  />

                  <TableBody>
                    {dataFiltered
                      .slice(
                        table.page * table.rowsPerPage,
                        table.page * table.rowsPerPage + table.rowsPerPage
                      )
                      .map((row) => (
                        <ProcessingTableRow
                          key={row.id}
                          row={row}
                          onViewRow={() => router.push(paths.dashboard.processing.details(row.id))}
                          onViewBatches={() => router.push(paths.dashboard.batches.list)}
                          onCancelRow={() => handleCancelRow(row)}
                        />
                      ))}

                    <TableEmptyRows
                      height={table.dense ? 56 : 76}
                      emptyRows={emptyRows(table.page, table.rowsPerPage, dataFiltered.length)}
                    />

                    <TableNoData notFound={notFound} />
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
        </>
      )}
    </DashboardContent>
  );
}

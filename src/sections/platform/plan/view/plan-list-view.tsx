import type { Plan } from 'src/api/firestore/plans';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TableBody from '@mui/material/TableBody';
import TableContainer from '@mui/material/TableContainer';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listPlans } from 'src/api/firestore/plans';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  getCachedBilling,
  peekBillingCache,
} from 'src/api/firestore/billing-cache';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import {
  useTable,
  emptyRows,
  TableNoData,
  TableSkeleton,
  TableEmptyRows,
  TableHeadCustom,
  TablePaginationCustom,
} from 'src/components/table';

import { PlanTableRow } from '../plan-table-row';
import { PlanTableToolbar } from '../plan-table-toolbar';

// ----------------------------------------------------------------------

const TABLE_HEAD = [
  { id: 'name', label: 'Nome do Plano', minWidth: 200 },
  { id: 'code', label: 'Código', width: 140 },
  { id: 'priceMonthly', label: 'Preço Mensal', width: 160 },
  { id: 'active', label: 'Status', width: 130 },
  { id: 'sortOrder', label: 'Ordem', width: 100 },
  { id: 'actions', label: '', width: 80, align: 'right' },
];

export function PlanListView() {
  const { t } = useTranslate('common');
  const table = useTable({ defaultOrderBy: 'sortOrder', defaultOrder: 'asc' });

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Plan[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(
    async (force = false) => {
      const cacheKey = 'plans-list';
      if (!force) {
        const peek = peekBillingCache<Plan[]>(cacheKey, 60_000);
        if (peek) {
          setTableData(peek);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      try {
        const rows = await getCachedBilling(cacheKey, () => listPlans(), {
          force,
          ttlMs: 60_000,
        });
        setTableData(rows);
      } catch (error) {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, t('billing.loadError')));
        setTableData([]);
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    load(false).catch(() => undefined);
  }, [load]);

  const dataFiltered = useMemo(() => {
    let rows = tableData;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (plan) =>
          plan.name?.toLowerCase().includes(q) ||
          plan.code?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [tableData, searchQuery]);

  const notFound = !dataFiltered.length && !loading;

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('billing.plansListHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('billing.plansTitle') },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.plans.create}
            variant="contained"
            startIcon={<Iconify icon="mingcute:add-line" />}
          >
            {t('nav.plansCreate')}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <Card>
        <PlanTableToolbar
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
                onSort={table.onSort}
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
                        <PlanTableRow key={row.id} row={row} />
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
  );
}

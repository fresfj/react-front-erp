import type { Supplier } from 'src/api/firestore/suppliers';

import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listSuppliers, deactivateSupplier } from 'src/api/firestore/suppliers';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import {
  useTable,
  TableNoData,
  TableHeadCustom,
  TablePaginationCustom,
} from 'src/components/table';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export function SupplierListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const table = useTable({ defaultOrderBy: 'name' });
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const canWrite = user?.role !== 'operador';

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Supplier[]>([]);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const TABLE_HEAD = [
    { id: 'name', label: t('suppliers.fields.name') },
    { id: 'document', label: t('suppliers.fields.document'), width: 180 },
    { id: 'phone', label: t('suppliers.fields.phone'), width: 160 },
    { id: 'email', label: t('suppliers.fields.email'), width: 220 },
    { id: 'active', label: t('suppliers.fields.active'), width: 120 },
    { id: '', width: 88 },
  ];

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
      toast.error(t('suppliers.loadError'));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const dataInPage = tableData.slice(
    table.page * table.rowsPerPage,
    table.page * table.rowsPerPage + table.rowsPerPage
  );

  const notFound = !loading && !tableData.length;

  const handleEditRow = useCallback(
    (id: string) => {
      router.push(paths.dashboard.suppliers.edit(id));
    },
    [router]
  );

  const handleAskDeactivate = useCallback(
    (id: string) => {
      setDeactivateId(id);
      confirm.onTrue();
    },
    [confirm]
  );

  const handleConfirmDeactivate = useCallback(async () => {
    if (!enterpriseId || !deactivateId || !canWrite) {
      return;
    }

    try {
      await deactivateSupplier(enterpriseId, deactivateId);
      toast.success(t('suppliers.deactivateSuccess'));
      confirm.onFalse();
      setDeactivateId(null);
      await loadSuppliers();
    } catch (error) {
      console.error(error);
      toast.error(t('suppliers.deactivateError'));
    }
  }, [canWrite, confirm, deactivateId, enterpriseId, loadSuppliers, t]);

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('suppliers.listHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('suppliers.title'), href: paths.dashboard.suppliers.root },
            { name: t('suppliers.listHeading') },
          ]}
          action={
            canWrite ? (
              <Button
                component={RouterLink}
                href={paths.dashboard.suppliers.create}
                variant="contained"
                startIcon={<Iconify icon="mingcute:add-line" />}
              >
                {t('suppliers.newSupplier')}
              </Button>
            ) : undefined
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        <Card>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Scrollbar>
                <Table size={table.dense ? 'small' : 'medium'} sx={{ minWidth: 800 }}>
                  <TableHeadCustom
                    order={table.order}
                    orderBy={table.orderBy}
                    headLabel={TABLE_HEAD}
                    rowCount={tableData.length}
                    onSort={table.onSort}
                  />

                  <TableBody>
                    {dataInPage.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.document}</TableCell>
                        <TableCell>{row.phone || '—'}</TableCell>
                        <TableCell>{row.email || '—'}</TableCell>
                        <TableCell>
                          <Label color={row.active ? 'success' : 'default'} variant="soft">
                            {row.active ? t('company.active') : t('company.inactive')}
                          </Label>
                        </TableCell>
                        <TableCell align="right">
                          {canWrite && (
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <Tooltip title={t('suppliers.editHeading')}>
                                <IconButton onClick={() => handleEditRow(row.id)}>
                                  <Iconify icon="solar:pen-bold" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={t('suppliers.deactivate')}>
                                <IconButton color="error" onClick={() => handleAskDeactivate(row.id)}>
                                  <Iconify icon="solar:trash-bin-trash-bold" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}

                    <TableNoData notFound={notFound} />
                  </TableBody>
                </Table>
              </Scrollbar>

              <TablePaginationCustom
                count={tableData.length}
                page={table.page}
                rowsPerPage={table.rowsPerPage}
                onPageChange={table.onChangePage}
                onRowsPerPageChange={table.onChangeRowsPerPage}
                dense={table.dense}
                onChangeDense={table.onChangeDense}
              />
            </>
          )}
        </Card>
      </DashboardContent>

      <ConfirmDialog
        open={confirm.value}
        onClose={confirm.onFalse}
        title={t('suppliers.deactivate')}
        content={t('suppliers.deactivateConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivate}>
            {t('suppliers.deactivate')}
          </Button>
        }
      />
    </>
  );
}

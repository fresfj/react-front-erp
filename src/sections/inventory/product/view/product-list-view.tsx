import type { Product } from 'src/api/firestore/products';

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
import { listProducts, deactivateProduct } from 'src/api/firestore/products';

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

export function ProductListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const table = useTable({ defaultOrderBy: 'name' });
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Product[]>([]);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const TABLE_HEAD = [
    { id: 'name', label: t('products.fields.name') },
    { id: 'sku', label: t('products.fields.sku'), width: 140 },
    { id: 'type', label: t('products.fields.type'), width: 140 },
    { id: 'unit', label: t('products.fields.unit'), width: 100 },
    { id: 'active', label: t('products.fields.active'), width: 120 },
    { id: '', width: 88 },
  ];

  const loadProducts = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listProducts(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(t('products.loadError'));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const dataInPage = tableData.slice(
    table.page * table.rowsPerPage,
    table.page * table.rowsPerPage + table.rowsPerPage
  );

  const notFound = !loading && !tableData.length;

  const handleEditRow = useCallback(
    (id: string) => {
      router.push(paths.dashboard.products.edit(id));
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
    if (!enterpriseId || !deactivateId) {
      return;
    }

    try {
      await deactivateProduct(enterpriseId, deactivateId);
      toast.success(t('products.deactivateSuccess'));
      confirm.onFalse();
      setDeactivateId(null);
      await loadProducts();
    } catch (error) {
      console.error(error);
      toast.error(t('products.deactivateError'));
    }
  }, [confirm, deactivateId, enterpriseId, loadProducts, t]);

  const typeLabel = (type: Product['type']) =>
    type === 'finished' ? t('products.types.finished') : t('products.types.raw');

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('products.listHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('products.title'), href: paths.dashboard.products.root },
            { name: t('products.listHeading') },
          ]}
          action={
            <Button
              component={RouterLink}
              href={paths.dashboard.products.create}
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
            >
              {t('products.newProduct')}
            </Button>
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
                        <TableCell>{row.sku}</TableCell>
                        <TableCell>{typeLabel(row.type)}</TableCell>
                        <TableCell>{row.unit || '—'}</TableCell>
                        <TableCell>
                          <Label color={row.active ? 'success' : 'default'} variant="soft">
                            {row.active ? t('company.active') : t('company.inactive')}
                          </Label>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Tooltip title={t('products.editHeading')}>
                              <IconButton onClick={() => handleEditRow(row.id)}>
                                <Iconify icon="solar:pen-bold" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('products.deactivate')}>
                              <IconButton color="error" onClick={() => handleAskDeactivate(row.id)}>
                                <Iconify icon="solar:trash-bin-trash-bold" />
                              </IconButton>
                            </Tooltip>
                          </Box>
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
        title={t('products.deactivate')}
        content={t('products.deactivateConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivate}>
            {t('products.deactivate')}
          </Button>
        }
      />
    </>
  );
}

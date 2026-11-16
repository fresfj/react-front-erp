import type { Sale, SaleStatus } from 'src/api/firestore/sales';
import type { GridColDef, GridSlots } from '@mui/x-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import {
  DataGrid,
  gridClasses,
  GridToolbarExport,
  GridToolbarContainer,
  GridToolbarQuickFilter,
  GridToolbarFilterButton,
  GridToolbarColumnsButton,
} from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';
import { useSetState } from 'src/hooks/use-set-state';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listSales, cancelSale } from 'src/api/firestore/sales';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type SaleFilters = {
  status: '' | SaleStatus;
};

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<SaleFilters>>;
  statusLabel: string;
  allStatus: string;
  completedLabel: string;
  cancelledLabel: string;
};

function SaleToolbar({
  filters,
  statusLabel,
  allStatus,
  completedLabel,
  cancelledLabel,
}: ToolbarProps) {
  return (
    <GridToolbarContainer>
      <Stack
        spacing={1.5}
        direction={{ xs: 'column', md: 'row' }}
        sx={{ p: 2.5, width: 1, pr: { xs: 2.5, md: 1 } }}
      >
        <TextField
          select
          label={statusLabel}
          value={filters.state.status}
          onChange={(e) =>
            filters.setState({ status: e.target.value as SaleFilters['status'] })
          }
          sx={{ minWidth: { md: 180 } }}
        >
          <MenuItem value="">{allStatus}</MenuItem>
          <MenuItem value="completed">{completedLabel}</MenuItem>
          <MenuItem value="cancelled">{cancelledLabel}</MenuItem>
        </TextField>

        <Stack
          direction="row"
          spacing={1}
          flexGrow={1}
          justifyContent="flex-end"
          alignItems="center"
        >
          <GridToolbarQuickFilter />
          <GridToolbarColumnsButton />
          <GridToolbarFilterButton />
          <GridToolbarExport />
        </Stack>
      </Stack>
    </GridToolbarContainer>
  );
}

// ----------------------------------------------------------------------

export function SaleListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const canCancel = user?.role === 'admin' || user?.role === 'gestor';

  const filters = useSetState<SaleFilters>({ status: '' });
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Sale[]>([]);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);

  const loadSales = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listSales(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('pos.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const dataFiltered = useMemo(() => {
    if (!filters.state.status) return tableData;
    return tableData.filter((r) => r.status === filters.state.status);
  }, [filters.state.status, tableData]);

  const handleConfirmCancel = useCallback(async () => {
    if (!enterpriseId || !cancelTarget || !canCancel) return;
    try {
      await cancelSale(enterpriseId, cancelTarget);
      toast.success(t('pos.cancelSuccess'));
      setCancelTarget(null);
      confirm.onFalse();
      await loadSales();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('pos.cancelError')));
    }
  }, [canCancel, cancelTarget, confirm, enterpriseId, loadSales, t]);

  const CustomToolbar = useCallback(
    () => (
      <SaleToolbar
        filters={filters}
        statusLabel={t('pos.fields.status')}
        allStatus={t('pos.filters.allStatus')}
        completedLabel={t('pos.status.completed')}
        cancelledLabel={t('pos.status.cancelled')}
      />
    ),
    [filters, t]
  );

  const columns = useMemo<GridColDef<Sale>[]>(
    () => [
      {
        field: 'code',
        headerName: t('pos.fields.code'),
        width: 170,
        hideable: false,
      },
      {
        field: 'customerName',
        headerName: t('pos.fields.customerName'),
        flex: 1,
        minWidth: 160,
        valueGetter: (_v, row) => row.customerName || 'Consumidor Final',
      },
      {
        field: 'total',
        headerName: t('pos.fields.total'),
        width: 130,
        renderCell: (params) => fCurrency(params.row.total),
      },
      {
        field: 'totalCost',
        headerName: t('pos.fields.totalCost'),
        width: 130,
        renderCell: (params) => fCurrency(params.row.totalCost),
      },
      {
        field: 'grossProfit',
        headerName: t('pos.fields.grossProfit'),
        width: 130,
        renderCell: (params) => fCurrency(params.row.grossProfit),
      },
      {
        field: 'payments',
        headerName: t('pos.fields.paymentMethod'),
        width: 180,
        valueGetter: (_v, row) =>
          row.payments.map((p) => t(`pos.paymentMethods.${p.method}`)).join(', '),
      },
      {
        field: 'status',
        headerName: t('pos.fields.status'),
        width: 120,
        renderCell: (params) => (
          <Label
            color={params.row.status === 'completed' ? 'success' : 'error'}
            variant="soft"
          >
            {params.row.status === 'completed'
              ? t('pos.status.completed')
              : t('pos.status.cancelled')}
          </Label>
        ),
      },
      {
        field: 'createdAt',
        headerName: t('pos.fields.createdAt'),
        width: 170,
        renderCell: (params) =>
          params.row.createdAt ? fDateTime(params.row.createdAt) || '—' : '—',
      },
      {
        field: 'actions',
        headerName: ' ',
        width: 100,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => (
          <Stack direction="row" spacing={0.5}>
            <IconButton
              size="small"
              onClick={() => router.push(paths.dashboard.pos.saleDetails(params.row.id))}
            >
              <Iconify icon="solar:eye-bold" />
            </IconButton>
            {canCancel && params.row.status === 'completed' && (
              <IconButton
                size="small"
                color="error"
                onClick={() => {
                  setCancelTarget(params.row);
                  confirm.onTrue();
                }}
              >
                <Iconify icon="solar:trash-bin-trash-bold" />
              </IconButton>
            )}
          </Stack>
        ),
      },
    ],
    [canCancel, confirm, router, t]
  );

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('pos.salesHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.pos'), href: paths.dashboard.pos.root },
            { name: t('pos.salesHeading') },
          ]}
          action={
            <Button
              component={RouterLink}
              href={paths.dashboard.pos.checkout}
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
            >
              {t('pos.newSale')}
            </Button>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent filled title={t('pos.errorMissingEnterprise')} sx={{ py: 10 }} />
        )}

        {enterpriseId && (
          <Card sx={{ height: 720 }}>
            <DataGrid
              rows={dataFiltered}
              columns={columns}
              loading={loading}
              getRowId={(row) => row.id}
              pageSizeOptions={[5, 10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              slots={{
                toolbar: CustomToolbar as GridSlots['toolbar'],
                noRowsOverlay: () => <EmptyContent title={t('pos.emptySales')} />,
                noResultsOverlay: () => <EmptyContent title={t('pos.emptySales')} />,
              }}
              sx={{
                border: 0,
                [`& .${gridClasses.cell}`]: { alignItems: 'center', display: 'inline-flex' },
              }}
            />
          </Card>
        )}
      </DashboardContent>

      <ConfirmDialog
        open={confirm.value}
        onClose={() => {
          setCancelTarget(null);
          confirm.onFalse();
        }}
        title={t('pos.cancelSale')}
        content={t('pos.cancelConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmCancel}>
            {t('pos.cancelSale')}
          </Button>
        }
      />
    </>
  );
}

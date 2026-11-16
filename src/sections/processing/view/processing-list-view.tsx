import type { GridColDef, GridSlots } from '@mui/x-data-grid';
import type {
  ProcessingOrder,
  ProcessingOrderStatus,
} from 'src/api/firestore/processing-orders';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
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
import { fCurrency, fNumber, fPercent } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { seedDemoErpCatalog } from 'src/api/firestore/seed-demo';
import {
  listProcessingOrders,
  cancelProcessingOrder,
} from 'src/api/firestore/processing-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type OrderFilters = {
  status: '' | ProcessingOrderStatus;
};

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<OrderFilters>>;
  statusLabel: string;
  allStatus: string;
  completedLabel: string;
  cancelledLabel: string;
};

function ProcessingToolbar({
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
          onChange={(event) =>
            filters.setState({ status: event.target.value as OrderFilters['status'] })
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

export function ProcessingListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const filters = useSetState<OrderFilters>({ status: '' });
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<ProcessingOrder[]>([]);
  const [cancelTarget, setCancelTarget] = useState<ProcessingOrder | null>(null);

  const loadOrders = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let rows = await listProcessingOrders(enterpriseId);
      if (rows.length === 0) {
        await seedDemoErpCatalog(enterpriseId);
        rows = await listProcessingOrders(enterpriseId);
      }
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

  const dataFiltered = useMemo(() => {
    if (!filters.state.status) return tableData;
    return tableData.filter((row) => row.status === filters.state.status);
  }, [filters.state.status, tableData]);

  // Management KPI metrics for Processing Orders (InvoiceAnalytic style)
  const kpiStats = useMemo(() => {
    const completed = tableData.filter((o) => o.status === 'completed');
    const totalRawQty = completed.reduce((acc, o) => acc + o.rawQtyUsed, 0);
    const totalOutputQty = completed.reduce((acc, o) => acc + o.totalOutputQty, 0);
    const totalInvestedCost = completed.reduce((acc, o) => acc + o.totalCost, 0);
    const yieldEfficiency = totalRawQty > 0 ? (totalOutputQty / totalRawQty) * 100 : 0;
    const avgUnitCmv = totalOutputQty > 0 ? totalInvestedCost / totalOutputQty : 0;

    return {
      totalOrders: tableData.length,
      completedCount: completed.length,
      totalRawQty,
      totalOutputQty,
      totalInvestedCost,
      yieldEfficiency,
      avgUnitCmv,
    };
  }, [tableData]);

  const handleConfirmCancel = useCallback(async () => {
    if (!enterpriseId || !cancelTarget) return;
    try {
      await cancelProcessingOrder(enterpriseId, cancelTarget);
      toast.success(t('processing.cancelSuccess'));
      setCancelTarget(null);
      confirm.onFalse();
      await loadOrders();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('processing.cancelError')));
    }
  }, [cancelTarget, confirm, enterpriseId, loadOrders, t]);

  const CustomToolbar = useCallback(
    () => (
      <ProcessingToolbar
        filters={filters}
        statusLabel={t('processing.fields.status')}
        allStatus={t('processing.filters.allStatus')}
        completedLabel={t('processing.status.completed')}
        cancelledLabel={t('processing.status.cancelled')}
      />
    ),
    [filters, t]
  );

  const columns = useMemo<GridColDef<ProcessingOrder>[]>(
    () => [
      {
        field: 'code',
        headerName: t('processing.fields.code'),
        width: 170,
        hideable: false,
      },
      {
        field: 'rawProductName',
        headerName: t('processing.fields.rawProduct'),
        flex: 1,
        minWidth: 180,
      },
      {
        field: 'supplierName',
        headerName: 'Fornecedor Origem',
        width: 180,
        valueGetter: (_v, row) => row.supplierName || '—',
      },
      {
        field: 'rawQtyUsed',
        headerName: t('processing.fields.rawQtyUsed'),
        width: 140,
        renderCell: (params) => `${fNumber(params.row.rawQtyUsed)} ${params.row.rawUnit}`,
      },
      {
        field: 'totalOutputQty',
        headerName: t('processing.fields.totalOutputQty'),
        width: 150,
        renderCell: (params) =>
          `${fNumber(params.row.totalOutputQty)} (${params.row.outputs.length} lotes)`,
      },
      {
        field: 'totalCost',
        headerName: t('processing.fields.totalCost'),
        width: 140,
        renderCell: (params) => fCurrency(params.row.totalCost),
      },
      {
        field: 'status',
        headerName: t('processing.fields.status'),
        width: 120,
        renderCell: (params) => (
          <Label
            color={params.row.status === 'completed' ? 'success' : 'error'}
            variant="soft"
          >
            {params.row.status === 'completed'
              ? t('processing.status.completed')
              : t('processing.status.cancelled')}
          </Label>
        ),
      },
      {
        field: 'createdAt',
        headerName: t('processing.fields.createdAt'),
        width: 165,
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
              onClick={() => router.push(paths.dashboard.processing.details(params.row.id))}
            >
              <Iconify icon="solar:eye-bold" />
            </IconButton>
            {params.row.status === 'completed' && (
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
    [confirm, router, t]
  );

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('processing.listHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.processing'), href: paths.dashboard.processing.root },
            { name: t('processing.listHeading') },
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
                {t('processing.newOrder')}
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('processing.errorMissingEnterprise')}
            sx={{ py: 10 }}
          />
        )}

        {enterpriseId && (
          <>
            {/* Management Summary Strip (InvoiceAnalytic pattern) */}
            <Card sx={{ mb: { xs: 3, md: 5 } }}>
              <Scrollbar sx={{ minHeight: 108 }}>
                <Stack
                  direction="row"
                  divider={
                    <Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />
                  }
                  sx={{ py: 2 }}
                >
                  <Stack
                    spacing={2}
                    direction="row"
                    alignItems="center"
                    justifyContent="center"
                    sx={{ width: 1, minWidth: 200 }}
                  >
                    <Iconify icon="solar:clipboard-list-bold-duotone" width={40} sx={{ color: 'info.main' }} />
                    <Box>
                      <Typography variant="subtitle1">Ordens Concluídas</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {kpiStats.completedCount} de {kpiStats.totalOrders} ordens
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack
                    spacing={2}
                    direction="row"
                    alignItems="center"
                    justifyContent="center"
                    sx={{ width: 1, minWidth: 200 }}
                  >
                    <Iconify icon="solar:scale-bold-duotone" width={40} sx={{ color: 'warning.main' }} />
                    <Box>
                      <Typography variant="subtitle1">Insumo Processado</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {fNumber(kpiStats.totalRawQty)} kg consumidos
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack
                    spacing={2}
                    direction="row"
                    alignItems="center"
                    justifyContent="center"
                    sx={{ width: 1, minWidth: 200 }}
                  >
                    <Iconify icon="solar:bottle-bold-duotone" width={40} sx={{ color: 'success.main' }} />
                    <Box>
                      <Typography variant="subtitle1">Rendimento Gerado</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {fNumber(kpiStats.totalOutputQty)} L ({fPercent(kpiStats.yieldEfficiency)})
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack
                    spacing={2}
                    direction="row"
                    alignItems="center"
                    justifyContent="center"
                    sx={{ width: 1, minWidth: 200 }}
                  >
                    <Iconify icon="solar:wad-of-money-bold-duotone" width={40} sx={{ color: 'primary.main' }} />
                    <Box>
                      <Typography variant="subtitle1">Custo & CMV Médio</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {fCurrency(kpiStats.totalInvestedCost)} (Méd: {fCurrency(kpiStats.avgUnitCmv)}/L)
                      </Typography>
                    </Box>
                  </Stack>
                </Stack>
              </Scrollbar>
            </Card>

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
                  noRowsOverlay: () => <EmptyContent title={t('processing.empty')} />,
                  noResultsOverlay: () => <EmptyContent title={t('processing.empty')} />,
                }}
                sx={{
                  border: 0,
                  [`& .${gridClasses.cell}`]: { alignItems: 'center', display: 'inline-flex' },
                }}
              />
            </Card>
          </>
        )}
      </DashboardContent>

      <ConfirmDialog
        open={confirm.value}
        onClose={() => {
          setCancelTarget(null);
          confirm.onFalse();
        }}
        title={t('processing.cancel')}
        content={t('processing.cancelConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmCancel}>
            {t('processing.cancel')}
          </Button>
        }
      />
    </>
  );
}

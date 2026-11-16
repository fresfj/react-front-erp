import type { Batch } from 'src/api/firestore/batches';
import type { ProductType } from 'src/api/firestore/products';
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
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';
import { useSetState } from 'src/hooks/use-set-state';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency, fNumber } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listBatches, deactivateBatch } from 'src/api/firestore/batches';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type BatchFilters = {
  productType: '' | ProductType;
  active: '' | 'active' | 'inactive' | 'available';
};

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<BatchFilters>>;
  typeLabel: string;
  activeLabel: string;
  allTypes: string;
  rawLabel: string;
  finishedLabel: string;
  allStatus: string;
  activeOnly: string;
  inactiveOnly: string;
  availableOnly: string;
};

function BatchToolbar({
  filters,
  typeLabel,
  activeLabel,
  allTypes,
  rawLabel,
  finishedLabel,
  allStatus,
  activeOnly,
  inactiveOnly,
  availableOnly,
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
          label={typeLabel}
          value={filters.state.productType}
          onChange={(e) =>
            filters.setState({ productType: e.target.value as BatchFilters['productType'] })
          }
          sx={{ minWidth: { md: 180 } }}
        >
          <MenuItem value="">{allTypes}</MenuItem>
          <MenuItem value="raw">{rawLabel}</MenuItem>
          <MenuItem value="finished">{finishedLabel}</MenuItem>
        </TextField>

        <TextField
          select
          label={activeLabel}
          value={filters.state.active}
          onChange={(e) =>
            filters.setState({ active: e.target.value as BatchFilters['active'] })
          }
          sx={{ minWidth: { md: 180 } }}
        >
          <MenuItem value="">{allStatus}</MenuItem>
          <MenuItem value="available">{availableOnly}</MenuItem>
          <MenuItem value="active">{activeOnly}</MenuItem>
          <MenuItem value="inactive">{inactiveOnly}</MenuItem>
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

export function BatchListView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const filters = useSetState<BatchFilters>({ productType: '', active: '' });
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Batch[]>([]);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listBatches(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('batches.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const dataFiltered = useMemo(() => {
    let rows = tableData;
    if (filters.state.productType) {
      rows = rows.filter((r) => r.productType === filters.state.productType);
    }
    if (filters.state.active === 'available') {
      rows = rows.filter((r) => r.active && r.remainingQty > 0);
    }
    if (filters.state.active === 'active') {
      rows = rows.filter((r) => r.active);
    }
    if (filters.state.active === 'inactive') {
      rows = rows.filter((r) => !r.active);
    }
    return rows;
  }, [filters.state.active, filters.state.productType, tableData]);

  const handleConfirmDeactivate = useCallback(async () => {
    if (!enterpriseId || !deactivateId) return;
    try {
      await deactivateBatch(enterpriseId, deactivateId);
      toast.success(t('batches.deactivateSuccess'));
      setDeactivateId(null);
      confirm.onFalse();
      await loadBatches();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('batches.deactivateError')));
    }
  }, [confirm, deactivateId, enterpriseId, loadBatches, t]);

  const CustomToolbar = useCallback(
    () => (
      <BatchToolbar
        filters={filters}
        typeLabel={t('batches.fields.productType')}
        activeLabel={t('batches.fields.active')}
        allTypes={t('batches.filters.allTypes')}
        rawLabel={t('products.types.raw')}
        finishedLabel={t('products.types.finished')}
        allStatus={t('batches.filters.allStatus')}
        activeOnly={t('batches.filters.activeOnly')}
        inactiveOnly={t('batches.filters.inactiveOnly')}
        availableOnly={t('batches.filters.availableOnly')}
      />
    ),
    [filters, t]
  );

  const columns = useMemo<GridColDef<Batch>[]>(
    () => [
      {
        field: 'lotCode',
        headerName: t('batches.fields.lotCode'),
        width: 170,
        hideable: false,
      },
      {
        field: 'productName',
        headerName: t('batches.fields.product'),
        flex: 1,
        minWidth: 180,
        renderCell: (params) => `${params.row.productName} (${params.row.productSku})`,
      },
      {
        field: 'productType',
        headerName: t('batches.fields.productType'),
        width: 120,
        renderCell: (params) =>
          params.row.productType === 'finished'
            ? t('products.types.finished')
            : t('products.types.raw'),
      },
      {
        field: 'origin',
        headerName: t('batches.fields.origin'),
        width: 170,
        valueGetter: (_val, row) =>
          row.processingOrderCode
            ? `${t('batches.originProcessing')} (${row.processingOrderCode})`
            : row.supplierName || t('batches.originSupplier'),
      },
      {
        field: 'initialQty',
        headerName: t('batches.fields.initialQty'),
        width: 120,
        renderCell: (params) => `${fNumber(params.row.initialQty)} ${params.row.unit}`,
      },
      {
        field: 'remainingQty',
        headerName: t('batches.fields.remainingQty'),
        width: 130,
        renderCell: (params) => (
          <Label
            color={params.row.remainingQty > 0 ? 'info' : 'warning'}
            variant="soft"
          >
            {fNumber(params.row.remainingQty)} {params.row.unit}
          </Label>
        ),
      },
      {
        field: 'unitCost',
        headerName: t('batches.fields.unitCost'),
        width: 130,
        renderCell: (params) => fCurrency(params.row.unitCost),
      },
      {
        field: 'active',
        headerName: t('batches.fields.active'),
        width: 100,
        renderCell: (params) => (
          <Label color={params.row.active ? 'success' : 'default'} variant="soft">
            {params.row.active
              ? t('batches.filters.activeOnly')
              : t('batches.filters.inactiveOnly')}
          </Label>
        ),
      },
      {
        field: 'createdAt',
        headerName: t('batches.fields.createdAt'),
        width: 160,
        renderCell: (params) =>
          params.row.createdAt ? fDateTime(params.row.createdAt) || '—' : '—',
      },
      {
        field: 'actions',
        headerName: ' ',
        width: 80,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) =>
          params.row.active ? (
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                setDeactivateId(params.row.id);
                confirm.onTrue();
              }}
            >
              <Iconify icon="solar:trash-bin-trash-bold" />
            </IconButton>
          ) : null,
      },
    ],
    [confirm, t]
  );

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('batches.listHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.batches'), href: paths.dashboard.batches.root },
            { name: t('batches.listHeading') },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                component={RouterLink}
                href={paths.dashboard.batches.movements}
                variant="outlined"
                startIcon={<Iconify icon="solar:history-bold" />}
              >
                {t('batches.viewMovements')}
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.batches.create}
                variant="contained"
                startIcon={<Iconify icon="mingcute:add-line" />}
              >
                {t('batches.newBatch')}
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('batches.errorMissingEnterprise')}
            sx={{ py: 10 }}
          />
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
                noRowsOverlay: () => <EmptyContent title={t('batches.empty')} />,
                noResultsOverlay: () => <EmptyContent title={t('batches.empty')} />,
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
          setDeactivateId(null);
          confirm.onFalse();
        }}
        title={t('batches.deactivate')}
        content={t('batches.deactivateConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivate}>
            {t('batches.deactivate')}
          </Button>
        }
      />
    </>
  );
}

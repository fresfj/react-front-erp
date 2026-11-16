import type { GridColDef, GridSlots } from '@mui/x-data-grid';
import type {
  StockMovement,
  StockMovementType,
} from 'src/api/firestore/stock-movements';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
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

import { useSetState } from 'src/hooks/use-set-state';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency, fNumber } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listStockMovements } from 'src/api/firestore/stock-movements';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type MovementFilters = {
  type: '' | StockMovementType;
};

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<MovementFilters>>;
  typeLabel: string;
  allTypes: string;
  typeLabels: Record<StockMovementType, string>;
};

function MovementToolbar({ filters, typeLabel, allTypes, typeLabels }: ToolbarProps) {
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
          value={filters.state.type}
          onChange={(e) =>
            filters.setState({ type: e.target.value as MovementFilters['type'] })
          }
          sx={{ minWidth: { md: 220 } }}
        >
          <MenuItem value="">{allTypes}</MenuItem>
          {(Object.keys(typeLabels) as StockMovementType[]).map((key) => (
            <MenuItem key={key} value={key}>
              {typeLabels[key]}
            </MenuItem>
          ))}
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

export function StockMovementListView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const filters = useSetState<MovementFilters>({ type: '' });
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<StockMovement[]>([]);

  const loadMovements = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listStockMovements(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('batches.movementsLoadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const dataFiltered = useMemo(() => {
    if (!filters.state.type) return tableData;
    return tableData.filter((row) => row.type === filters.state.type);
  }, [filters.state.type, tableData]);

  const typeLabels = useMemo<Record<StockMovementType, string>>(
    () => ({
      IN: t('batches.movementTypes.IN'),
      OUT: t('batches.movementTypes.OUT'),
      ADJUST: t('batches.movementTypes.ADJUST'),
      PROCESSING_OUT: t('batches.movementTypes.PROCESSING_OUT'),
      PROCESSING_IN: t('batches.movementTypes.PROCESSING_IN'),
    }),
    [t]
  );

  const CustomToolbar = useCallback(
    () => (
      <MovementToolbar
        filters={filters}
        typeLabel={t('batches.fields.movementType')}
        allTypes={t('batches.filters.allTypes')}
        typeLabels={typeLabels}
      />
    ),
    [filters, t, typeLabels]
  );

  const columns = useMemo<GridColDef<StockMovement>[]>(
    () => [
      {
        field: 'createdAt',
        headerName: t('batches.fields.createdAt'),
        width: 170,
        renderCell: (params) =>
          params.row.createdAt ? fDateTime(params.row.createdAt) || '—' : '—',
      },
      {
        field: 'type',
        headerName: t('batches.fields.movementType'),
        width: 200,
        renderCell: (params) => {
          const isIn = params.row.type === 'IN' || params.row.type === 'PROCESSING_IN';
          return (
            <Label color={isIn ? 'success' : 'warning'} variant="soft">
              {typeLabels[params.row.type] || params.row.type}
            </Label>
          );
        },
      },
      {
        field: 'productName',
        headerName: t('batches.fields.product'),
        flex: 1,
        minWidth: 180,
        renderCell: (params) => `${params.row.productName} (${params.row.productSku})`,
      },
      {
        field: 'lotCode',
        headerName: t('batches.fields.lotCode'),
        width: 170,
        valueGetter: (_v, row) => row.lotCode || '—',
      },
      {
        field: 'qty',
        headerName: t('batches.fields.qty'),
        width: 130,
        renderCell: (params) => {
          const isIn = params.row.type === 'IN' || params.row.type === 'PROCESSING_IN';
          return `${isIn ? '+' : '-'}${fNumber(params.row.qty)} ${params.row.unit}`;
        },
      },
      {
        field: 'unitCost',
        headerName: t('batches.fields.unitCost'),
        width: 130,
        renderCell: (params) =>
          typeof params.row.unitCost === 'number' ? fCurrency(params.row.unitCost) : '—',
      },
      {
        field: 'reason',
        headerName: t('batches.fields.reason'),
        width: 220,
        valueGetter: (_v, row) => row.reason || '—',
      },
    ],
    [t, typeLabels]
  );

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('batches.movementsHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.batches'), href: paths.dashboard.batches.list },
          { name: t('batches.movementsHeading') },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.batches.list}
            variant="outlined"
            startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
          >
            {t('batches.backToBatches')}
          </Button>
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
              noRowsOverlay: () => <EmptyContent title={t('batches.movementsEmpty')} />,
              noResultsOverlay: () => <EmptyContent title={t('batches.movementsEmpty')} />,
            }}
            sx={{
              border: 0,
              [`& .${gridClasses.cell}`]: { alignItems: 'center', display: 'inline-flex' },
            }}
          />
        </Card>
      )}
    </DashboardContent>
  );
}

import type { Product, ProductType } from 'src/api/firestore/products';
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
  GridToolbarContainer,
  GridToolbarQuickFilter,
  GridToolbarFilterButton,
  GridToolbarColumnsButton,
  GridToolbarExport,
} from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';
import { useSetState } from 'src/hooks/use-set-state';

import { fDateTime } from 'src/utils/format-time';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listProducts, deactivateProduct } from 'src/api/firestore/products';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type ErpProductFilters = {
  type: ProductType | '';
  active: '' | 'active' | 'inactive';
};

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<ErpProductFilters>>;
  typeLabel: string;
  activeLabel: string;
  allTypes: string;
  allStatus: string;
  rawLabel: string;
  finishedLabel: string;
  activeOnly: string;
  inactiveOnly: string;
};

function ProductToolbar({
  filters,
  typeLabel,
  activeLabel,
  allTypes,
  allStatus,
  rawLabel,
  finishedLabel,
  activeOnly,
  inactiveOnly,
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
          value={filters.state.type}
          onChange={(event) =>
            filters.setState({ type: event.target.value as ProductType | '' })
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
          onChange={(event) =>
            filters.setState({ active: event.target.value as ErpProductFilters['active'] })
          }
          sx={{ minWidth: { md: 160 } }}
        >
          <MenuItem value="">{allStatus}</MenuItem>
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

export function ProductListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const filters = useSetState<ErpProductFilters>({ type: '', active: '' });

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Product[]>([]);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

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
      toast.error(getFirebaseErrorMessage(error, t('products.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const dataFiltered = useMemo(() => {
    let rows = tableData;

    if (filters.state.type) {
      rows = rows.filter((row) => row.type === filters.state.type);
    }

    if (filters.state.active === 'active') {
      rows = rows.filter((row) => row.active);
    }

    if (filters.state.active === 'inactive') {
      rows = rows.filter((row) => !row.active);
    }

    return rows;
  }, [filters.state.active, filters.state.type, tableData]);

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
      setDeactivateId(null);
      confirm.onFalse();
      await loadProducts();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('products.deactivateError')));
    }
  }, [confirm, deactivateId, enterpriseId, loadProducts, t]);

  const CustomToolbar = useCallback(
    () => (
      <ProductToolbar
        filters={filters}
        typeLabel={t('products.fields.type')}
        activeLabel={t('products.fields.active')}
        allTypes={t('products.filters.allTypes')}
        allStatus={t('products.filters.allStatus')}
        rawLabel={t('products.types.raw')}
        finishedLabel={t('products.types.finished')}
        activeOnly={t('products.filters.activeOnly')}
        inactiveOnly={t('products.filters.inactiveOnly')}
      />
    ),
    [filters, t]
  );

  const columns = useMemo<GridColDef<Product>[]>(
    () => [
      {
        field: 'name',
        headerName: t('products.fields.name'),
        flex: 1,
        minWidth: 200,
        hideable: false,
      },
      { field: 'sku', headerName: t('products.fields.sku'), width: 140 },
      {
        field: 'type',
        headerName: t('products.fields.type'),
        width: 140,
        renderCell: (params) =>
          params.row.type === 'finished' ? t('products.types.finished') : t('products.types.raw'),
      },
      { field: 'unit', headerName: t('products.fields.unit'), width: 100 },
      {
        field: 'costPrice',
        headerName: t('products.fields.costPrice'),
        width: 120,
        valueGetter: (_value, row) => row.costPrice ?? '—',
      },
      {
        field: 'salePrice',
        headerName: t('products.fields.salePrice'),
        width: 120,
        valueGetter: (_value, row) => row.salePrice ?? '—',
      },
      {
        field: 'active',
        headerName: t('products.fields.active'),
        width: 110,
        renderCell: (params) => (
          <Label color={params.row.active ? 'success' : 'default'} variant="soft">
            {params.row.active
              ? t('products.filters.activeOnly')
              : t('products.filters.inactiveOnly')}
          </Label>
        ),
      },
      {
        field: 'createdAt',
        headerName: t('products.fields.createdAt'),
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
            <IconButton size="small" onClick={() => handleEditRow(params.row.id)}>
              <Iconify icon="solar:pen-bold" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => handleAskDeactivate(params.row.id)}
            >
              <Iconify icon="solar:trash-bin-trash-bold" />
            </IconButton>
          </Stack>
        ),
      },
    ],
    [handleAskDeactivate, handleEditRow, t]
  );

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('products.listHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.products'), href: paths.dashboard.products.root },
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

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('products.errorMissingEnterprise')}
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
                noRowsOverlay: () => <EmptyContent title={t('products.empty')} />,
                noResultsOverlay: () => <EmptyContent title={t('products.empty')} />,
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

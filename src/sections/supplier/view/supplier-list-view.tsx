import type { Supplier } from 'src/api/firestore/suppliers';
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

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listSuppliers, deactivateSupplier } from 'src/api/firestore/suppliers';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type SupplierFilters = {
  active: '' | 'active' | 'inactive';
};

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<SupplierFilters>>;
  activeLabel: string;
  allStatus: string;
  activeOnly: string;
  inactiveOnly: string;
};

function SupplierToolbar({
  filters,
  activeLabel,
  allStatus,
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
          label={activeLabel}
          value={filters.state.active}
          onChange={(event) =>
            filters.setState({ active: event.target.value as SupplierFilters['active'] })
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

export function SupplierListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const canWrite = user?.role !== 'operador';

  const filters = useSetState<SupplierFilters>({ active: '' });

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Supplier[]>([]);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

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
      toast.error(getFirebaseErrorMessage(error, t('suppliers.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const dataFiltered = useMemo(() => {
    let rows = tableData;

    if (filters.state.active === 'active') {
      rows = rows.filter((row) => row.active);
    }

    if (filters.state.active === 'inactive') {
      rows = rows.filter((row) => !row.active);
    }

    return rows;
  }, [filters.state.active, tableData]);

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
      setDeactivateId(null);
      confirm.onFalse();
      await loadSuppliers();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('suppliers.deactivateError')));
    }
  }, [canWrite, confirm, deactivateId, enterpriseId, loadSuppliers, t]);

  const CustomToolbar = useCallback(
    () => (
      <SupplierToolbar
        filters={filters}
        activeLabel={t('suppliers.fields.active')}
        allStatus={t('suppliers.filters.allStatus')}
        activeOnly={t('suppliers.filters.activeOnly')}
        inactiveOnly={t('suppliers.filters.inactiveOnly')}
      />
    ),
    [filters, t]
  );

  const columns = useMemo<GridColDef<Supplier>[]>(
    () => [
      {
        field: 'name',
        headerName: t('suppliers.fields.name'),
        flex: 1,
        minWidth: 200,
        hideable: false,
      },
      {
        field: 'document',
        headerName: t('suppliers.fields.document'),
        width: 160,
        valueGetter: (_v, row) => row.document || '—',
      },
      {
        field: 'phone',
        headerName: t('suppliers.fields.phone'),
        width: 150,
        valueGetter: (_v, row) => row.phone || '—',
      },
      {
        field: 'city',
        headerName: t('suppliers.fields.city', { defaultValue: 'Cidade/UF' }),
        width: 160,
        valueGetter: (_v, row) =>
          row.city ? `${row.city}${row.state ? `/${row.state}` : ''}` : '—',
      },
      {
        field: 'email',
        headerName: t('suppliers.fields.email'),
        width: 200,
        valueGetter: (_v, row) => row.email || '—',
      },
      {
        field: 'active',
        headerName: t('suppliers.fields.active'),
        width: 110,
        renderCell: (params) => (
          <Label color={params.row.active ? 'success' : 'default'} variant="soft">
            {params.row.active
              ? t('suppliers.filters.activeOnly')
              : t('suppliers.filters.inactiveOnly')}
          </Label>
        ),
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
            {canWrite && (
              <IconButton
                size="small"
                color="error"
                onClick={() => handleAskDeactivate(params.row.id)}
              >
                <Iconify icon="solar:trash-bin-trash-bold" />
              </IconButton>
            )}
          </Stack>
        ),
      },
    ],
    [canWrite, handleAskDeactivate, handleEditRow, t]
  );

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('suppliers.listHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.suppliers'), href: paths.dashboard.suppliers.root },
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

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('suppliers.errorMissingEnterprise')}
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
                noRowsOverlay: () => <EmptyContent title={t('suppliers.empty')} />,
                noResultsOverlay: () => <EmptyContent title={t('suppliers.empty')} />,
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

import type { Enterprise } from 'src/api/firestore/platform';
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

import { useSetState } from 'src/hooks/use-set-state';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listEnterprisesClient } from 'src/api/firestore/platform';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type Filters = { active: '' | 'active' | 'inactive' };

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<Filters>>;
  activeLabel: string;
  allStatus: string;
  activeOnly: string;
  inactiveOnly: string;
};

function EnterpriseToolbar({
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
          onChange={(e) => filters.setState({ active: e.target.value as Filters['active'] })}
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

export function EnterpriseListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();

  const filters = useSetState<Filters>({ active: '' });
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Enterprise[]>([]);

  const load = useCallback(async () => {
    if (!user?.platformAdmin) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listEnterprisesClient();
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('enterprises.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [t, user?.platformAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const dataFiltered = useMemo(() => {
    let rows = tableData;
    if (filters.state.active === 'active') rows = rows.filter((r) => r.active);
    if (filters.state.active === 'inactive') rows = rows.filter((r) => !r.active);
    return rows;
  }, [filters.state.active, tableData]);

  const CustomToolbar = useCallback(
    () => (
      <EnterpriseToolbar
        filters={filters}
        activeLabel={t('enterprises.fields.active')}
        allStatus={t('enterprises.filters.allStatus')}
        activeOnly={t('enterprises.filters.activeOnly')}
        inactiveOnly={t('enterprises.filters.inactiveOnly')}
      />
    ),
    [filters, t]
  );

  const columns = useMemo<GridColDef<Enterprise>[]>(
    () => [
      {
        field: 'name',
        headerName: t('enterprises.fields.name'),
        flex: 1,
        minWidth: 200,
        hideable: false,
      },
      { field: 'id', headerName: t('enterprises.fields.id'), width: 180 },
      {
        field: 'adminEmail',
        headerName: t('enterprises.fields.adminEmail'),
        width: 240,
        valueGetter: (_value, row) => row.adminEmail || '—',
      },
      {
        field: 'active',
        headerName: t('enterprises.fields.active'),
        width: 110,
        renderCell: (params) => (
          <Label color={params.row.active ? 'success' : 'default'} variant="soft">
            {params.row.active
              ? t('enterprises.filters.activeOnly')
              : t('enterprises.filters.inactiveOnly')}
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
            <IconButton
              size="small"
              onClick={() => router.push(paths.dashboard.enterprises.details(params.row.id))}
            >
              <Iconify icon="solar:eye-bold" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => router.push(paths.dashboard.enterprises.edit(params.row.id))}
            >
              <Iconify icon="solar:pen-bold" />
            </IconButton>
          </Stack>
        ),
      },
    ],
    [router, t]
  );

  if (!user?.platformAdmin) {
    return (
      <DashboardContent>
        <EmptyContent
          filled
          title={t('permission.deniedTitle')}
          description={t('permission.deniedBody')}
          sx={{ py: 10 }}
        />
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('enterprises.listHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.enterprises'), href: paths.dashboard.enterprises.root },
          { name: t('enterprises.listHeading') },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.enterprises.create}
            variant="contained"
            startIcon={<Iconify icon="mingcute:add-line" />}
          >
            {t('enterprises.newEnterprise')}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

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
            noRowsOverlay: () => <EmptyContent title={t('enterprises.empty')} />,
            noResultsOverlay: () => <EmptyContent title={t('enterprises.empty')} />,
          }}
          sx={{
            border: 0,
            [`& .${gridClasses.cell}`]: { alignItems: 'center', display: 'inline-flex' },
          }}
        />
      </Card>
    </DashboardContent>
  );
}

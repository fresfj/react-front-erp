import type { GridColDef } from '@mui/x-data-grid';
import type { Enterprise } from 'src/api/firestore/platform';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import { GridActionsCellItem } from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listEnterprisesClient } from 'src/api/firestore/platform';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativa' },
  { value: 'inactive', label: 'Inativa' },
];

// ----------------------------------------------------------------------

export function EnterpriseListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
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
    if (statusFilter.length) {
      rows = rows.filter((r) => statusFilter.includes(r.active ? 'active' : 'inactive'));
    }
    return rows;
  }, [statusFilter, tableData]);

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'status',
      label: t('enterprises.fields.active', { defaultValue: 'Status' }),
      options: STATUS_OPTIONS,
      value: statusFilter,
      onChange: setStatusFilter,
    },
  ];

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
        type: 'actions',
        field: 'actions',
        headerName: ' ',
        align: 'right',
        headerAlign: 'right',
        width: 80,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        getActions: (params) => [
          <GridActionsCellItem
            key="view"
            showInMenu
            icon={<Iconify icon="solar:eye-bold" />}
            label="Visualizar"
            onClick={() => router.push(paths.dashboard.enterprises.details(params.row.id))}
          />,
          <GridActionsCellItem
            key="edit"
            showInMenu
            icon={<Iconify icon="solar:pen-bold" />}
            label="Editar"
            onClick={() => router.push(paths.dashboard.enterprises.edit(params.row.id))}
          />,
        ],
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
        <ErpDataGrid<Enterprise>
          rows={dataFiltered}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.id}
          emptyTitle={t('enterprises.empty')}
          toolbar={{
            selectFilters,
            searchPlaceholder: 'Pesquisar empresa por nome, código ou e-mail…',
            filteredResults: dataFiltered.length,
          }}
        />
      </Card>
    </DashboardContent>
  );
}

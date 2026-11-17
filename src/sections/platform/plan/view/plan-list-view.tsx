import type { Plan } from 'src/api/firestore/plans';
import type { GridColDef } from '@mui/x-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import { GridActionsCellItem } from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listPlans } from 'src/api/firestore/plans';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

// ----------------------------------------------------------------------

export function PlanListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Plan[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTableData(await listPlans());
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo<GridColDef<Plan>[]>(
    () => [
      { field: 'name', headerName: t('billing.fields.name'), flex: 1, minWidth: 160 },
      { field: 'code', headerName: t('billing.fields.code'), width: 100 },
      {
        field: 'priceMonthly',
        headerName: t('billing.fields.priceMonthly'),
        width: 140,
        valueFormatter: (value) => `R$ ${Number(value ?? 0).toFixed(2)}`,
      },
      {
        field: 'active',
        headerName: t('billing.fields.active'),
        width: 110,
        renderCell: (params) => (
          <Label color={params.row.active ? 'success' : 'default'}>
            {params.row.active ? 'Ativo' : 'Inativo'}
          </Label>
        ),
      },
      { field: 'sortOrder', headerName: t('billing.fields.sortOrder'), width: 90 },
      {
        type: 'actions',
        field: 'actions',
        width: 80,
        getActions: (params) => [
          <GridActionsCellItem
            key="edit"
            icon={<Iconify icon="solar:pen-bold" />}
            label="Edit"
            onClick={() => router.push(paths.dashboard.plans.edit(params.row.id))}
          />,
        ],
      },
    ],
    [router, t]
  );

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('billing.plansListHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('billing.plansTitle') },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.plans.create}
            variant="contained"
            startIcon={<Iconify icon="mingcute:add-line" />}
          >
            {t('nav.plansCreate')}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <Card sx={{ height: 720 }}>
        <ErpDataGrid
          rows={tableData}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.id}
          emptyTitle={t('billing.plansTitle')}
        />
      </Card>
    </DashboardContent>
  );
}

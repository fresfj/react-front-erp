import type { GridColDef } from '@mui/x-data-grid';
import type { Sale } from 'src/api/firestore/sales';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import { GridActionsCellItem } from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listSales, cancelSale } from 'src/api/firestore/sales';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'completed', label: 'Concluída' },
  { value: 'cancelled', label: 'Cancelada' },
];

// ----------------------------------------------------------------------

export function SaleListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const canCancel = user?.role !== 'operador';

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
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
    let rows = tableData;
    if (statusFilter.length) {
      rows = rows.filter((row) => statusFilter.includes(row.status));
    }
    return rows;
  }, [statusFilter, tableData]);

  const handleAskCancel = useCallback(
    (sale: Sale) => {
      setCancelTarget(sale);
      confirm.onTrue();
    },
    [confirm]
  );

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

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'status',
      label: t('pos.fields.status', { defaultValue: 'Status' }),
      options: STATUS_OPTIONS,
      value: statusFilter,
      onChange: setStatusFilter,
    },
  ];

  const columns = useMemo<GridColDef<Sale>[]>(
    () => [
      {
        field: 'saleNumber',
        headerName: t('pos.fields.saleNumber'),
        width: 140,
        hideable: false,
      },
      {
        field: 'customerName',
        headerName: t('pos.fields.customer'),
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, row) => row.customerName || t('pos.anonymousCustomer'),
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
            label="Visualizar Detalhes"
            onClick={() => router.push(paths.dashboard.pos.saleDetails(params.row.id))}
          />,
          ...(canCancel && params.row.status === 'completed'
            ? [
                <GridActionsCellItem
                  key="cancel"
                  showInMenu
                  icon={<Iconify icon="solar:trash-bin-trash-bold" />}
                  label="Cancelar Venda"
                  onClick={() => handleAskCancel(params.row)}
                  sx={{ color: 'error.main' }}
                />,
              ]
            : []),
        ],
      },
    ],
    [canCancel, handleAskCancel, router, t]
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
              href={paths.dashboard.pos.root}
              variant="contained"
              startIcon={<Iconify icon="solar:cart-plus-bold" />}
            >
              {t('pos.openPos')}
            </Button>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('pos.errorMissingEnterprise')}
            sx={{ py: 10 }}
          />
        )}

        {enterpriseId && (
          <Card sx={{ height: 720 }}>
            <ErpDataGrid<Sale>
              rows={dataFiltered}
              columns={columns}
              loading={loading}
              getRowId={(row) => row.id}
              emptyTitle={t('pos.emptySales')}
              toolbar={{
                selectFilters,
                searchPlaceholder: 'Pesquisar venda por número ou cliente…',
                filteredResults: dataFiltered.length,
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
        title={t('pos.cancel')}
        content={t('pos.cancelConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmCancel}>
            {t('pos.cancel')}
          </Button>
        }
      />
    </>
  );
}

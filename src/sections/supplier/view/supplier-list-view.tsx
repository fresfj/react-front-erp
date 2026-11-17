import type { GridColDef } from '@mui/x-data-grid';
import type { Supplier } from 'src/api/firestore/suppliers';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import { GridActionsCellItem } from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listSuppliers, deactivateSupplier } from 'src/api/firestore/suppliers';

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
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];

// ----------------------------------------------------------------------

export function SupplierListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const canWrite = user?.role !== 'operador';

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
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

    if (statusFilter.length) {
      rows = rows.filter((row) => statusFilter.includes(row.active ? 'active' : 'inactive'));
    }

    return rows;
  }, [statusFilter, tableData]);

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

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'status',
      label: t('suppliers.fields.active', { defaultValue: 'Status' }),
      options: STATUS_OPTIONS,
      value: statusFilter,
      onChange: setStatusFilter,
    },
  ];

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
            key="edit"
            showInMenu
            icon={<Iconify icon="solar:pen-bold" />}
            label="Editar"
            onClick={() => handleEditRow(params.row.id)}
          />,
          ...(canWrite
            ? [
                <GridActionsCellItem
                  key="delete"
                  showInMenu
                  icon={<Iconify icon="solar:trash-bin-trash-bold" />}
                  label="Desativar"
                  onClick={() => handleAskDeactivate(params.row.id)}
                  sx={{ color: 'error.main' }}
                />,
              ]
            : []),
        ],
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
            <ErpDataGrid<Supplier>
              rows={dataFiltered}
              columns={columns}
              loading={loading}
              getRowId={(row) => row.id}
              emptyTitle={t('suppliers.empty')}
              toolbar={{
                selectFilters,
                searchPlaceholder: 'Pesquisar fornecedor, CNPJ/CPF, e-mail…',
                filteredResults: dataFiltered.length,
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

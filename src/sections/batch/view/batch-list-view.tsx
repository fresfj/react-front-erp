import type { GridColDef } from '@mui/x-data-grid';
import type { Batch } from 'src/api/firestore/batches';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import { GridActionsCellItem } from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listBatches, deactivateBatch } from 'src/api/firestore/batches';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const TYPE_OPTIONS = [
  { value: 'raw', label: 'Matéria-prima' },
  { value: 'finished', label: 'Produto Acabado' },
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'Com saldo disponível' },
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];

// ----------------------------------------------------------------------

export function BatchListView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const confirm = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
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

    if (typeFilter.length) {
      rows = rows.filter((row) => typeFilter.includes(row.productType));
    }

    if (statusFilter.length) {
      rows = rows.filter((row) => {
        if (statusFilter.includes('available') && row.remainingQty > 0) return true;
        if (statusFilter.includes('active') && row.active) return true;
        if (statusFilter.includes('inactive') && !row.active) return true;
        return false;
      });
    }

    return rows;
  }, [statusFilter, tableData, typeFilter]);

  const handleAskDeactivate = useCallback(
    (id: string) => {
      setDeactivateId(id);
      confirm.onTrue();
    },
    [confirm]
  );

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

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'type',
      label: t('batches.fields.type', { defaultValue: 'Tipo de Produto' }),
      options: TYPE_OPTIONS,
      value: typeFilter,
      onChange: setTypeFilter,
    },
    {
      id: 'status',
      label: t('batches.fields.active', { defaultValue: 'Status' }),
      options: STATUS_OPTIONS,
      value: statusFilter,
      onChange: setStatusFilter,
    },
  ];

  const columns = useMemo<GridColDef<Batch>[]>(
    () => [
      {
        field: 'lotCode',
        headerName: t('batches.fields.code'),
        width: 140,
        hideable: false,
      },
      {
        field: 'productName',
        headerName: t('batches.fields.product'),
        flex: 1,
        minWidth: 200,
      },
      {
        field: 'productType',
        headerName: t('batches.fields.type'),
        width: 140,
        renderCell: (params) => (
          <Label
            variant="soft"
            color={params.row.productType === 'finished' ? 'primary' : 'warning'}
          >
            {params.row.productType === 'finished'
              ? t('products.types.finished')
              : t('products.types.raw')}
          </Label>
        ),
      },
      {
        field: 'initialQty',
        headerName: t('batches.fields.initialQuantity'),
        width: 120,
        renderCell: (params) =>
          `${fNumber(params.row.initialQty)} ${params.row.unit || 'kg'}`,
      },
      {
        field: 'remainingQty',
        headerName: t('batches.fields.currentQuantity'),
        width: 130,
        renderCell: (params) => (
          <Label
            variant="soft"
            color={
              params.row.remainingQty <= 0
                ? 'default'
                : params.row.remainingQty < params.row.initialQty * 0.2
                  ? 'warning'
                  : 'success'
            }
          >
            {`${fNumber(params.row.remainingQty)} ${params.row.unit || 'kg'}`}
          </Label>
        ),
      },
      {
        field: 'unitCost',
        headerName: t('batches.fields.unitCost'),
        width: 120,
        renderCell: (params) => fCurrency(params.row.unitCost),
      },
      {
        field: 'totalCost',
        headerName: t('batches.fields.totalCost'),
        width: 130,
        renderCell: (params) => fCurrency(params.row.remainingQty * params.row.unitCost),
      },
      {
        field: 'supplierName',
        headerName: t('batches.fields.supplier'),
        width: 160,
        valueGetter: (_v, row) => row.supplierName || '—',
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
        type: 'actions',
        field: 'actions',
        headerName: ' ',
        align: 'right',
        headerAlign: 'right',
        width: 80,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        getActions: (params) =>
          params.row.active
            ? [
                <GridActionsCellItem
                  key="deactivate"
                  showInMenu
                  icon={<Iconify icon="solar:trash-bin-trash-bold" />}
                  label="Desativar Lote"
                  onClick={() => handleAskDeactivate(params.row.id)}
                  sx={{ color: 'error.main' }}
                />,
              ]
            : [],
      },
    ],
    [handleAskDeactivate, t]
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
            <ErpDataGrid<Batch>
              rows={dataFiltered}
              columns={columns}
              loading={loading}
              getRowId={(row) => row.id}
              emptyTitle={t('batches.empty')}
              toolbar={{
                selectFilters,
                searchPlaceholder: 'Pesquisar lote por código, produto ou fornecedor…',
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

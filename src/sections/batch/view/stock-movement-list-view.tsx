import type { GridColDef } from '@mui/x-data-grid';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';
import type {
  StockMovement,
  StockMovementType,
} from 'src/api/firestore/stock-movements';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Button from '@mui/material/Button';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listStockMovements } from 'src/api/firestore/stock-movements';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export function StockMovementListView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<StockMovement[]>([]);

  const typeLabels = useMemo<Record<StockMovementType, string>>(
    () => ({
      IN: t('batches.movements.IN', { defaultValue: 'Entrada' }),
      OUT: t('batches.movements.OUT', { defaultValue: 'Saída' }),
      PROCESSING_IN: t('batches.movements.PROCESSING_IN', { defaultValue: 'Entrada Beneficiamento' }),
      PROCESSING_OUT: t('batches.movements.PROCESSING_OUT', { defaultValue: 'Saída Beneficiamento' }),
      ADJUST: t('batches.movements.ADJUSTMENT', { defaultValue: 'Ajuste de Estoque' }),
    }),
    [t]
  );

  const typeOptions = useMemo(
    () =>
      (Object.keys(typeLabels) as StockMovementType[]).map((key) => ({
        value: key,
        label: typeLabels[key],
      })),
    [typeLabels]
  );

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
      toast.error(getFirebaseErrorMessage(error, t('batches.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const dataFiltered = useMemo(() => {
    let rows = tableData;
    if (typeFilter.length) {
      rows = rows.filter((row) => typeFilter.includes(row.type));
    }
    return rows;
  }, [tableData, typeFilter]);

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'type',
      label: t('batches.fields.type', { defaultValue: 'Tipo de Movimentação' }),
      options: typeOptions,
      value: typeFilter,
      onChange: setTypeFilter,
    },
  ];

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
        headerName: t('batches.fields.type'),
        width: 170,
        renderCell: (params) => {
          const { type } = params.row;
          const isIn = type === 'IN' || type === 'PROCESSING_IN';
          const isProcessing = type === 'PROCESSING_IN' || type === 'PROCESSING_OUT';
          return (
            <Label
              variant="soft"
              color={
                isProcessing
                  ? 'info'
                  : isIn
                    ? 'success'
                    : 'warning'
              }
            >
              {typeLabels[type] || type}
            </Label>
          );
        },
      },
      {
        field: 'lotCode',
        headerName: t('batches.fields.code'),
        width: 140,
        renderCell: (params) => params.row.lotCode || '—',
      },
      {
        field: 'productName',
        headerName: t('batches.fields.product'),
        flex: 1,
        minWidth: 200,
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
          <ErpDataGrid<StockMovement>
            rows={dataFiltered}
            columns={columns}
            loading={loading}
            getRowId={(row) => row.id}
            emptyTitle={t('batches.movementsEmpty')}
            toolbar={{
              selectFilters,
              searchPlaceholder: 'Pesquisar movimentação por lote ou produto…',
              filteredResults: dataFiltered.length,
            }}
          />
        </Card>
      )}
    </DashboardContent>
  );
}

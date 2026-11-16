import type { Payable } from 'src/api/firestore/payables';
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

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listPayables, updatePayable } from 'src/api/firestore/payables';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type PayableFilters = {
  status: '' | 'open' | 'paid' | 'cancelled' | 'overdue';
};

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<PayableFilters>>;
  statusLabel: string;
  allStatus: string;
  openLabel: string;
  paidLabel: string;
  cancelledLabel: string;
  overdueLabel: string;
};

function PayableToolbar({
  filters,
  statusLabel,
  allStatus,
  openLabel,
  paidLabel,
  cancelledLabel,
  overdueLabel,
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
          label={statusLabel}
          value={filters.state.status}
          onChange={(event) =>
            filters.setState({ status: event.target.value as PayableFilters['status'] })
          }
          sx={{ minWidth: { md: 200 } }}
        >
          <MenuItem value="">{allStatus}</MenuItem>
          <MenuItem value="open">{openLabel}</MenuItem>
          <MenuItem value="overdue">{overdueLabel}</MenuItem>
          <MenuItem value="paid">{paidLabel}</MenuItem>
          <MenuItem value="cancelled">{cancelledLabel}</MenuItem>
        </TextField>

        <Stack
          direction="row"
          spacing={1}
          flexGrow={1}
          justifyContent="flex-end"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
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

function todayYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function isPayableOverdue(row: Payable): boolean {
  return row.status === 'open' && !!row.dueDate && row.dueDate < todayYmd();
}

// ----------------------------------------------------------------------

export function PayableListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const filters = useSetState<PayableFilters>({ status: '' });
  const [tableData, setTableData] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setTableData(await listPayables(enterpriseId));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao listar'));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    load();
  }, [load]);

  const dataFiltered = useMemo(() => {
    const status = filters.state.status;
    if (!status) return tableData;
    if (status === 'overdue') return tableData.filter(isPayableOverdue);
    return tableData.filter((r) => r.status === status);
  }, [filters.state.status, tableData]);

  const CustomToolbar = useCallback(
    () => (
      <PayableToolbar
        filters={filters}
        statusLabel={t('finance.status', { defaultValue: 'Status' })}
        allStatus={t('finance.filters.allStatus', { defaultValue: 'Todos os status' })}
        openLabel={t('finance.statusOpen', { defaultValue: 'Em aberto' })}
        paidLabel={t('finance.statusPaid', { defaultValue: 'Pago' })}
        cancelledLabel={t('finance.statusCancelled', { defaultValue: 'Cancelado' })}
        overdueLabel={t('finance.filters.overdue', { defaultValue: 'Vencidas' })}
      />
    ),
    [filters, t]
  );

  const columns = useMemo<GridColDef<Payable>[]>(
    () => [
      {
        field: 'description',
        headerName: t('finance.description', { defaultValue: 'Descrição' }),
        flex: 1,
        minWidth: 180,
        hideable: false,
      },
      {
        field: 'supplierName',
        headerName: t('finance.supplierName', { defaultValue: 'Fornecedor' }),
        width: 160,
        valueGetter: (_v, row) => row.supplierName || '—',
      },
      {
        field: 'category',
        headerName: t('finance.category', { defaultValue: 'Categoria' }),
        width: 140,
        valueGetter: (_v, row) =>
          t(`finance.categories.${row.category}`, { defaultValue: row.category }),
      },
      {
        field: 'amount',
        headerName: t('finance.amount', { defaultValue: 'Valor' }),
        width: 120,
        valueFormatter: (v) => fCurrency(Number(v) || 0),
      },
      {
        field: 'dueDate',
        headerName: t('finance.dueDate', { defaultValue: 'Vencimento' }),
        width: 120,
        renderCell: (params) => (
          <Label variant="soft" color={isPayableOverdue(params.row) ? 'error' : 'default'}>
            {params.row.dueDate || '—'}
          </Label>
        ),
      },
      {
        field: 'status',
        headerName: t('finance.status', { defaultValue: 'Status' }),
        width: 130,
        renderCell: (params) => {
          const overdue = isPayableOverdue(params.row);
          return (
            <Label
              variant="soft"
              color={
                overdue
                  ? 'error'
                  : params.row.status === 'paid'
                    ? 'success'
                    : params.row.status === 'cancelled'
                      ? 'default'
                      : 'warning'
              }
            >
              {overdue
                ? t('finance.filters.overdue', { defaultValue: 'Vencida' })
                : params.row.status === 'open'
                  ? t('finance.statusOpen', { defaultValue: 'Em aberto' })
                  : params.row.status === 'paid'
                    ? t('finance.statusPaid', { defaultValue: 'Pago' })
                    : t('finance.statusCancelled', { defaultValue: 'Cancelado' })}
            </Label>
          );
        },
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
              onClick={() => router.push(paths.dashboard.cash.payableEdit(params.row.id))}
            >
              <Iconify icon="solar:pen-bold" />
            </IconButton>
            {params.row.status === 'open' && (
              <IconButton
                size="small"
                color="success"
                onClick={async () => {
                  if (!enterpriseId) return;
                  try {
                    await updatePayable(enterpriseId, params.row.id, { status: 'paid' });
                    toast.success(
                      t('finance.payableUpdateSuccess', { defaultValue: 'Atualizado' })
                    );
                    load();
                  } catch (error) {
                    toast.error(getFirebaseErrorMessage(error, 'Erro'));
                  }
                }}
              >
                <Iconify icon="solar:check-circle-bold" />
              </IconButton>
            )}
          </Stack>
        ),
      },
    ],
    [enterpriseId, load, router, t]
  );

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('finance.payablesHeading', { defaultValue: 'Contas a pagar' })}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.cash', { defaultValue: 'Financeiro' }), href: paths.dashboard.cash.root },
          { name: t('nav.payables', { defaultValue: 'A pagar' }) },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.cash.payableNew}
            variant="contained"
            startIcon={<Iconify icon="mingcute:add-line" />}
          >
            {t('finance.newPayable', { defaultValue: 'Nova conta a pagar' })}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      {!enterpriseId && (
        <EmptyContent
          filled
          title={t('products.errorMissingEnterprise', {
            defaultValue: 'Empresa não configurada na sessão',
          })}
          sx={{ py: 10 }}
        />
      )}

      {enterpriseId && (
        <Card sx={{ height: 720 }}>
          <DataGrid
            rows={dataFiltered}
            columns={columns}
            loading={loading}
            getRowId={(r) => r.id}
            pageSizeOptions={[5, 10, 25]}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            slots={{
              toolbar: CustomToolbar as GridSlots['toolbar'],
              noRowsOverlay: () => (
                <EmptyContent
                  title={t('finance.emptyPayables', { defaultValue: 'Nenhuma conta' })}
                />
              ),
              noResultsOverlay: () => (
                <EmptyContent
                  title={t('finance.emptyPayables', { defaultValue: 'Nenhuma conta' })}
                />
              ),
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

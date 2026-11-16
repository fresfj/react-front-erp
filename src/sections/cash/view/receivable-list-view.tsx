import type { Customer } from 'src/api/firestore/customers';
import type { Receivable } from 'src/api/firestore/receivables';
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
import { listCustomers } from 'src/api/firestore/customers';
import { NoOpenCashSessionError, getOpenCashSession } from 'src/api/firestore/cash-sessions';
import { listReceivables, markReceivablePaid } from 'src/api/firestore/receivables';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type ReceivableRow = Receivable & {
  customerDocument?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerDebt: number;
  isOverdue: boolean;
};

type ReceivableFilters = {
  status: '' | 'open' | 'paid' | 'cancelled' | 'overdue';
};

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<ReceivableFilters>>;
  statusLabel: string;
  allStatus: string;
  openLabel: string;
  paidLabel: string;
  cancelledLabel: string;
  overdueLabel: string;
};

function ReceivableToolbar({
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
            filters.setState({ status: event.target.value as ReceivableFilters['status'] })
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

function isReceivableOverdue(row: Receivable): boolean {
  return row.status === 'open' && !!row.dueDate && row.dueDate < todayYmd();
}

// ----------------------------------------------------------------------

export function ReceivableListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const filters = useSetState<ReceivableFilters>({ status: '' });
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [customersById, setCustomersById] = useState<Map<string, Customer>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enterpriseId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [receivables, customers] = await Promise.all([
        listReceivables(enterpriseId),
        listCustomers(enterpriseId),
      ]);
      const byId = new Map<string, Customer>(customers.map((c) => [c.id, c]));
      setCustomersById(byId);

      setRows(
        receivables.map((r) => {
          const customer = r.customerId ? byId.get(r.customerId) : undefined;
          return {
            ...r,
            customerName: customer?.name || r.customerName || '',
            customerDocument: customer?.document,
            customerPhone: customer?.phone,
            customerEmail: customer?.email,
            customerDebt: customer?.currentDebt ?? 0,
            isOverdue: isReceivableOverdue(r),
          };
        })
      );
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao listar'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  const handleMarkPaid = useCallback(
    async (row: ReceivableRow) => {
      if (!enterpriseId) return;
      try {
        const session = await getOpenCashSession(enterpriseId);
        const customer = row.customerId ? customersById.get(row.customerId) : undefined;
        await markReceivablePaid(enterpriseId, row, {
          session,
          createdBy: user?.uid,
          customerCurrentDebt: customer?.currentDebt ?? 0,
        });
        toast.success(t('finance.receivableUpdateSuccess', { defaultValue: 'Atualizado' }));
        await load();
      } catch (error) {
        console.error(error);
        if (error instanceof NoOpenCashSessionError) {
          toast.error(
            t('finance.errors.noOpenCash', {
              defaultValue: 'Abra o caixa para registrar o recebimento',
            })
          );
          return;
        }
        toast.error(getFirebaseErrorMessage(error, 'Erro'));
      }
    },
    [customersById, enterpriseId, load, t, user?.uid]
  );

  useEffect(() => {
    load();
  }, [load]);

  const dataFiltered = useMemo(() => {
    const status = filters.state.status;
    if (!status) return rows;
    if (status === 'overdue') return rows.filter((r) => r.isOverdue);
    return rows.filter((r) => r.status === status);
  }, [filters.state.status, rows]);

  const CustomToolbar = useCallback(
    () => (
      <ReceivableToolbar
        filters={filters}
        statusLabel={t('finance.status', { defaultValue: 'Status' })}
        allStatus={t('finance.filters.allStatus', { defaultValue: 'Todos os status' })}
        openLabel={t('finance.statusOpen', { defaultValue: 'Em aberto' })}
        paidLabel={t('finance.statusPaid', { defaultValue: 'Pago / Recebido' })}
        cancelledLabel={t('finance.statusCancelled', { defaultValue: 'Cancelado' })}
        overdueLabel={t('finance.filters.overdue', { defaultValue: 'Vencidas' })}
      />
    ),
    [filters, t]
  );

  const columns = useMemo<GridColDef<ReceivableRow>[]>(
    () => [
      {
        field: 'customerName',
        headerName: t('finance.customerName', { defaultValue: 'Cliente' }),
        flex: 1,
        minWidth: 180,
        hideable: false,
        valueGetter: (_v, row) => row.customerName || '—',
      },
      {
        field: 'customerDocument',
        headerName: t('customers.fields.document', { defaultValue: 'CPF / CNPJ' }),
        width: 140,
        valueGetter: (_v, row) => row.customerDocument || '—',
      },
      {
        field: 'customerPhone',
        headerName: t('customers.fields.phone', { defaultValue: 'Telefone' }),
        width: 130,
        valueGetter: (_v, row) => row.customerPhone || '—',
      },
      {
        field: 'customerDebt',
        headerName: t('customers.fields.currentDebt', { defaultValue: 'Débito atual' }),
        width: 130,
        renderCell: (params) => (
          <Label
            variant="soft"
            color={params.row.customerDebt > 0 ? 'error' : 'success'}
          >
            {fCurrency(params.row.customerDebt)}
          </Label>
        ),
      },
      {
        field: 'description',
        headerName: t('finance.description', { defaultValue: 'Descrição' }),
        flex: 1,
        minWidth: 160,
      },
      {
        field: 'installment',
        headerName: t('finance.installment', { defaultValue: 'Parcela' }),
        width: 100,
        valueGetter: (_v, row) =>
          row.installmentCount > 1
            ? `${row.installmentIndex}/${row.installmentCount}`
            : '—',
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
          <Label variant="soft" color={params.row.isOverdue ? 'error' : 'default'}>
            {params.row.dueDate || '—'}
          </Label>
        ),
      },
      {
        field: 'status',
        headerName: t('finance.status', { defaultValue: 'Status' }),
        width: 130,
        renderCell: (params) => (
          <Label
            variant="soft"
            color={
              params.row.isOverdue
                ? 'error'
                : params.row.status === 'paid'
                  ? 'success'
                  : params.row.status === 'cancelled'
                    ? 'default'
                    : 'warning'
            }
          >
            {params.row.isOverdue
              ? t('finance.filters.overdue', { defaultValue: 'Vencida' })
              : params.row.status === 'open'
                ? t('finance.statusOpen', { defaultValue: 'Em aberto' })
                : params.row.status === 'paid'
                  ? t('finance.statusPaid', { defaultValue: 'Recebido' })
                  : t('finance.statusCancelled', { defaultValue: 'Cancelado' })}
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
              onClick={() => router.push(paths.dashboard.cash.receivableEdit(params.row.id))}
            >
              <Iconify icon="solar:pen-bold" />
            </IconButton>
            {params.row.status === 'open' && (
              <IconButton
                size="small"
                color="success"
                onClick={() => handleMarkPaid(params.row)}
              >
                <Iconify icon="solar:check-circle-bold" />
              </IconButton>
            )}
          </Stack>
        ),
      },
    ],
    [handleMarkPaid, router, t]
  );

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('finance.receivablesHeading', { defaultValue: 'Contas a receber' })}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.cash', { defaultValue: 'Financeiro' }), href: paths.dashboard.cash.root },
          { name: t('nav.receivables', { defaultValue: 'A receber' }) },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.cash.receivableNew}
            variant="contained"
            startIcon={<Iconify icon="mingcute:add-line" />}
          >
            {t('finance.newReceivable', { defaultValue: 'Nova conta' })}
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
                  title={t('finance.emptyReceivables', { defaultValue: 'Nenhuma conta' })}
                />
              ),
              noResultsOverlay: () => (
                <EmptyContent
                  title={t('finance.emptyReceivables', { defaultValue: 'Nenhuma conta' })}
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

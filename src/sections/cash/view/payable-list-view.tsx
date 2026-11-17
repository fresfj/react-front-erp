import type { GridColDef } from '@mui/x-data-grid';
import type { Payable } from 'src/api/firestore/payables';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import { GridActionsCellItem } from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listPayables, markPayablePaid } from 'src/api/firestore/payables';
import { getOpenCashSession, NoOpenCashSessionError } from 'src/api/firestore/cash-sessions';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'open', label: 'Em aberto' },
  { value: 'overdue', label: 'Vencida' },
  { value: 'paid', label: 'Pago' },
  { value: 'cancelled', label: 'Cancelado' },
];

function isPayableOverdue(p: Payable): boolean {
  if (p.status !== 'open' || !p.dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return p.dueDate < today;
}

// ----------------------------------------------------------------------

export function PayableListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Payable[]>([]);

  const loadPayables = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listPayables(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('finance.payablesLoadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadPayables();
  }, [loadPayables]);

  const dataFiltered = useMemo(() => {
    if (!statusFilter.length) return tableData;
    return tableData.filter((p) => {
      const isOverdue = isPayableOverdue(p);
      if (statusFilter.includes('overdue') && isOverdue) return true;
      return statusFilter.includes(p.status);
    });
  }, [statusFilter, tableData]);

  const handleMarkPaid = useCallback(
    async (row: Payable) => {
      if (!enterpriseId || !user) return;
      try {
        const session = await getOpenCashSession(enterpriseId);
        await markPayablePaid(enterpriseId, row, {
          session,
          createdBy: user.displayName || user.email || 'Operador',
        });
        toast.success(t('finance.payablePaidSuccess'));
        await loadPayables();
      } catch (error) {
        if (error instanceof NoOpenCashSessionError) {
          toast.error(
            'É necessário ter um caixa aberto no sistema para registrar a baixa financeira.'
          );
        } else {
          console.error(error);
          toast.error(getFirebaseErrorMessage(error, t('finance.payablePaidError')));
        }
      }
    },
    [enterpriseId, loadPayables, t, user]
  );

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'status',
      label: t('finance.status', { defaultValue: 'Status' }),
      options: STATUS_OPTIONS,
      value: statusFilter,
      onChange: setStatusFilter,
    },
  ];

  const columns = useMemo<GridColDef<Payable>[]>(
    () => [
      {
        field: 'supplierName',
        headerName: t('finance.supplier', { defaultValue: 'Fornecedor / Favorecido' }),
        flex: 1,
        minWidth: 200,
        hideable: false,
        valueGetter: (_v, r) => r.supplierName || '—',
      },
      {
        field: 'description',
        headerName: t('finance.description', { defaultValue: 'Descrição' }),
        minWidth: 180,
      },
      {
        field: 'category',
        headerName: t('finance.category', { defaultValue: 'Categoria' }),
        width: 130,
        valueGetter: (_v, r) => r.category || '—',
      },
      {
        field: 'amount',
        headerName: t('finance.amount', { defaultValue: 'Valor' }),
        width: 130,
        renderCell: (params) => fCurrency(params.row.amount),
      },
      {
        field: 'dueDate',
        headerName: t('finance.dueDate', { defaultValue: 'Vencimento' }),
        width: 130,
        renderCell: (params) => {
          const overdue = isPayableOverdue(params.row);
          return (
            <Label variant="soft" color={overdue ? 'error' : 'default'}>
              {params.row.dueDate || '—'}
            </Label>
          );
        },
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
            onClick={() => router.push(paths.dashboard.cash.payableEdit(params.row.id))}
          />,
          ...(params.row.status === 'open'
            ? [
                <GridActionsCellItem
                  key="pay"
                  showInMenu
                  icon={<Iconify icon="solar:check-circle-bold" />}
                  label="Marcar como Pago"
                  onClick={() => handleMarkPaid(params.row)}
                  sx={{ color: 'success.main' }}
                />,
              ]
            : []),
        ],
      },
    ],
    [handleMarkPaid, router, t]
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
          <ErpDataGrid<Payable>
            rows={dataFiltered}
            columns={columns}
            loading={loading}
            getRowId={(r) => r.id}
            emptyTitle={t('finance.emptyPayables', { defaultValue: 'Nenhuma conta' })}
            toolbar={{
              selectFilters,
              searchPlaceholder: 'Pesquisar por fornecedor, descrição…',
              filteredResults: dataFiltered.length,
            }}
          />
        </Card>
      )}
    </DashboardContent>
  );
}

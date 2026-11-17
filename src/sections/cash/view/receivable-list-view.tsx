import type { GridColDef } from '@mui/x-data-grid';
import type { Customer } from 'src/api/firestore/customers';
import type { Receivable } from 'src/api/firestore/receivables';
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
import { listCustomers } from 'src/api/firestore/customers';
import {
  listReceivables,
  markReceivablePaid,
  settleCustomerDebtWithSession,
} from 'src/api/firestore/receivables';
import { getOpenCashSession, NoOpenCashSessionError } from 'src/api/firestore/cash-sessions';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ErpDataGrid } from 'src/components/erp-data-grid';
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

const STATUS_OPTIONS = [
  { value: 'open', label: 'Em aberto' },
  { value: 'overdue', label: 'Vencida' },
  { value: 'paid', label: 'Recebido' },
  { value: 'cancelled', label: 'Cancelado' },
];

// ----------------------------------------------------------------------

export function ReceivableListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});

  const loadData = useCallback(async () => {
    if (!enterpriseId) {
      setReceivables([]);
      setCustomers({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [recs, custs] = await Promise.all([
        listReceivables(enterpriseId),
        listCustomers(enterpriseId),
      ]);
      setReceivables(recs);
      const map: Record<string, Customer> = {};
      custs.forEach((c) => {
        map[c.id] = c;
      });
      setCustomers(map);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar contas a receber'));
      setReceivables([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rows: ReceivableRow[] = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    const normalRows: ReceivableRow[] = receivables.map((r) => {
      const cust = r.customerId ? customers[r.customerId] : undefined;
      const isOverdue = r.status === 'open' && Boolean(r.dueDate && r.dueDate < today);
      return {
        ...r,
        customerDocument: cust?.document,
        customerPhone: cust?.phone,
        customerEmail: cust?.email,
        customerDebt: cust?.currentDebt ?? 0,
        isOverdue,
      };
    });

    // Mapear valor em aberto por cliente
    const openAmountsByCust: Record<string, number> = {};
    receivables.forEach((r) => {
      if (r.customerId && r.status === 'open') {
        openAmountsByCust[r.customerId] =
          Math.round(((openAmountsByCust[r.customerId] || 0) + r.amount) * 100) / 100;
      }
    });

    // Adicionar clientes que possuem saldo devedor/fiado não coberto por títulos em aberto
    const syntheticDebtRows: ReceivableRow[] = [];
    Object.values(customers).forEach((cust) => {
      const debt = Number(cust.currentDebt ?? 0);
      if (debt <= 0.001) return;
      const openAmount = openAmountsByCust[cust.id] || 0;
      const uncoveredDebt = Math.round((debt - openAmount) * 100) / 100;
      if (uncoveredDebt > 0.001) {
        syntheticDebtRows.push({
          id: `debt-${cust.id}`,
          description: `Débito / Fiado em Aberto — ${cust.name}`,
          category: 'other',
          amount: uncoveredDebt,
          startDate: cust.createdAt ? cust.createdAt.slice(0, 10) : today,
          dueDate: today,
          customerId: cust.id,
          customerName: cust.name,
          recurrence: 'none',
          status: 'open',
          installmentIndex: 1,
          installmentCount: 1,
          active: true,
          refType: 'customer_debt',
          refId: cust.id,
          createdAt: cust.createdAt || today,
          updatedAt: cust.updatedAt || today,
          customerDocument: cust.document,
          customerPhone: cust.phone,
          customerEmail: cust.email,
          customerDebt: cust.currentDebt,
          isOverdue: false,
        });
      }
    });

    return [...normalRows, ...syntheticDebtRows];
  }, [customers, receivables]);

  const dataFiltered = useMemo(() => {
    if (!statusFilter.length) return rows;
    return rows.filter((r) => {
      if (statusFilter.includes('overdue') && r.isOverdue) return true;
      return statusFilter.includes(r.status);
    });
  }, [rows, statusFilter]);

  const handleMarkPaid = useCallback(
    async (row: ReceivableRow) => {
      if (!enterpriseId || !user) return;
      try {
        const session = await getOpenCashSession(enterpriseId);

        if (row.id.startsWith('debt-')) {
          const cust = row.customerId ? customers[row.customerId] : undefined;
          if (!cust) return;
          await settleCustomerDebtWithSession(enterpriseId, cust, row.amount, {
            session,
            createdBy: user.displayName || user.email || 'Operador',
            description: row.description,
          });
          toast.success(
            t('finance.receivablePaidSuccess', { defaultValue: 'Conta recebida com sucesso!' })
          );
          await loadData();
          return;
        }

        await markReceivablePaid(enterpriseId, row, {
          session,
          customerCurrentDebt: row.customerDebt,
          createdBy: user.displayName || user.email || 'Operador',
        });
        toast.success(
          t('finance.receivablePaidSuccess', { defaultValue: 'Conta recebida com sucesso!' })
        );
        await loadData();
      } catch (error) {
        if (error instanceof NoOpenCashSessionError) {
          toast.error(
            'É necessário ter um caixa aberto no sistema para registrar o recebimento financeiro.'
          );
        } else {
          console.error(error);
          toast.error(getFirebaseErrorMessage(error, 'Erro ao baixar recebimento'));
        }
      }
    },
    [customers, enterpriseId, loadData, t, user]
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

  const columns = useMemo<GridColDef<ReceivableRow>[]>(
    () => [
      {
        field: 'customerName',
        headerName: t('finance.customer', { defaultValue: 'Cliente' }),
        flex: 1,
        minWidth: 200,
        hideable: false,
        valueGetter: (_v, r) => r.customerName || 'Cliente balcão',
      },
      {
        field: 'description',
        headerName: t('finance.description', { defaultValue: 'Descrição' }),
        minWidth: 180,
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
          ...(params.row.id.startsWith('debt-')
            ? [
                <GridActionsCellItem
                  key="view-customer"
                  showInMenu
                  icon={<Iconify icon="solar:user-id-bold" />}
                  label="Ver / Editar Cliente"
                  onClick={() =>
                    router.push(paths.dashboard.customers.edit(params.row.customerId!))
                  }
                />,
              ]
            : [
                <GridActionsCellItem
                  key="edit"
                  showInMenu
                  icon={<Iconify icon="solar:pen-bold" />}
                  label="Editar"
                  onClick={() => router.push(paths.dashboard.cash.receivableEdit(params.row.id))}
                />,
              ]),
          ...(params.row.status === 'open'
            ? [
                <GridActionsCellItem
                  key="pay"
                  showInMenu
                  icon={<Iconify icon="solar:check-circle-bold" />}
                  label="Marcar como Recebido"
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
        heading={t('finance.receivablesTitle', { defaultValue: 'Contas a Receber' })}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.cash', { defaultValue: 'Financeiro' }), href: paths.dashboard.cash.root },
          { name: t('finance.receivablesTitle', { defaultValue: 'Contas a Receber' }) },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.cash.receivableNew}
            variant="contained"
            startIcon={<Iconify icon="mingcute:add-line" />}
          >
            {t('finance.newReceivable', { defaultValue: 'Nova Conta' })}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      {!enterpriseId && (
        <EmptyContent
          filled
          title={t('products.errorMissingEnterprise', {
            defaultValue: 'Empresa não selecionada',
          })}
          sx={{ py: 10 }}
        />
      )}

      {enterpriseId && (
        <Card sx={{ height: 720 }}>
          <ErpDataGrid<ReceivableRow>
            rows={dataFiltered}
            columns={columns}
            loading={loading}
            getRowId={(r) => r.id}
            emptyTitle={t('finance.emptyReceivables', { defaultValue: 'Nenhuma conta' })}
            toolbar={{
              selectFilters,
              searchPlaceholder: 'Pesquisar por cliente, descrição…',
              filteredResults: dataFiltered.length,
            }}
          />
        </Card>
      )}
    </DashboardContent>
  );
}

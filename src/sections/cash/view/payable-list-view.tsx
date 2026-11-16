import type { Payable } from 'src/api/firestore/payables';
import type { GridColDef, GridSlots } from '@mui/x-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import {
  DataGrid,
  GridActionsCellItem,
  GridToolbarExport,
  GridToolbarContainer,
  GridToolbarQuickFilter,
  GridToolbarFilterButton,
  GridToolbarColumnsButton,
} from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

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

function Toolbar() {
  return (
    <GridToolbarContainer>
      <GridToolbarQuickFilter />
      <BoxSpacer />
      <GridToolbarColumnsButton />
      <GridToolbarFilterButton />
      <GridToolbarExport />
    </GridToolbarContainer>
  );
}

function BoxSpacer() {
  return <div style={{ flexGrow: 1 }} />;
}

export function PayableListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [rows, setRows] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      setRows(await listPayables(enterpriseId));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao listar'));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo<GridColDef<Payable>[]>(
    () => [
      { field: 'description', headerName: t('finance.description', { defaultValue: 'Descrição' }), flex: 1, minWidth: 160 },
      {
        field: 'category',
        headerName: t('finance.category', { defaultValue: 'Categoria' }),
        width: 140,
        valueGetter: (_v, row) => t(`finance.categories.${row.category}`, { defaultValue: row.category }),
      },
      {
        field: 'amount',
        headerName: t('finance.amount', { defaultValue: 'Valor' }),
        width: 120,
        valueFormatter: (v) => fCurrency(Number(v) || 0),
      },
      { field: 'dueDate', headerName: t('finance.dueDate', { defaultValue: 'Vencimento' }), width: 120 },
      { field: 'supplierName', headerName: t('finance.supplierName', { defaultValue: 'Fornecedor' }), width: 140 },
      {
        field: 'status',
        headerName: t('finance.status', { defaultValue: 'Status' }),
        width: 120,
        renderCell: (params) => (
          <Label
            variant="soft"
            color={
              params.row.status === 'paid'
                ? 'success'
                : params.row.status === 'cancelled'
                  ? 'default'
                  : 'warning'
            }
          >
            {params.row.status === 'open'
              ? t('finance.statusOpen', { defaultValue: 'Em aberto' })
              : params.row.status === 'paid'
                ? t('finance.statusPaid', { defaultValue: 'Pago' })
                : t('finance.statusCancelled', { defaultValue: 'Cancelado' })}
          </Label>
        ),
      },
      {
        type: 'actions',
        field: 'actions',
        headerName: ' ',
        width: 80,
        getActions: (params) => [
          <GridActionsCellItem
            key="edit"
            showInMenu
            icon={<Iconify icon="solar:pen-bold" />}
            label={t('common.edit', { defaultValue: 'Editar' })}
            onClick={() => router.push(paths.dashboard.cash.payableEdit(params.row.id))}
          />,
          <GridActionsCellItem
            key="paid"
            showInMenu
            icon={<Iconify icon="solar:check-circle-bold" />}
            label={t('finance.markPaid', { defaultValue: 'Marcar pago' })}
            onClick={async () => {
              if (!enterpriseId) return;
              try {
                await updatePayable(enterpriseId, params.row.id, { status: 'paid' });
                toast.success(t('finance.payableUpdateSuccess', { defaultValue: 'Atualizado' }));
                load();
              } catch (error) {
                toast.error(getFirebaseErrorMessage(error, 'Erro'));
              }
            }}
          />,
        ],
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
            {t('finance.newPayable', { defaultValue: 'Nova conta' })}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <Card sx={{ height: 720 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(r) => r.id}
          slots={{
            toolbar: Toolbar as GridSlots['toolbar'],
            noRowsOverlay: () => <EmptyContent title={t('finance.emptyPayables', { defaultValue: 'Nenhuma conta' })} />,
          }}
        />
      </Card>
    </DashboardContent>
  );
}

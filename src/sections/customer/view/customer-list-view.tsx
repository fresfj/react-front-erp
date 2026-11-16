import type { Customer } from 'src/api/firestore/customers';
import type { GridColDef, GridSlots } from '@mui/x-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
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

import { useBoolean } from 'src/hooks/use-boolean';
import { useSetState } from 'src/hooks/use-set-state';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  listCustomers,
  deactivateCustomer,
  settleCustomerDebt,
} from 'src/api/firestore/customers';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type CustomerFilters = {
  active: '' | 'active' | 'inactive' | 'with_debt';
};

type ToolbarProps = {
  filters: ReturnType<typeof useSetState<CustomerFilters>>;
  activeLabel: string;
  allStatus: string;
  activeOnly: string;
  inactiveOnly: string;
  withDebtOnly: string;
};

function CustomerToolbar({
  filters,
  activeLabel,
  allStatus,
  activeOnly,
  inactiveOnly,
  withDebtOnly,
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
          label={activeLabel}
          value={filters.state.active}
          onChange={(e) =>
            filters.setState({ active: e.target.value as CustomerFilters['active'] })
          }
          sx={{ minWidth: { md: 180 } }}
        >
          <MenuItem value="">{allStatus}</MenuItem>
          <MenuItem value="with_debt">{withDebtOnly}</MenuItem>
          <MenuItem value="active">{activeOnly}</MenuItem>
          <MenuItem value="inactive">{inactiveOnly}</MenuItem>
        </TextField>

        <Stack
          direction="row"
          spacing={1}
          flexGrow={1}
          justifyContent="flex-end"
          alignItems="center"
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

// ----------------------------------------------------------------------

export function CustomerListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();
  const confirm = useBoolean();
  const settleDialog = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const filters = useSetState<CustomerFilters>({ active: '' });
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Customer[]>([]);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [settleTarget, setSettleTarget] = useState<Customer | null>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);

  const loadCustomers = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listCustomers(enterpriseId);
      setTableData(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar clientes'));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const dataFiltered = useMemo(() => {
    let rows = tableData;
    if (filters.state.active === 'with_debt') {
      rows = rows.filter((r) => r.currentDebt > 0);
    }
    if (filters.state.active === 'active') {
      rows = rows.filter((r) => r.active);
    }
    if (filters.state.active === 'inactive') {
      rows = rows.filter((r) => !r.active);
    }
    return rows;
  }, [filters.state.active, tableData]);

  const handleConfirmDeactivate = useCallback(async () => {
    if (!enterpriseId || !deactivateId) return;
    try {
      await deactivateCustomer(enterpriseId, deactivateId);
      toast.success(t('customers.deactivateSuccess', { defaultValue: 'Cliente desativado' }));
      setDeactivateId(null);
      confirm.onFalse();
      await loadCustomers();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao desativar cliente'));
    }
  }, [confirm, deactivateId, enterpriseId, loadCustomers, t]);

  const handleConfirmSettle = useCallback(async () => {
    if (!enterpriseId || !settleTarget || settleAmount <= 0) return;
    try {
      await settleCustomerDebt(enterpriseId, settleTarget, settleAmount);
      toast.success(
        t('customers.settleSuccess', { defaultValue: 'Pagamento de débito registrado!' })
      );
      setSettleTarget(null);
      settleDialog.onFalse();
      await loadCustomers();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao baixar débito'));
    }
  }, [enterpriseId, loadCustomers, settleAmount, settleDialog, settleTarget, t]);

  const CustomToolbar = useCallback(
    () => (
      <CustomerToolbar
        filters={filters}
        activeLabel={t('customers.fields.active', { defaultValue: 'Status' })}
        allStatus={t('suppliers.filters.allStatus')}
        activeOnly={t('suppliers.filters.activeOnly')}
        inactiveOnly={t('suppliers.filters.inactiveOnly')}
        withDebtOnly={t('customers.filters.withDebt', { defaultValue: 'Com débito em aberto' })}
      />
    ),
    [filters, t]
  );

  const columns = useMemo<GridColDef<Customer>[]>(
    () => [
      {
        field: 'name',
        headerName: t('customers.fields.name', { defaultValue: 'Nome' }),
        flex: 1,
        minWidth: 200,
        hideable: false,
      },
      {
        field: 'document',
        headerName: t('customers.fields.document', { defaultValue: 'CPF / CNPJ' }),
        width: 150,
        valueGetter: (_v, row) => row.document || '—',
      },
      {
        field: 'phone',
        headerName: t('customers.fields.phone', { defaultValue: 'Telefone' }),
        width: 150,
        valueGetter: (_v, row) => row.phone || '—',
      },
      {
        field: 'email',
        headerName: t('customers.fields.email', { defaultValue: 'E-mail' }),
        width: 200,
        valueGetter: (_v, row) => row.email || '—',
      },
      {
        field: 'currentDebt',
        headerName: t('customers.fields.currentDebt', { defaultValue: 'Débito atual' }),
        width: 150,
        renderCell: (params) => (
          <Label
            color={params.row.currentDebt > 0 ? 'error' : 'success'}
            variant="soft"
          >
            {fCurrency(params.row.currentDebt)}
          </Label>
        ),
      },
      {
        field: 'active',
        headerName: t('customers.fields.active', { defaultValue: 'Status' }),
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
        field: 'actions',
        headerName: ' ',
        width: 130,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => (
          <Stack direction="row" spacing={0.5}>
            {params.row.currentDebt > 0 && (
              <IconButton
                size="small"
                color="success"
                title={t('customers.settleDebt', { defaultValue: 'Receber / Baixar Débito' })}
                onClick={() => {
                  setSettleTarget(params.row);
                  setSettleAmount(params.row.currentDebt);
                  settleDialog.onTrue();
                }}
              >
                <Iconify icon="solar:dollar-minimalistic-bold" />
              </IconButton>
            )}
            <IconButton
              size="small"
              onClick={() => router.push(paths.dashboard.customers.edit(params.row.id))}
            >
              <Iconify icon="solar:pen-bold" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                setDeactivateId(params.row.id);
                confirm.onTrue();
              }}
            >
              <Iconify icon="solar:trash-bin-trash-bold" />
            </IconButton>
          </Stack>
        ),
      },
    ],
    [confirm, router, settleDialog, t]
  );

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('customers.listHeading', { defaultValue: 'Clientes e Rastreabilidade' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            {
              name: t('nav.customers', { defaultValue: 'Clientes' }),
              href: paths.dashboard.customers.root,
            },
            { name: t('customers.listHeading', { defaultValue: 'Lista de clientes' }) },
          ]}
          action={
            <Button
              component={RouterLink}
              href={paths.dashboard.customers.create}
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
            >
              {t('customers.newCustomer', { defaultValue: 'Novo cliente' })}
            </Button>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent filled title="Empresa não configurada na sessão" sx={{ py: 10 }} />
        )}

        {enterpriseId && (
          <Card sx={{ height: 720 }}>
            <DataGrid
              rows={dataFiltered}
              columns={columns}
              loading={loading}
              getRowId={(row) => row.id}
              pageSizeOptions={[5, 10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              slots={{
                toolbar: CustomToolbar as GridSlots['toolbar'],
                noRowsOverlay: () => (
                  <EmptyContent
                    title={t('customers.empty', { defaultValue: 'Nenhum cliente encontrado' })}
                  />
                ),
                noResultsOverlay: () => (
                  <EmptyContent
                    title={t('customers.empty', { defaultValue: 'Nenhum cliente encontrado' })}
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

      <Dialog open={settleDialog.value} onClose={settleDialog.onFalse} fullWidth maxWidth="xs">
        <DialogTitle>
          {t('customers.settleDebt', { defaultValue: 'Baixar Débito de Cliente' })}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              disabled
              label={t('customers.fields.name', { defaultValue: 'Cliente' })}
              value={settleTarget?.name || ''}
            />
            <TextField
              type="number"
              label={t('customers.settleAmount', { defaultValue: 'Valor recebido (R$)' })}
              value={settleAmount}
              onChange={(e) => setSettleAmount(Math.max(0, Number(e.target.value)))}
              inputProps={{ min: 0.01, step: 'any' }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={settleDialog.onFalse}>
            Cancelar
          </Button>
          <Button variant="contained" color="success" onClick={handleConfirmSettle}>
            Confirmar recebimento
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirm.value}
        onClose={() => {
          setDeactivateId(null);
          confirm.onFalse();
        }}
        title={t('customers.deactivate', { defaultValue: 'Desativar cliente' })}
        content={t('customers.deactivateConfirm', {
          defaultValue: 'Tem certeza de que deseja desativar este cliente?',
        })}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivate}>
            {t('customers.deactivate', { defaultValue: 'Desativar' })}
          </Button>
        }
      />
    </>
  );
}

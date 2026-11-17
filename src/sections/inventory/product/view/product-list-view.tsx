import type { Product } from 'src/api/firestore/products';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';
import type {
  GridColDef,
  GridRowSelectionModel,
  GridColumnVisibilityModel,
} from '@mui/x-data-grid';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import { GridActionsCellItem } from '@mui/x-data-grid';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { seedDemoErpCatalog } from 'src/api/firestore/seed-demo';
import { listProducts, deactivateProduct } from 'src/api/firestore/products';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import {
  RenderCellStock,
  RenderCellPrice,
  RenderCellPublish,
  RenderCellProduct,
  RenderCellCreatedAt,
} from '../product-table-row';

// ----------------------------------------------------------------------

const TYPE_OPTIONS = [
  { value: 'raw', label: 'Matéria-prima' },
  { value: 'finished', label: 'Produto Acabado' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];

const HIDE_COLUMNS: GridColumnVisibilityModel = { ean: false };

// ----------------------------------------------------------------------

export function ProductListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();

  const confirmSingle = useBoolean();
  const confirmMultiple = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState<Product[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<GridRowSelectionModel>([]);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [columnVisibilityModel, setColumnVisibilityModel] =
    useState<GridColumnVisibilityModel>(HIDE_COLUMNS);

  const loadProducts = useCallback(async () => {
    if (!enterpriseId) {
      setTableData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setTableData(await listProducts(enterpriseId));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('products.loadError')));
      setTableData([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const dataFiltered = useMemo(() => {
    let rows = tableData;
    if (typeFilter.length) rows = rows.filter((row) => typeFilter.includes(row.type));
    if (statusFilter.length) {
      rows = rows.filter((row) => statusFilter.includes(row.active ? 'active' : 'inactive'));
    }
    return rows;
  }, [statusFilter, tableData, typeFilter]);

  const handleEditRow = useCallback(
    (id: string) => router.push(paths.dashboard.products.edit(id)),
    [router]
  );

  const handleAskDeactivate = useCallback(
    (id: string) => {
      setDeactivateId(id);
      confirmSingle.onTrue();
    },
    [confirmSingle]
  );

  const handleConfirmDeactivateSingle = useCallback(async () => {
    if (!enterpriseId || !deactivateId) return;
    try {
      await deactivateProduct(enterpriseId, deactivateId);
      toast.success(
        t('products.deactivateSuccess', { defaultValue: 'Produto desativado com sucesso!' })
      );
      setDeactivateId(null);
      confirmSingle.onFalse();
      await loadProducts();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('products.deactivateError')));
    }
  }, [confirmSingle, deactivateId, enterpriseId, loadProducts, t]);

  const handleConfirmDeactivateMultiple = useCallback(async () => {
    if (!enterpriseId || !selectedRowIds.length) return;
    try {
      await Promise.all(selectedRowIds.map((id) => deactivateProduct(enterpriseId, String(id))));
      toast.success(`${selectedRowIds.length} produtos desativados com sucesso!`);
      setSelectedRowIds([]);
      confirmMultiple.onFalse();
      await loadProducts();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao desativar produtos selecionados'));
    }
  }, [confirmMultiple, enterpriseId, loadProducts, selectedRowIds]);

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'type',
      label: t('products.fields.type', { defaultValue: 'Tipo' }),
      options: TYPE_OPTIONS,
      value: typeFilter,
      onChange: setTypeFilter,
    },
    {
      id: 'status',
      label: t('products.fields.active', { defaultValue: 'Status' }),
      options: STATUS_OPTIONS,
      value: statusFilter,
      onChange: setStatusFilter,
    },
  ];

  const columns = useMemo<GridColDef<Product>[]>(
    () => [
      {
        field: 'name',
        headerName: t('products.fields.name', { defaultValue: 'Produto' }),
        flex: 1,
        minWidth: 280,
        hideable: false,
        renderCell: (params) => (
          <RenderCellProduct params={params} onViewRow={() => handleEditRow(params.row.id)} />
        ),
      },
      {
        field: 'type',
        headerName: t('products.fields.type', { defaultValue: 'Tipo' }),
        width: 150,
        renderCell: (params) => (
          <Label variant="soft" color={params.row.type === 'finished' ? 'primary' : 'warning'}>
            {params.row.type === 'finished' ? 'Produto Acabado' : 'Matéria-prima'}
          </Label>
        ),
      },
      {
        field: 'ean',
        headerName: 'EAN-13',
        width: 140,
        valueGetter: (_v, row) => row.ean || '—',
      },
      {
        field: 'category',
        headerName: 'Categoria',
        width: 150,
        valueGetter: (_v, row) => row.category || '—',
      },
      {
        field: 'stock',
        headerName: 'Estoque Mín.',
        width: 140,
        renderCell: (params) => <RenderCellStock params={params} />,
      },
      {
        field: 'price',
        headerName: t('products.fields.salePrice', { defaultValue: 'Preço Venda' }),
        width: 140,
        renderCell: (params) => <RenderCellPrice params={params} />,
      },
      {
        field: 'active',
        headerName: t('products.fields.active', { defaultValue: 'Status' }),
        width: 110,
        renderCell: (params) => <RenderCellPublish params={params} />,
      },
      {
        field: 'createdAt',
        headerName: t('products.fields.createdAt', { defaultValue: 'Criado em' }),
        width: 150,
        renderCell: (params) => <RenderCellCreatedAt params={params} />,
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
          <GridActionsCellItem
            key="delete"
            showInMenu
            icon={<Iconify icon="solar:trash-bin-trash-bold" />}
            label="Excluir"
            onClick={() => handleAskDeactivate(params.row.id)}
            sx={{ color: 'error.main' }}
          />,
        ],
      },
    ],
    [handleAskDeactivate, handleEditRow, t]
  );

  return (
    <>
      <DashboardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <CustomBreadcrumbs
          heading={t('products.listHeading', { defaultValue: 'Lista de Produtos' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.products'), href: paths.dashboard.products.root },
            { name: t('products.listHeading', { defaultValue: 'Lista de Produtos' }) },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="soft"
                color="info"
                startIcon={<Iconify icon="solar:magic-stick-3-bold" />}
                onClick={async () => {
                  if (!enterpriseId) return;
                  try {
                    await seedDemoErpCatalog(enterpriseId);
                    toast.success('Produtos, Fornecedor e Lotes de teste carregados com sucesso!');
                    await loadProducts();
                  } catch (error) {
                    toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar produtos demo'));
                  }
                }}
              >
                Produtos de Teste
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.products.create}
                variant="contained"
                startIcon={<Iconify icon="mingcute:add-line" />}
              >
                {t('products.newProduct', { defaultValue: 'Novo produto' })}
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent
            filled
            title={t('products.errorMissingEnterprise', { defaultValue: 'Empresa não selecionada' })}
            sx={{ py: 10 }}
          />
        )}

        {enterpriseId && (
          <Card
            sx={{
              flexGrow: { md: 1 },
              display: { md: 'flex' },
              height: { xs: 800, md: 2 },
              flexDirection: { md: 'column' },
            }}
          >
            <ErpDataGrid<Product>
              checkboxSelection
              rows={dataFiltered}
              columns={columns}
              loading={loading}
              getRowId={(row) => row.id}
              getRowHeight={() => 'auto'}
              rowSelectionModel={selectedRowIds}
              onRowSelectionModelChange={setSelectedRowIds}
              columnVisibilityModel={columnVisibilityModel}
              onColumnVisibilityModelChange={setColumnVisibilityModel}
              nonTogglableFields={['name', 'actions']}
              emptyTitle={t('products.empty', { defaultValue: 'Nenhum produto encontrado' })}
              toolbar={{
                selectFilters,
                searchPlaceholder: 'Pesquisar produto, SKU ou EAN…',
                filteredResults: dataFiltered.length,
                selectedCount: selectedRowIds.length,
                onDeleteSelected: confirmMultiple.onTrue,
              }}
            />
          </Card>
        )}
      </DashboardContent>

      <ConfirmDialog
        open={confirmSingle.value}
        onClose={() => {
          setDeactivateId(null);
          confirmSingle.onFalse();
        }}
        title="Desativar Produto"
        content="Tem certeza de que deseja desativar este produto? Ele não aparecerá mais como ativo no PDV."
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivateSingle}>
            Desativar
          </Button>
        }
      />

      <ConfirmDialog
        open={confirmMultiple.value}
        onClose={confirmMultiple.onFalse}
        title="Desativar Produtos Selecionados"
        content={`Tem certeza de que deseja desativar ${selectedRowIds.length} produtos selecionados?`}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivateMultiple}>
            Desativar Todos
          </Button>
        }
      />
    </>
  );
}

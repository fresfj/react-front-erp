import type { GridSlots, DataGridProps, GridValidRowModel } from '@mui/x-data-grid';

import { useState } from 'react';

import { DataGrid, gridClasses } from '@mui/x-data-grid';

import { EmptyContent } from 'src/components/empty-content';

import { ErpGridToolbar } from './erp-grid-toolbar';

import type { ErpGridToolbarProps } from './erp-grid-toolbar';

// ----------------------------------------------------------------------

function NoRowsOverlay({ title }: { title?: string }) {
  return <EmptyContent title={title ?? 'Nenhum registro encontrado'} />;
}

function NoResultsOverlay({ title }: { title?: string }) {
  return <EmptyContent title={title ?? 'Nenhum resultado para a busca'} />;
}

export type ErpDataGridProps<R extends GridValidRowModel> = Omit<
  DataGridProps<R>,
  'slots' | 'slotProps'
> & {
  toolbar?: Omit<ErpGridToolbarProps, 'setFilterButtonEl'>;
  emptyTitle?: string;
  noResultsTitle?: string;
  /** Campos que não aparecem no painel "Colunas" (ex.: coluna principal e ações). */
  nonTogglableFields?: string[];
};

/**
 * DataGrid padrão das listas ERP (Minimals v6):
 * toolbar com filtros multi-select + busca full-width, botões Colunas/Filtros/Exportar,
 * painel ancorado no botão de filtro e overlays traduzidos.
 * Use dentro de `<Card sx={{ height: 720 }}>` (ou flex column) conforme `docs/reference/erp-crud-ui.md`.
 */
export function ErpDataGrid<R extends GridValidRowModel>({
  toolbar,
  emptyTitle,
  noResultsTitle,
  nonTogglableFields = ['actions'],
  columns,
  sx,
  ...other
}: ErpDataGridProps<R>) {
  const [filterButtonEl, setFilterButtonEl] = useState<HTMLButtonElement | null>(null);

  const getTogglableColumns = () =>
    columns.filter((c) => !nonTogglableFields.includes(c.field)).map((c) => c.field);

  return (
    <DataGrid<R>
      disableRowSelectionOnClick
      pageSizeOptions={[5, 10, 25, 50]}
      initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
      {...other}
      columns={columns}
      slots={{
        toolbar: ErpGridToolbar as GridSlots['toolbar'],
        noRowsOverlay: NoRowsOverlay as GridSlots['noRowsOverlay'],
        noResultsOverlay: NoResultsOverlay as GridSlots['noResultsOverlay'],
      }}
      slotProps={{
        panel: { anchorEl: filterButtonEl },
        toolbar: { ...toolbar, setFilterButtonEl } as object,
        noRowsOverlay: { title: emptyTitle } as object,
        noResultsOverlay: { title: noResultsTitle } as object,
        columnsManagement: { getTogglableColumns },
      }}
      sx={{
        border: 0,
        [`& .${gridClasses.cell}`]: { alignItems: 'center', display: 'inline-flex' },
        ...sx,
      }}
    />
  );
}

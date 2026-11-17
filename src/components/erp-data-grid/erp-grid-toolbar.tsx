import type { ReactNode } from 'react';
import type { SelectChangeEvent } from '@mui/material/Select';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import OutlinedInput from '@mui/material/OutlinedInput';
import {
  GridToolbarExport,
  GridToolbarContainer,
  GridToolbarQuickFilter,
  GridToolbarFilterButton,
  GridToolbarColumnsButton,
} from '@mui/x-data-grid';

import { Iconify } from 'src/components/iconify';
import { chipProps, FiltersBlock, FiltersResult } from 'src/components/filters-result';

// ----------------------------------------------------------------------

export type ErpGridFilterOption = { value: string; label: string };

/** Filtro multi-select padrão Minimals (FormControl md:200 + checkbox). */
export type ErpGridSelectFilter = {
  id: string;
  label: string;
  options: ErpGridFilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
};

export type ErpGridToolbarProps = {
  selectFilters?: ErpGridSelectFilter[];
  searchPlaceholder?: string;
  /** Ações extras à direita (antes de Colunas/Filtros/Exportar). */
  actions?: ReactNode;
  selectedCount?: number;
  onDeleteSelected?: () => void;
  deleteLabel?: string;
  /** Total após filtros, exibido no bloco de chips. */
  filteredResults?: number;
  hideExport?: boolean;
  setFilterButtonEl?: React.Dispatch<React.SetStateAction<HTMLButtonElement | null>>;
};

// ----------------------------------------------------------------------

export function ErpSelectFilter({ id, label, options, value, onChange }: ErpGridSelectFilter) {
  const inputId = `filter-${id}-select`;

  const handleChange = (event: SelectChangeEvent<string[]>) => {
    const raw = event.target.value;
    onChange(typeof raw === 'string' ? raw.split(',') : raw);
  };

  return (
    <FormControl sx={{ flexShrink: 0, width: { xs: 1, md: 160 } }}>
      <InputLabel htmlFor={inputId}>{label}</InputLabel>
      <Select
        multiple
        value={value}
        onChange={handleChange}
        input={<OutlinedInput label={label} />}
        renderValue={(selected) =>
          selected.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ')
        }
        inputProps={{ id: inputId }}
        MenuProps={{ PaperProps: { sx: { maxHeight: 280 } } }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            <Checkbox disableRipple size="small" checked={value.includes(option.value)} />
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

// ----------------------------------------------------------------------

/**
 * Toolbar padrão das listas ERP (referência minimals.cc/dashboard/product).
 * Deve ser usado como slot estável: `slots.toolbar = ErpGridToolbar` e props via `slotProps.toolbar`.
 * NUNCA quebra em duas linhas no desktop: lado esquerdo (selects + search) e lado direito (botões).
 */
export function ErpGridToolbar({
  selectFilters = [],
  searchPlaceholder = 'Pesquisar…',
  actions,
  selectedCount = 0,
  onDeleteSelected,
  deleteLabel = 'Excluir',
  filteredResults,
  hideExport,
  setFilterButtonEl,
}: ErpGridToolbarProps) {
  const activeFilters = selectFilters.filter((f) => f.value.length > 0);
  const canReset = activeFilters.length > 0;

  return (
    <>
      <GridToolbarContainer
        sx={{
          p: 2.5,
          gap: 2,
          width: 1,
          display: 'flex',
          flexWrap: 'nowrap',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-end', md: 'center' },
          justifyContent: 'space-between',
        }}
      >
        {/* Lado esquerdo: selects de filtro + quick search (mesma linha) */}
        <Box
          sx={{
            gap: 2,
            minWidth: 0,
            flexGrow: 1,
            display: 'flex',
            alignItems: 'center',
            width: { xs: 1, md: 'auto' },
            flexDirection: { xs: 'column', md: 'row' },
          }}
        >
          {selectFilters.map((filter) => (
            <ErpSelectFilter key={filter.id} {...filter} />
          ))}

          <Box
            sx={{
              minWidth: { md: 180 },
              flexGrow: 1,
              width: { xs: 1, md: 'auto' },
              display: 'flex',
            }}
          >
            <GridToolbarQuickFilter
              placeholder={searchPlaceholder}
              debounceMs={250}
              sx={{ width: 1 }}
            />
          </Box>
        </Box>

        {/* Lado direito: botões de ação e exportação (mesma linha) */}
        <Box
          sx={{
            gap: 1,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            width: { xs: 1, md: 'auto' },
          }}
        >
          {!!selectedCount && onDeleteSelected && (
            <Button
              size="small"
              color="error"
              startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
              onClick={onDeleteSelected}
            >
              {deleteLabel} ({selectedCount})
            </Button>
          )}

          {actions}

          <GridToolbarColumnsButton />
          <GridToolbarFilterButton ref={setFilterButtonEl} />
          {!hideExport && <GridToolbarExport />}
        </Box>
      </GridToolbarContainer>

      {canReset && (
        <FiltersResult
          totalResults={filteredResults ?? 0}
          onReset={() => selectFilters.forEach((f) => f.onChange([]))}
          sx={{ px: 2.5, pb: 2.5 }}
        >
          {selectFilters.map((filter) => (
            <FiltersBlock key={filter.id} label={`${filter.label}:`} isShow={!!filter.value.length}>
              {filter.value.map((v) => (
                <Chip
                  {...chipProps}
                  key={v}
                  label={filter.options.find((o) => o.value === v)?.label ?? v}
                  onDelete={() => filter.onChange(filter.value.filter((item) => item !== v))}
                />
              ))}
            </FiltersBlock>
          ))}
        </FiltersResult>
      )}
    </>
  );
}

import type { SelectChangeEvent } from '@mui/material/Select';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import Badge from '@mui/material/Badge';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import Divider from '@mui/material/Divider';
import Popover from '@mui/material/Popover';
import SvgIcon from '@mui/material/SvgIcon';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import OutlinedInput from '@mui/material/OutlinedInput';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';

import { useTranslate } from 'src/locales';

import { Iconify } from 'src/components/iconify';
import { chipProps, FiltersBlock, FiltersResult } from 'src/components/filters-result';

// ----------------------------------------------------------------------

export type ErpToolbarOption = {
  value: string;
  label: string;
};

export type ErpToolbarSelectFilter = {
  id: string;
  label: string;
  options: ErpToolbarOption[];
  value: string[];
  onChange: (next: string[]) => void;
};

export type ErpTableColumnDef = {
  id: string;
  label: string;
  hideable?: boolean;
};

export type ErpTableToolbarProps = {
  searchQuery: string;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  searchPlaceholder?: string;
  onResetPage?: () => void;
  selectFilters?: ErpToolbarSelectFilter[];
  columns?: ErpTableColumnDef[];
  visibleColumns?: Record<string, boolean>;
  onToggleColumn?: (colId: string) => void;
  onResetColumns?: () => void;
  onExportCsv?: () => void;
  onPrint?: () => void;
  filteredResults?: number;
};

export function ErpTableToolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  onResetPage,
  selectFilters = [],
  columns = [],
  visibleColumns = {},
  onToggleColumn,
  onResetColumns,
  onExportCsv,
  onPrint,
  filteredResults = 0,
}: ErpTableToolbarProps) {
  const { t } = useTranslate('common');

  const [columnsAnchorEl, setColumnsAnchorEl] = useState<HTMLElement | null>(null);
  const [filtersAnchorEl, setFiltersAnchorEl] = useState<HTMLElement | null>(null);
  const [exportAnchorEl, setExportAnchorEl] = useState<HTMLElement | null>(null);
  const [columnSearch, setColumnSearch] = useState('');

  const handleSelectChange = (
    filter: ErpToolbarSelectFilter,
    event: SelectChangeEvent<string[]>
  ) => {
    const raw = event.target.value;
    onResetPage?.();
    filter.onChange(typeof raw === 'string' ? raw.split(',') : raw);
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) || selectFilters.some((f) => f.value.length > 0);

  const handleResetAllFilters = () => {
    onResetPage?.();
    selectFilters.forEach((f) => f.onChange([]));
    onSearchChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
  };

  const togglableColumns = columns.filter(
    (c) => c.id && c.id !== 'actions' && c.hideable !== false && c.label
  );

  const filteredColumns = togglableColumns.filter((c) =>
    c.label.toLowerCase().includes(columnSearch.toLowerCase().trim())
  );

  return (
    <>
      <Stack
        spacing={2}
        alignItems={{ xs: 'flex-end', md: 'center' }}
        direction={{ xs: 'column', md: 'row' }}
        sx={{
          p: 2.5,
          width: 1,
          justifyContent: 'space-between',
        }}
      >
        {/* Lado esquerdo: Multi-Select Filters + Search */}
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems="center"
          spacing={2}
          sx={{ width: 1, flexGrow: 1 }}
        >
          {selectFilters.map((filter) => (
            <FormControl key={filter.id} sx={{ flexShrink: 0, width: { xs: 1, md: 190 } }}>
              <InputLabel htmlFor={`erp-filter-${filter.id}`}>{filter.label}</InputLabel>
              <Select
                multiple
                value={filter.value}
                onChange={(e) => handleSelectChange(filter, e)}
                input={<OutlinedInput label={filter.label} />}
                renderValue={(selected) =>
                  selected
                    .map((v) => filter.options.find((o) => o.value === v)?.label ?? v)
                    .join(', ')
                }
                inputProps={{ id: `erp-filter-${filter.id}` }}
                MenuProps={{ PaperProps: { sx: { maxHeight: 260 } } }}
              >
                {filter.options.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    <Checkbox
                      disableRipple
                      size="small"
                      checked={filter.value.includes(option.value)}
                    />
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ))}

          <TextField
            fullWidth
            value={searchQuery}
            onChange={(e) => {
              onResetPage?.();
              onSearchChange(e);
            }}
            placeholder={
              searchPlaceholder ||
              t('pos.toolbar.searchPlaceholder', {
                defaultValue: 'Pesquisar…',
              })
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
                </InputAdornment>
              ),
            }}
          />
        </Stack>

        {/* Lado direito: Columns, Filters, Export */}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="flex-end"
          sx={{ flexShrink: 0 }}
        >
          <Button
            size="small"
            color="inherit"
            disableElevation
            aria-haspopup="true"
            aria-label={t('pos.toolbar.columns', { defaultValue: 'Colunas' })}
            onClick={(e) => setColumnsAnchorEl(e.currentTarget)}
            startIcon={
              <SvgIcon fontSize="medium" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M15 4H9v16h6zm2 16h3a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3zM4 4h3v16H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2"
                  clipRule="evenodd"
                />
              </SvgIcon>
            }
          >
            {t('pos.toolbar.columns', { defaultValue: 'Colunas' })}
          </Button>

          <Button
            size="small"
            color="inherit"
            disableElevation
            aria-haspopup="true"
            aria-label={t('pos.toolbar.filters', { defaultValue: 'Filtros' })}
            onClick={(e) => setFiltersAnchorEl(e.currentTarget)}
            startIcon={
              <Badge color="error" variant="dot" invisible={!hasActiveFilters}>
                <SvgIcon fontSize="medium" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5v2.086A2 2 0 0 1 20.414 8L15 13.414v7.424a1.1 1.1 0 0 1-1.592.984l-3.717-1.858A1.25 1.25 0 0 1 9 18.846v-5.432L3.586 8A2 2 0 0 1 3 6.586z"
                  />
                </SvgIcon>
              </Badge>
            }
          >
            {t('pos.toolbar.filters', { defaultValue: 'Filtros' })}
          </Button>

          <Button
            id="export-menu-trigger"
            aria-controls={exportAnchorEl ? 'export-menu' : undefined}
            aria-haspopup="true"
            aria-label={t('pos.toolbar.export', { defaultValue: 'Exportar' })}
            size="small"
            color="inherit"
            disableElevation
            onClick={(e) => setExportAnchorEl(e.currentTarget)}
            startIcon={
              <SvgIcon fontSize="medium" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M12 1.25a.75.75 0 0 0-.75.75v10.973l-1.68-1.961a.75.75 0 1 0-1.14.976l3 3.5a.75.75 0 0 0 1.14 0l3-3.5a.75.75 0 1 0-1.14-.976l-1.68 1.96V2a.75.75 0 0 0-.75-.75"
                  clipRule="evenodd"
                />
                <path
                  fill="currentColor"
                  d="M14.25 9v.378a2.249 2.249 0 0 1 2.458 3.586l-3 3.5a2.25 2.25 0 0 1-3.416 0l-3-3.5A2.25 2.25 0 0 1 9.75 9.378V9H8c-2.828 0-4.243 0-5.121.879C2 10.757 2 12.172 2 15v1c0 2.828 0 4.243.879 5.121C3.757 22 5.172 22 8 22h8c2.828 0 4.243 0 5.121-.879C22 20.243 22 18.828 22 16v-1c0-2.828 0-4.243-.879-5.121C20.243 9 18.828 9 16 9z"
                />
              </SvgIcon>
            }
          >
            {t('pos.toolbar.export', { defaultValue: 'Exportar' })}
          </Button>
        </Stack>
      </Stack>

      {/* Barra de resultados e chips de filtros ativos */}
      {hasActiveFilters && (
        <FiltersResult
          totalResults={filteredResults}
          onReset={handleResetAllFilters}
          sx={{ p: 2.5, pt: 0 }}
        >
          {selectFilters.map((filter) => (
            <FiltersBlock
              key={filter.id}
              label={`${filter.label}:`}
              isShow={filter.value.length > 0}
            >
              {filter.value.map((v) => (
                <Chip
                  {...chipProps}
                  key={v}
                  label={filter.options.find((o) => o.value === v)?.label ?? v}
                  onDelete={() => {
                    onResetPage?.();
                    filter.onChange(filter.value.filter((item) => item !== v));
                  }}
                />
              ))}
            </FiltersBlock>
          ))}

          <FiltersBlock
            label={`${t('pos.toolbar.searchChipLabel', { defaultValue: 'Busca' })}:`}
            isShow={Boolean(searchQuery.trim())}
          >
            <Chip
              {...chipProps}
              label={searchQuery}
              onDelete={() => {
                onResetPage?.();
                onSearchChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
              }}
            />
          </FiltersBlock>
        </FiltersResult>
      )}

      {/* Popover: Columns */}
      <Popover
        open={Boolean(columnsAnchorEl)}
        anchorEl={columnsAnchorEl}
        onClose={() => setColumnsAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 260, p: 2 } } }}
      >
        <TextField
          fullWidth
          size="small"
          value={columnSearch}
          onChange={(e) => setColumnSearch(e.target.value)}
          placeholder={t('pos.toolbar.searchColumn', { defaultValue: 'Buscar coluna...' })}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1.5 }}
        />

        <Stack spacing={0.5} sx={{ maxHeight: 240, overflowY: 'auto' }}>
          {filteredColumns.map((col) => (
            <FormControlLabel
              key={col.id}
              label={col.label}
              control={
                <Checkbox
                  size="small"
                  checked={visibleColumns[col.id] !== false}
                  onChange={() => onToggleColumn?.(col.id)}
                />
              }
            />
          ))}
        </Stack>

        <Divider sx={{ borderStyle: 'dashed', my: 1.5 }} />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="small" color="inherit" onClick={onResetColumns}>
            {t('pos.toolbar.resetColumns', { defaultValue: 'Restaurar padrão' })}
          </Button>
        </Box>
      </Popover>

      {/* Popover: Filters */}
      <Popover
        open={Boolean(filtersAnchorEl)}
        anchorEl={filtersAnchorEl}
        onClose={() => setFiltersAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 320, p: 2.5 } } }}
      >
        <Typography variant="subtitle2" sx={{ mb: 2 }}>
          {t('pos.toolbar.advancedFilters', { defaultValue: 'Filtros Avançados' })}
        </Typography>

        <Stack spacing={2}>
          {selectFilters.map((filter) => (
            <FormControl key={filter.id} fullWidth size="small">
              <InputLabel htmlFor={`popover-filter-${filter.id}`}>{filter.label}</InputLabel>
              <Select
                multiple
                value={filter.value}
                onChange={(e) => handleSelectChange(filter, e)}
                input={<OutlinedInput label={filter.label} />}
                renderValue={(selected) =>
                  selected
                    .map((v) => filter.options.find((o) => o.value === v)?.label ?? v)
                    .join(', ')
                }
                inputProps={{ id: `popover-filter-${filter.id}` }}
              >
                {filter.options.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    <Checkbox
                      disableRipple
                      size="small"
                      checked={filter.value.includes(option.value)}
                    />
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ))}

          {hasActiveFilters && (
            <Button
              size="small"
              color="error"
              startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
              onClick={() => {
                handleResetAllFilters();
                setFiltersAnchorEl(null);
              }}
            >
              {t('pos.toolbar.clearAllFilters', { defaultValue: 'Limpar todos os filtros' })}
            </Button>
          )}
        </Stack>
      </Popover>

      {/* Menu: Export */}
      <Menu
        id="export-menu"
        anchorEl={exportAnchorEl}
        open={Boolean(exportAnchorEl)}
        onClose={() => setExportAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            setExportAnchorEl(null);
            onExportCsv?.();
          }}
        >
          <Iconify icon="solar:file-download-bold" sx={{ mr: 1.5 }} />
          {t('pos.toolbar.exportCsv', { defaultValue: 'Exportar CSV' })}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setExportAnchorEl(null);
            if (onPrint) onPrint();
            else window.print();
          }}
        >
          <Iconify icon="solar:printer-minimalistic-bold" sx={{ mr: 1.5 }} />
          {t('pos.toolbar.print', { defaultValue: 'Imprimir' })}
        </MenuItem>
      </Menu>
    </>
  );
}

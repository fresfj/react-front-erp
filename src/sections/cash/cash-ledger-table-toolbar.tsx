import Stack from '@mui/material/Stack';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

import { Iconify } from 'src/components/iconify';

import { TYPE_CONFIG } from './cash-ledger-table-row';

import type { CashLedgerLineType } from './cash-ledger';

// ----------------------------------------------------------------------

type Props = {
  searchQuery: string;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
  onResetPage?: () => void;
};

export function CashLedgerTableToolbar({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  onResetPage,
}: Props) {
  return (
    <Stack
      spacing={2}
      alignItems="center"
      direction={{ xs: 'column', md: 'row' }}
      sx={{
        p: 2.5,
        width: 1,
        flexWrap: 'nowrap',
        justifyContent: 'space-between',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems="center"
        spacing={2}
        sx={{
          width: { xs: 1, md: 540 },
          flexGrow: { md: 1 },
        }}
      >
        <TextField
          fullWidth
          value={searchQuery}
          onChange={(e) => {
            onResetPage?.();
            onSearchChange(e);
          }}
          placeholder="Pesquisar por descrição, motivo, sessão ou ref..."
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />

        <TextField
          select
          value={typeFilter}
          onChange={(e) => {
            onResetPage?.();
            onTypeFilterChange(e.target.value);
          }}
          sx={{ minWidth: { sm: 220 }, width: { xs: 1, sm: 'auto' } }}
        >
          <MenuItem value="all">Todos os tipos</MenuItem>
          {(Object.keys(TYPE_CONFIG) as CashLedgerLineType[]).map((key) => (
            <MenuItem key={key} value={key}>
              {TYPE_CONFIG[key].label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    </Stack>
  );
}

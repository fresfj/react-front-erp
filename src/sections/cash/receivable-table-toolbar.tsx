import Stack from '@mui/material/Stack';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  searchQuery: string;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  originFilter: string;
  onOriginFilterChange: (origin: string) => void;
  onResetPage?: () => void;
};

const ORIGIN_OPTIONS = [
  { value: 'all', label: 'Todas as origens' },
  { value: 'sale', label: 'Crediário / Fiado' },
  { value: 'credit_card', label: 'Repasse Cartão de Crédito' },
  { value: 'customer_debt', label: 'Débito em Aberto' },
  { value: 'invoice', label: 'Faturamento Corporativo' },
];

export function ReceivableTableToolbar({
  searchQuery,
  onSearchChange,
  originFilter,
  onOriginFilterChange,
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
          placeholder="Pesquisar por cliente, documento ou descrição…"
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
          value={originFilter}
          onChange={(e) => {
            onResetPage?.();
            onOriginFilterChange(e.target.value);
          }}
          sx={{ minWidth: { sm: 220 }, width: { xs: 1, sm: 'auto' } }}
        >
          {ORIGIN_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    </Stack>
  );
}

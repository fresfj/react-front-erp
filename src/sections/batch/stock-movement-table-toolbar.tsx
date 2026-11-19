import Stack from '@mui/material/Stack';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  searchQuery: string;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
  typeOptions: { value: string; label: string }[];
  onResetPage?: () => void;
};

export function StockMovementTableToolbar({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
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
          placeholder="Pesquisar movimentação por lote ou produto…"
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
          sx={{ minWidth: { sm: 200 }, width: { xs: 1, sm: 'auto' } }}
        >
          <MenuItem value="all">Todos os tipos</MenuItem>
          {typeOptions.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    </Stack>
  );
}

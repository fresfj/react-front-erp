import Stack from '@mui/material/Stack';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  searchQuery: string;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  roleFilter: string;
  onRoleFilterChange: (role: string) => void;
  onResetPage?: () => void;
};

const ROLE_OPTIONS = [
  { value: 'all', label: 'Todos os cargos' },
  { value: 'operador', label: 'Operador (PDV)' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'admin', label: 'Administrador' },
];

export function TeamTableToolbar({
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
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
          placeholder="Pesquisar colaborador por nome, e-mail…"
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
          value={roleFilter}
          onChange={(e) => {
            onResetPage?.();
            onRoleFilterChange(e.target.value);
          }}
          sx={{ minWidth: { sm: 200 }, width: { xs: 1, sm: 'auto' } }}
        >
          {ROLE_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    </Stack>
  );
}

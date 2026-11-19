import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  searchQuery: string;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onResetPage?: () => void;
};

export function ProductTableToolbar({ searchQuery, onSearchChange, onResetPage }: Props) {
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
        direction="row"
        alignItems="center"
        spacing={2}
        sx={{
          width: { xs: 1, md: 360 },
          flexGrow: { md: 1 },
          maxWidth: { md: 480 },
        }}
      >
        <TextField
          fullWidth
          value={searchQuery}
          onChange={(e) => {
            onResetPage?.();
            onSearchChange(e);
          }}
          placeholder="Pesquisar por produto, SKU, código de barras..."
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
      </Stack>
    </Stack>
  );
}

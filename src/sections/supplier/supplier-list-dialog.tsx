import type { Supplier } from 'src/api/firestore/suppliers';

import { useState, useCallback } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { SearchNotFound } from 'src/components/search-not-found';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  list: Supplier[];
  action?: React.ReactNode;
  selected: (selectedId: string) => boolean;
  onSelect: (supplier: Supplier | null) => void;
};

export function SupplierListDialog({
  list,
  open,
  action,
  onClose,
  selected,
  onSelect,
  title = 'Fornecedores',
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const dataFiltered = list.filter(
    (s) =>
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.tradeName && s.tradeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.document && s.document.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.city && s.city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const notFound = !dataFiltered.length && !!searchQuery;

  const handleSelect = useCallback(
    (supplier: Supplier | null) => {
      onSelect(supplier);
      setSearchQuery('');
      onClose();
    },
    [onClose, onSelect]
  );

  return (
    <Dialog fullWidth maxWidth="xs" open={open} onClose={onClose}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ p: 3, pr: 1.5 }}
      >
        <Typography variant="h6">{title}</Typography>
        {action && action}
      </Stack>

      <Stack sx={{ p: 2, pt: 0 }}>
        <TextField
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por nome, CNPJ/CPF ou cidade..."
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
      </Stack>

      {notFound ? (
        <SearchNotFound query={searchQuery} sx={{ px: 3, pt: 5, pb: 10 }} />
      ) : (
        <Scrollbar sx={{ p: 0.5, maxHeight: 480 }}>
          {dataFiltered.map((supplier) => (
            <ButtonBase
              key={supplier.id}
              onClick={() => handleSelect(supplier)}
              sx={{
                py: 1,
                my: 0.5,
                px: 1.5,
                gap: 0.5,
                width: 1,
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                ...(selected(supplier.id) && {
                  bgcolor: 'action.selected',
                }),
              }}
            >
              <Typography variant="subtitle2">{supplier.name}</Typography>

              {supplier.document && (
                <Box sx={{ color: 'primary.main', typography: 'caption' }}>
                  Doc: {supplier.document}
                </Box>
              )}

              {(supplier.phone || supplier.email) && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {[supplier.phone, supplier.email].filter(Boolean).join(' • ')}
                </Typography>
              )}

              {(supplier.city || supplier.state) && (
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  {[supplier.address, supplier.city, supplier.state].filter(Boolean).join(', ')}
                </Typography>
              )}
            </ButtonBase>
          ))}
        </Scrollbar>
      )}
    </Dialog>
  );
}

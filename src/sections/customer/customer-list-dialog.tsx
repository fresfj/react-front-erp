import type { Customer } from 'src/api/firestore/customers';

import { useState, useCallback } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

import { fCurrency } from 'src/utils/format-number';

import { formatCustomerFullAddress } from 'src/api/firestore/customers';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { SearchNotFound } from 'src/components/search-not-found';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  title?: string;
  searchPlaceholder?: string;
  onClose: () => void;
  list: Customer[];
  action?: React.ReactNode;
  selected: (selectedId: string) => boolean;
  onSelect: (customer: Customer | null) => void;
};

export function CustomerListDialog({
  list,
  open,
  action,
  onClose,
  selected,
  onSelect,
  title = 'Clientes',
  searchPlaceholder = 'Buscar por nome, telefone, CPF/CNPJ ou e-mail...',
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const dataFiltered = applyFilter({ inputData: list, query: searchQuery });

  const notFound = !dataFiltered.length && !!searchQuery;

  const handleSearch = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  }, []);

  const handleSelect = useCallback(
    (customer: Customer | null) => {
      onSelect(customer);
      setSearchQuery('');
      onClose();
    },
    [onClose, onSelect]
  );

  const renderList = (
    <Scrollbar sx={{ p: 0.5, maxHeight: 480 }}>
      {dataFiltered.map((customer) => {
        const fullAddr = formatCustomerFullAddress(customer);
        return (
          <ButtonBase
            key={customer.id}
            onClick={() => handleSelect(customer)}
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
              ...(selected(customer.id) && {
                bgcolor: 'action.selected',
              }),
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ width: 1 }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1, textAlign: 'left' }}>
                {customer.name}
              </Typography>

              {customer.currentDebt > 0 && (
                <Label color="error" variant="soft">
                  Débito: {fCurrency(customer.currentDebt)}
                </Label>
              )}
            </Stack>

            {customer.document && (
              <Box sx={{ color: 'primary.main', typography: 'caption' }}>
                CPF/CNPJ: {customer.document}
              </Box>
            )}

            {(customer.phone || customer.email) && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {[customer.phone, customer.email].filter(Boolean).join(' • ')}
              </Typography>
            )}

            {fullAddr && (
              <Typography variant="caption" sx={{ color: 'text.disabled', textAlign: 'left' }}>
                {fullAddr}
              </Typography>
            )}
          </ButtonBase>
        );
      })}
    </Scrollbar>
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
          onChange={handleSearch}
          placeholder={searchPlaceholder}
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
        renderList
      )}
    </Dialog>
  );
}

// ----------------------------------------------------------------------

function applyFilter({ inputData, query }: { inputData: Customer[]; query: string }) {
  if (!query) return inputData;
  const q = query.toLowerCase();
  return inputData.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.document && c.document.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
  );
}

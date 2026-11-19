import type { Supplier } from 'src/api/firestore/suppliers';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import TableCell from '@mui/material/TableCell';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';

import { formatCnpj } from 'src/utils/br-docs';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

// ----------------------------------------------------------------------

type Props = {
  row: Supplier;
  selected?: boolean;
  onSelectRow?: () => void;
  onEditRow: () => void;
  onDeleteRow: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function SupplierTableRow({
  row,
  selected,
  onSelectRow,
  onEditRow,
  onDeleteRow,
  visibleColumns,
}: Props) {
  const popover = usePopover();
  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;

  return (
    <>
      <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
        {onSelectRow && (
          <TableCell padding="checkbox">
            <Checkbox checked={selected} onClick={onSelectRow} />
          </TableCell>
        )}

        {isVisible('name') && (
          <TableCell>
            <Stack spacing={2} direction="row" alignItems="center">
              <Avatar
                alt={row.name}
                sx={{
                  bgcolor: 'info.lighter',
                  color: 'info.darker',
                  fontWeight: 600,
                  width: 44,
                  height: 44,
                }}
              >
                {row.name?.charAt(0).toUpperCase()}
              </Avatar>

              <ListItemText
                disableTypography
                primary={
                  <Link
                    noWrap
                    variant="subtitle2"
                    onClick={onEditRow}
                    sx={{ color: 'text.primary', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {row.name}
                  </Link>
                }
                secondary={
                  <Box component="div" sx={{ typography: 'caption', color: 'text.disabled' }}>
                    {row.tradeName ? `${row.tradeName} • ` : ''}
                    {row.document ? `CNPJ/CPF: ${formatCnpj(row.document)}` : 'Sem documento'}
                  </Box>
                }
                sx={{ display: 'flex', flexDirection: 'column' }}
              />
            </Stack>
          </TableCell>
        )}

        {isVisible('phone') && (
          <TableCell>
            <Typography variant="body2" noWrap>
              {row.phone || '—'}
            </Typography>
          </TableCell>
        )}

        {isVisible('email') && (
          <TableCell>
            <Typography variant="body2" noWrap>
              {row.email || '—'}
            </Typography>
          </TableCell>
        )}

        {isVisible('contactPerson') && (
          <TableCell>
            <Typography variant="body2" noWrap>
              {row.contactPerson || '—'}
            </Typography>
          </TableCell>
        )}

        {isVisible('active') && (
          <TableCell>
            <Label variant="soft" color={row.active ? 'success' : 'default'}>
              {row.active ? 'Ativo' : 'Inativo'}
            </Label>
          </TableCell>
        )}

        {isVisible('actions') && (
          <TableCell align="right" sx={{ px: 1 }}>
            <IconButton color={popover.open ? 'inherit' : 'default'} onClick={popover.onOpen}>
              <Iconify icon="eva:more-vertical-fill" />
            </IconButton>
          </TableCell>
        )}
      </TableRow>

      <CustomPopover
        open={popover.open}
        anchorEl={popover.anchorEl}
        onClose={popover.onClose}
        slotProps={{ arrow: { placement: 'right-top' } }}
      >
        <MenuList>
          <MenuItem
            onClick={() => {
              popover.onClose();
              onEditRow();
            }}
          >
            <Iconify icon="solar:pen-bold" />
            Editar Fornecedor
          </MenuItem>

          <MenuItem
            onClick={() => {
              popover.onClose();
              onDeleteRow();
            }}
            sx={{ color: 'error.main' }}
          >
            <Iconify icon="solar:trash-bin-trash-bold" />
            Desativar
          </MenuItem>
        </MenuList>
      </CustomPopover>
    </>
  );
}

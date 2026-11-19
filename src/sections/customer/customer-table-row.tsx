import type { Customer } from 'src/api/firestore/customers';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';
import TableCell from '@mui/material/TableCell';
import IconButton from '@mui/material/IconButton';

import { useBoolean } from 'src/hooks/use-boolean';

import { fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

// ----------------------------------------------------------------------

type Props = {
  row: Customer;
  selected: boolean;
  onEditRow: () => void;
  onSelectRow: () => void;
  onDeleteRow: () => void;
  onSettleDebt: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function CustomerTableRow({
  row,
  selected,
  onEditRow,
  onSelectRow,
  onDeleteRow,
  onSettleDebt,
  visibleColumns,
}: Props) {
  const confirm = useBoolean();
  const popover = usePopover();

  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const hasDebt = (row.currentDebt || 0) > 0;

  return (
    <>
      <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
        <TableCell padding="checkbox">
          <Checkbox id={row.id} checked={selected} onClick={onSelectRow} />
        </TableCell>

        {isVisible('name') && (
          <TableCell>
            <Stack spacing={2} direction="row" alignItems="center">
              <Avatar
                alt={row.name}
                sx={{
                  bgcolor: hasDebt ? 'error.lighter' : 'primary.lighter',
                  color: hasDebt ? 'error.main' : 'primary.main',
                  fontWeight: 600,
                }}
              >
                {row.name?.charAt(0).toUpperCase()}
              </Avatar>

              <Stack sx={{ typography: 'body2', flex: '1 1 auto', alignItems: 'flex-start' }}>
                <Link
                  color="inherit"
                  onClick={onEditRow}
                  sx={{
                    cursor: 'pointer',
                    fontWeight: 600,
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  {row.name}
                </Link>
                <Box component="span" sx={{ typography: 'caption', color: 'text.disabled' }}>
                  {[row.document, row.email].filter(Boolean).join(' • ') || 'Sem documento'}
                </Box>
              </Stack>
            </Stack>
          </TableCell>
        )}

        {isVisible('phone') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            {row.phone || '—'}
          </TableCell>
        )}

        {isVisible('creditLimit') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            {row.creditLimit ? fCurrency(row.creditLimit) : 'Sem limite'}
          </TableCell>
        )}

        {isVisible('currentDebt') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            <Label variant="soft" color={hasDebt ? 'error' : 'success'}>
              {fCurrency(row.currentDebt || 0)}
            </Label>
          </TableCell>
        )}

        {isVisible('status') && (
          <TableCell>
            <Label variant="soft" color={row.active ? 'success' : 'default'}>
              {row.active ? 'Ativo' : 'Inativo'}
            </Label>
          </TableCell>
        )}

        {isVisible('actions') && (
          <TableCell align="right" sx={{ px: 1, whiteSpace: 'nowrap' }}>
            {hasDebt && (
              <Tooltip title="Quitar débito" placement="top" arrow>
                <IconButton color="success" onClick={onSettleDebt} sx={{ mr: 0.5 }}>
                  <Iconify icon="solar:dollar-minimalistic-bold" />
                </IconButton>
              </Tooltip>
            )}

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
          {hasDebt && (
            <MenuItem
              onClick={() => {
                popover.onClose();
                onSettleDebt();
              }}
              sx={{ color: 'success.main' }}
            >
              <Iconify icon="solar:dollar-minimalistic-bold" />
              Quitar Débito
            </MenuItem>
          )}

          <MenuItem
            onClick={() => {
              popover.onClose();
              onEditRow();
            }}
          >
            <Iconify icon="solar:pen-bold" />
            Editar
          </MenuItem>

          <MenuItem
            onClick={() => {
              popover.onClose();
              confirm.onTrue();
            }}
            sx={{ color: 'error.main' }}
          >
            <Iconify icon="solar:trash-bin-trash-bold" />
            Desativar
          </MenuItem>
        </MenuList>
      </CustomPopover>

      <ConfirmDialog
        open={confirm.value}
        onClose={confirm.onFalse}
        title="Desativar Cliente"
        content="Tem certeza de que deseja desativar este cliente?"
        action={
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              onDeleteRow();
              confirm.onFalse();
            }}
          >
            Desativar
          </Button>
        }
      />
    </>
  );
}

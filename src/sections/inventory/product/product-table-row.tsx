import type { Product } from 'src/api/firestore/products';

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

import { fDate } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

// ----------------------------------------------------------------------

type Props = {
  row: Product;
  selected?: boolean;
  onSelectRow?: () => void;
  onViewRow: () => void;
  onEditRow: () => void;
  onDeleteRow: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function ProductTableRow({
  row,
  selected,
  onSelectRow,
  onViewRow,
  onEditRow,
  onDeleteRow,
  visibleColumns,
}: Props) {
  const popover = usePopover();

  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const isRaw = row.type === 'raw';
  const typeColor = isRaw ? 'warning' : 'info';
  const typeLabel = isRaw ? 'Matéria-prima' : 'Produto Acabado';

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
                src={row.imageUrl || ''}
                variant="rounded"
                sx={{ width: 48, height: 48, bgcolor: 'background.neutral', flexShrink: 0 }}
              >
                {row.name?.charAt(0).toUpperCase()}
              </Avatar>

              <ListItemText
                disableTypography
                primary={
                  <Link
                    noWrap
                    variant="subtitle2"
                    onClick={onViewRow}
                    sx={{ color: 'text.primary', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {row.name}
                  </Link>
                }
                secondary={
                  <Box component="div" sx={{ typography: 'caption', color: 'text.disabled' }}>
                    SKU: <strong>{row.sku || '—'}</strong>
                    {row.category ? ` • ${row.category}` : ''}
                    {row.unit ? ` (${row.unit})` : ''}
                    {row.showOnline && (
                      <Label
                        variant="soft"
                        color="info"
                        sx={{ ml: 0.75, height: 18, fontSize: 10, px: 0.5 }}
                      >
                        Vitrine online
                      </Label>
                    )}
                  </Box>
                }
                sx={{ display: 'flex', flexDirection: 'column' }}
              />
            </Stack>
          </TableCell>
        )}

        {isVisible('type') && (
          <TableCell>
            <Label variant="soft" color={typeColor}>
              {typeLabel}
            </Label>
          </TableCell>
        )}

        {isVisible('salePrice') && (
          <TableCell>
            <Stack spacing={0.25} sx={{ typography: 'body2' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {fCurrency(row.salePrice ?? 0)}
              </Typography>
              {row.costPrice != null && row.costPrice > 0 && (
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  Custo: {fCurrency(row.costPrice)}
                </Typography>
              )}
            </Stack>
          </TableCell>
        )}

        {isVisible('minStock') && (
          <TableCell>
            <Typography variant="body2">
              Mín: {row.minStock ?? 0} {row.unit || 'un'}
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

        {isVisible('createdAt') && (
          <TableCell sx={{ typography: 'body2', color: 'text.secondary' }}>
            {row.createdAt ? fDate(row.createdAt) : '—'}
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
              onViewRow();
            }}
          >
            <Iconify icon="solar:eye-bold" />
            Visualizar / Editar
          </MenuItem>

          <MenuItem
            onClick={() => {
              popover.onClose();
              onEditRow();
            }}
          >
            <Iconify icon="solar:pen-bold" />
            Editar Produto
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

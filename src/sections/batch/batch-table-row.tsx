import type { Batch } from 'src/api/firestore/batches';

import Box from '@mui/material/Box';
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

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

// ----------------------------------------------------------------------

type Props = {
  row: Batch;
  selected?: boolean;
  onSelectRow?: () => void;
  onDeactivateRow?: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function BatchTableRow({
  row,
  selected,
  onSelectRow,
  onDeactivateRow,
  visibleColumns,
}: Props) {
  const popover = usePopover();

  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const isRaw = row.productType === 'raw';
  const typeColor = isRaw ? 'warning' : 'primary';
  const typeLabel = isRaw ? 'Matéria-prima' : 'Produto Acabado';

  const isLow = row.remainingQty > 0 && row.remainingQty < row.initialQty * 0.2;
  const isOut = row.remainingQty <= 0;
  const stockColor = isOut ? 'default' : isLow ? 'warning' : 'success';

  return (
    <>
      <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
        {onSelectRow && (
          <TableCell padding="checkbox">
            <Checkbox checked={selected} onClick={onSelectRow} />
          </TableCell>
        )}

        {isVisible('lotCode') && (
          <TableCell>
            <Stack spacing={2} direction="row" alignItems="center">
              <Avatar
                alt={row.productName}
                sx={{
                  bgcolor: isRaw ? 'warning.lighter' : 'primary.lighter',
                  color: isRaw ? 'warning.darker' : 'primary.darker',
                  fontWeight: 600,
                  width: 44,
                  height: 44,
                }}
              >
                {row.productName?.charAt(0).toUpperCase() || 'L'}
              </Avatar>

              <ListItemText
                disableTypography
                primary={
                  <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
                    Lote: {row.lotCode}
                  </Typography>
                }
                secondary={
                  <Box component="div" sx={{ typography: 'caption', color: 'text.disabled' }}>
                    {row.productName}
                    {row.supplierName ? ` • Forn: ${row.supplierName}` : ''}
                  </Box>
                }
                sx={{ display: 'flex', flexDirection: 'column' }}
              />
            </Stack>
          </TableCell>
        )}

        {isVisible('productType') && (
          <TableCell>
            <Label variant="soft" color={typeColor}>
              {typeLabel}
            </Label>
          </TableCell>
        )}

        {isVisible('initialQty') && (
          <TableCell>
            <Typography variant="body2">
              {fNumber(row.initialQty)} {row.unit || 'kg'}
            </Typography>
          </TableCell>
        )}

        {isVisible('remainingQty') && (
          <TableCell>
            <Label variant="soft" color={stockColor}>
              {fNumber(row.remainingQty)} {row.unit || 'kg'}
            </Label>
          </TableCell>
        )}

        {isVisible('unitCost') && (
          <TableCell>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {fCurrency(row.unitCost)}
            </Typography>
          </TableCell>
        )}

        {isVisible('totalCost') && (
          <TableCell>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {fCurrency(row.remainingQty * row.unitCost)}
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
            {row.createdAt ? fDateTime(row.createdAt) : '—'}
          </TableCell>
        )}

        {isVisible('actions') && (
          <TableCell align="right" sx={{ px: 1 }}>
            {row.active && onDeactivateRow && (
              <IconButton color={popover.open ? 'inherit' : 'default'} onClick={popover.onOpen}>
                <Iconify icon="eva:more-vertical-fill" />
              </IconButton>
            )}
          </TableCell>
        )}
      </TableRow>

      {onDeactivateRow && (
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
                onDeactivateRow();
              }}
              sx={{ color: 'error.main' }}
            >
              <Iconify icon="solar:trash-bin-trash-bold" />
              Desativar Lote
            </MenuItem>
          </MenuList>
        </CustomPopover>
      )}
    </>
  );
}

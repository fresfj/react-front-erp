import type { Payable } from 'src/api/firestore/payables';

import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TableCell from '@mui/material/TableCell';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

// ----------------------------------------------------------------------

type Props = {
  row: Payable;
  selected?: boolean;
  onSelectRow?: () => void;
  isOverdue: boolean;
  onPay: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function PayableTableRow({
  row,
  selected,
  onSelectRow,
  isOverdue,
  onPay,
  visibleColumns,
}: Props) {
  const router = useRouter();
  const popover = usePopover();

  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;

  const handleEdit = () => {
    popover.onClose();
    router.push(paths.dashboard.cash.payableEdit(row.id));
  };

  const getStatusLabel = () => {
    if (isOverdue) return { label: 'Vencida', color: 'error' as const };
    if (row.status === 'paid') return { label: 'Pago', color: 'success' as const };
    if (row.status === 'cancelled') return { label: 'Cancelado', color: 'default' as const };
    return { label: 'Em aberto', color: 'warning' as const };
  };

  const statusInfo = getStatusLabel();

  return (
    <>
      <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
        {onSelectRow && (
          <TableCell padding="checkbox">
            <Checkbox checked={selected} onClick={onSelectRow} />
          </TableCell>
        )}

        {isVisible('supplierName') && (
          <TableCell>
            <ListItemText
              primary={row.supplierName || '—'}
              secondary={row.description}
              primaryTypographyProps={{ typography: 'subtitle2' }}
              secondaryTypographyProps={{ typography: 'caption', color: 'text.disabled' }}
            />
          </TableCell>
        )}

        {isVisible('category') && (
          <TableCell sx={{ typography: 'body2' }}>{row.category || '—'}</TableCell>
        )}

        {isVisible('amount') && (
          <TableCell align="right" sx={{ typography: 'subtitle2' }}>
            {fCurrency(row.amount)}
          </TableCell>
        )}

        {isVisible('dueDate') && (
          <TableCell>
            <Label variant="soft" color={isOverdue ? 'error' : 'default'}>
              {row.dueDate || '—'}
            </Label>
          </TableCell>
        )}

        {isVisible('status') && (
          <TableCell>
            <Label variant="soft" color={statusInfo.color}>
              {statusInfo.label}
            </Label>
          </TableCell>
        )}

        {isVisible('actions') && (
          <TableCell align="right">
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
        <MenuItem onClick={handleEdit}>
          <Iconify icon="solar:pen-bold" />
          Editar
        </MenuItem>

        {row.status === 'open' && (
          <MenuItem
            onClick={() => {
              popover.onClose();
              onPay();
            }}
            sx={{ color: 'success.main' }}
          >
            <Iconify icon="solar:check-circle-bold" />
            Marcar como Pago
          </MenuItem>
        )}
      </CustomPopover>
    </>
  );
}

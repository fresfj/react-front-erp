import type { Receivable } from 'src/api/firestore/receivables';

import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
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

export type ReceivableRow = Receivable & {
  customerDocument?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerDebt: number;
  isOverdue: boolean;
};

type Props = {
  row: ReceivableRow;
  selected?: boolean;
  onSelectRow?: () => void;
  onPay: () => void;
  onSettleDebt: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function ReceivableTableRow({
  row,
  selected,
  onSelectRow,
  onPay,
  onSettleDebt,
  visibleColumns,
}: Props) {
  const router = useRouter();
  const popover = usePopover();

  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const isSyntheticDebt = row.id.startsWith('debt-');

  const handleEdit = () => {
    popover.onClose();
    if (!isSyntheticDebt) {
      router.push(paths.dashboard.cash.receivableEdit(row.id));
    }
  };

  const renderOrigin = () => {
    if (row.refType === 'credit_card') {
      return (
        <Label
          variant="soft"
          color="info"
          startIcon={<Iconify icon="solar:card-2-bold" width={16} />}
        >
          Repasse Cartão
        </Label>
      );
    }
    if (row.refType === 'sale') {
      return (
        <Label
          variant="soft"
          color="warning"
          startIcon={<Iconify icon="solar:notebook-bold" width={16} />}
        >
          Crediário / Fiado
        </Label>
      );
    }
    if (row.refType === 'customer_debt') {
      return (
        <Label
          variant="soft"
          color="error"
          startIcon={<Iconify icon="solar:danger-triangle-bold" width={16} />}
        >
          Débito Cliente
        </Label>
      );
    }
    if (row.refType === 'invoice') {
      return (
        <Label
          variant="soft"
          color="primary"
          startIcon={<Iconify icon="solar:document-bold" width={16} />}
        >
          Faturamento
        </Label>
      );
    }
    return <Label variant="soft">Avulso</Label>;
  };

  const count = row.installmentCount || 1;
  const idx = row.installmentIndex || 1;

  return (
    <>
      <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
        {onSelectRow && (
          <TableCell padding="checkbox">
            <Checkbox checked={selected} onClick={onSelectRow} />
          </TableCell>
        )}

        {isVisible('customerName') && (
          <TableCell>
            <ListItemText
              primary={row.customerName || 'Cliente balcão'}
              secondary={
                row.customerDocument
                  ? `Doc: ${row.customerDocument}${
                      row.customerPhone ? ` • ${row.customerPhone}` : ''
                    }`
                  : undefined
              }
              primaryTypographyProps={{ typography: 'subtitle2' }}
              secondaryTypographyProps={{ typography: 'caption', color: 'text.disabled' }}
            />
          </TableCell>
        )}

        {isVisible('refType') && <TableCell>{renderOrigin()}</TableCell>}

        {isVisible('installment') && (
          <TableCell>
            {count > 1 ? (
              <Chip
                size="small"
                variant="outlined"
                color="primary"
                label={`${idx}/${count}`}
                sx={{ fontWeight: 'bold' }}
              />
            ) : (
              <Chip size="small" variant="soft" label="Única" />
            )}
          </TableCell>
        )}

        {isVisible('description') && (
          <TableCell sx={{ typography: 'body2' }}>{row.description}</TableCell>
        )}

        {isVisible('amount') && (
          <TableCell align="right" sx={{ typography: 'subtitle2' }}>
            {fCurrency(row.amount)}
          </TableCell>
        )}

        {isVisible('dueDate') && (
          <TableCell>
            {row.isOverdue ? (
              <Tooltip title="Título vencido aguardando cobrança">
                <Label
                  variant="filled"
                  color="error"
                  startIcon={<Iconify icon="solar:alarm-bold" width={14} />}
                >
                  {row.dueDate} (Vencida)
                </Label>
              </Tooltip>
            ) : (
              <Label variant="soft" color="default">
                {row.dueDate || '—'}
              </Label>
            )}
          </TableCell>
        )}

        {isVisible('status') && (
          <TableCell>
            <Label
              variant="soft"
              color={
                row.isOverdue
                  ? 'error'
                  : row.status === 'paid'
                    ? 'success'
                    : row.status === 'cancelled'
                      ? 'default'
                      : 'warning'
              }
            >
              {row.isOverdue
                ? 'Vencida'
                : row.status === 'open'
                  ? 'Em aberto'
                  : row.status === 'paid'
                    ? 'Recebido'
                    : 'Cancelado'}
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
        {isSyntheticDebt ? (
          <MenuItem
            onClick={() => {
              popover.onClose();
              onSettleDebt();
            }}
            sx={{ color: 'success.main' }}
          >
            <Iconify icon="solar:hand-money-bold" />
            Receber Débito / Quitar no Caixa
          </MenuItem>
        ) : (
          <>
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
                Marcar como Recebido (Baixar)
              </MenuItem>
            )}
          </>
        )}
      </CustomPopover>
    </>
  );
}

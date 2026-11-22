import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';
import TableCell from '@mui/material/TableCell';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';

import type { CashLedgerLine, CashLedgerLineType } from './cash-ledger';

// ----------------------------------------------------------------------

export const TYPE_CONFIG: Record<
  CashLedgerLineType,
  { label: string; color: 'success' | 'error' | 'info' | 'warning'; icon: string }
> = {
  OPENING: {
    label: 'Abertura de Caixa',
    color: 'info',
    icon: 'solar:lock-keyhole-minimalistic-unlocked-bold-duotone',
  },
  SALE: {
    label: 'Venda à Vista',
    color: 'success',
    icon: 'solar:cart-check-bold-duotone',
  },
  SUPPLY: {
    label: 'Suprimento (Entrada)',
    color: 'success',
    icon: 'solar:wallet-money-bold-duotone',
  },
  RECEIPT: {
    label: 'Recebimento (AR / Fiado)',
    color: 'success',
    icon: 'solar:card-recive-bold-duotone',
  },
  WITHDRAWAL: {
    label: 'Sangria (Retirada)',
    color: 'warning',
    icon: 'solar:hand-money-bold-duotone',
  },
  PAYMENT: {
    label: 'Pagamento de Despesa',
    color: 'error',
    icon: 'solar:card-send-bold-duotone',
  },
};

type Props = {
  row: CashLedgerLine;
  selected?: boolean;
  onSelectRow?: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function CashLedgerTableRow({ row, selected, onSelectRow, visibleColumns }: Props) {
  const theme = useTheme();
  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const config = TYPE_CONFIG[row.type] || TYPE_CONFIG.OPENING;
  const isPositive = row.signedAmount >= 0;

  return (
    <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
      {onSelectRow && (
        <TableCell padding="checkbox">
          <Checkbox checked={selected} onClick={onSelectRow} />
        </TableCell>
      )}

      {isVisible('reason') && (
        <TableCell sx={{ maxWidth: 320 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Avatar
              sx={{
                width: 36,
                height: 36,
                flexShrink: 0,
                bgcolor: alpha(theme.palette[config.color].main, 0.12),
                color: theme.palette[config.color].main,
              }}
            >
              <Iconify icon={config.icon} width={20} />
            </Avatar>
            <Stack spacing={0.25} sx={{ minWidth: 0, maxWidth: 256 }}>
              <Tooltip
                title={
                  row.type === 'OPENING'
                    ? 'Abertura de Caixa (Fundo de troco)'
                    : row.reason || 'Movimentação avulsa'
                }
                placement="top-start"
                arrow
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {row.type === 'OPENING'
                    ? 'Abertura de Caixa'
                    : row.reason || 'Movimentação avulsa'}
                </Typography>
              </Tooltip>
              <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                Sessão: {row.sessionCode || '—'}
                {row.refId
                  ? ` • Ref: ${
                      row.refType === 'payable'
                        ? 'AP'
                        : row.refType === 'sale'
                          ? 'VD'
                          : 'AR'
                    }:${row.refId.slice(0, 8)}`
                  : ''}
              </Typography>
            </Stack>
          </Stack>
        </TableCell>
      )}

      {isVisible('type') && (
        <TableCell>
          <Label variant="soft" color={config.color}>
            {config.label}
          </Label>
        </TableCell>
      )}

      {isVisible('createdAt') && (
        <TableCell sx={{ typography: 'body2' }}>{fDateTime(row.createdAt) || '—'}</TableCell>
      )}

      {isVisible('signedAmount') && (
        <TableCell align="right">
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: isPositive ? 'success.main' : 'error.main',
            }}
          >
            {isPositive ? '+' : '−'} {fCurrency(Math.abs(row.signedAmount))}
          </Typography>
        </TableCell>
      )}

      {isVisible('balanceAfter') && (
        <TableCell align="right" sx={{ typography: 'subtitle2' }}>
          {fCurrency(row.balanceAfter)}
        </TableCell>
      )}
    </TableRow>
  );
}

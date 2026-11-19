import type { Sale } from 'src/api/firestore/sales';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TableCell from '@mui/material/TableCell';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';
import { PaymentMethodIcon, getPaymentMethodBrand } from 'src/components/payment-method-icon';

// ----------------------------------------------------------------------

type Props = {
  row: Sale;
  selected?: boolean;
  onSelectRow?: () => void;
  canCancel: boolean;
  onCancel: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function SaleTableRow({
  row,
  selected,
  onSelectRow,
  canCancel,
  onCancel,
  visibleColumns,
}: Props) {
  const router = useRouter();
  const popover = usePopover();

  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const detailsHref = paths.dashboard.pos.saleDetails(row.id);

  const handleView = () => {
    popover.onClose();
    router.push(detailsHref);
  };

  return (
    <>
      <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
        {onSelectRow && (
          <TableCell padding="checkbox">
            <Checkbox
              checked={selected}
              onClick={onSelectRow}
              inputProps={{ id: `row-checkbox-${row.id}`, 'aria-label': 'Row checkbox' }}
            />
          </TableCell>
        )}

        {isVisible('createdAt') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            <ListItemText
              disableTypography
              primary={
                <Link
                  component={RouterLink}
                  href={detailsHref}
                  color="inherit"
                  underline="hover"
                  noWrap
                  sx={{
                    typography: 'subtitle2',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-block',
                  }}
                >
                  {row.code || row.id}
                </Link>
              }
              secondary={
                <Box
                  component="span"
                  sx={{
                    typography: 'caption',
                    color: 'text.disabled',
                    display: 'block',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.createdAt ? fDateTime(row.createdAt) : '—'}
                </Box>
              }
            />
          </TableCell>
        )}

        {isVisible('customerName') && (
          <TableCell sx={{ typography: 'body2', whiteSpace: 'nowrap' }}>
            <Link
              component={RouterLink}
              href={detailsHref}
              color="inherit"
              underline="hover"
              noWrap
              sx={{ cursor: 'pointer', display: 'inline-block' }}
            >
              {row.customerName || 'Consumidor Final'}
            </Link>
          </TableCell>
        )}

        {isVisible('channel') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            {row.channel === 'online' || Boolean(row.onlineOrderId) ? (
              <Label
                variant="soft"
                color="info"
                startIcon={<Iconify icon="solar:shop-2-bold" width={14} />}
              >
                Online
              </Label>
            ) : (
              <Box>
                <Label
                  variant="soft"
                  color="default"
                  startIcon={<Iconify icon="solar:monitor-smartphone-bold" width={14} />}
                >
                  PDV
                </Label>
                {row.sellerEmail && (
                  <Box
                    component="span"
                    sx={{
                      display: 'block',
                      typography: 'caption',
                      color: 'text.disabled',
                      mt: 0.25,
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={row.sellerEmail}
                  >
                    {row.sellerEmail}
                  </Box>
                )}
              </Box>
            )}
          </TableCell>
        )}

        {isVisible('total') && (
          <TableCell align="right" sx={{ typography: 'subtitle2', whiteSpace: 'nowrap' }}>
            {fCurrency(row.total)}
          </TableCell>
        )}

        {isVisible('totalCost') && (
          <TableCell
            align="right"
            sx={{ typography: 'body2', color: 'text.secondary', whiteSpace: 'nowrap' }}
          >
            {fCurrency(row.totalCost)}
          </TableCell>
        )}

        {isVisible('grossProfit') && (
          <TableCell
            align="right"
            sx={{
              typography: 'subtitle2',
              whiteSpace: 'nowrap',
              color: (row.grossProfit || 0) >= 0 ? 'success.main' : 'error.main',
            }}
          >
            {fCurrency(row.grossProfit || 0)}
          </TableCell>
        )}

        {isVisible('payments') && (
          <TableCell sx={{ typography: 'caption', whiteSpace: 'nowrap' }}>
            {row.payments?.length ? (
              <Stack spacing={0.5}>
                {row.payments.map((p, idx) => (
                  <Stack key={`${p.method}-${idx}`} direction="row" spacing={0.75} alignItems="center">
                    <PaymentMethodIcon method={p.method} size={16} />
                    <span>{getPaymentMethodBrand(p.method).defaultLabel}</span>
                  </Stack>
                ))}
              </Stack>
            ) : (
              '—'
            )}
          </TableCell>
        )}

        {isVisible('status') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            <Label variant="soft" color={row.status === 'completed' ? 'success' : 'error'}>
              {row.status === 'completed' ? 'Concluída' : 'Cancelada'}
            </Label>
          </TableCell>
        )}

        {isVisible('actions') && (
          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
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
        <MenuItem onClick={handleView}>
          <Iconify icon="solar:eye-bold" />
          Ver Detalhes / Cupom
        </MenuItem>

        {canCancel && row.status === 'completed' && (
          <MenuItem
            onClick={() => {
              popover.onClose();
              onCancel();
            }}
            sx={{ color: 'error.main' }}
          >
            <Iconify icon="solar:trash-bin-trash-bold" />
            Cancelar Venda
          </MenuItem>
        )}
      </CustomPopover>
    </>
  );
}

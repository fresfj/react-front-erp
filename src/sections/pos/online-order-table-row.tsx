import type {
  OnlineOrder,
  OnlineOrderFulfillmentStatus,
} from 'src/api/firestore/online-orders';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import TableCell from '@mui/material/TableCell';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { PaymentMethodIcon } from 'src/components/payment-method-icon';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

import { getFulfillmentLabel } from 'src/sections/public-store/order-progress-stepper';

// ----------------------------------------------------------------------

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  cash: 'Dinheiro',
  credit_card: 'Crédito',
  debit_card: 'Débito',
};

type SelectableStatus = 'preparing' | 'out_for_delivery' | 'delivered';

type Props = {
  row: OnlineOrder;
  selected?: boolean;
  onSelectRow?: () => void;
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onChangeStatus: (next: SelectableStatus) => void;
  visibleColumns?: Record<string, boolean>;
};

export function OnlineOrderTableRow({
  row,
  selected,
  onSelectRow,
  busy,
  onAccept,
  onReject,
  onChangeStatus,
  visibleColumns,
}: Props) {
  const { t } = useTranslate('common');
  const router = useRouter();
  const statusPopover = usePopover();

  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const badge = getFulfillmentLabel(row.fulfillmentStatus, row.deliveryType);

  const statusOptions: Array<{
    value: SelectableStatus;
    label: string;
    icon: string;
    color: string;
  }> = [
    {
      value: 'preparing',
      label: 'Em preparação',
      icon: 'solar:box-bold',
      color: 'primary.main',
    },
    {
      value: 'out_for_delivery',
      label: row.deliveryType === 'delivery' ? 'Saiu para entrega' : 'Pronto para retirada',
      icon: row.deliveryType === 'delivery' ? 'solar:scooter-bold' : 'solar:shop-bold',
      color: 'warning.main',
    },
    {
      value: 'delivered',
      label: 'Finalizado',
      icon: 'solar:verified-check-bold',
      color: 'success.main',
    },
  ];

  const handleSelectStatus = (next: SelectableStatus) => {
    statusPopover.onClose();
    if (next !== (row.fulfillmentStatus as OnlineOrderFulfillmentStatus)) {
      onChangeStatus(next);
    }
  };

  return (
    <>
      <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
        {onSelectRow && (
          <TableCell padding="checkbox">
            <Checkbox
              checked={selected}
              onClick={onSelectRow}
              inputProps={{ id: `order-row-checkbox-${row.id}`, 'aria-label': 'Row checkbox' }}
            />
          </TableCell>
        )}

        {isVisible('createdAt') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            <ListItemText
              disableTypography
              primary={
                <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                  {row.code || row.id}
                </Typography>
              }
              secondary={
                <Box
                  component="span"
                  sx={{ typography: 'caption', color: 'text.disabled', display: 'block' }}
                >
                  {row.createdAt ? fDateTime(row.createdAt) : '—'}
                </Box>
              }
            />
          </TableCell>
        )}

        {isVisible('customerName') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            <ListItemText
              disableTypography
              primary={
                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                  {row.customerName || '—'}
                </Typography>
              }
              secondary={
                <Box
                  component="span"
                  sx={{ typography: 'caption', color: 'text.secondary', display: 'block' }}
                >
                  {row.customerPhone || '—'}
                </Box>
              }
            />
          </TableCell>
        )}

        {isVisible('deliveryType') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            <Stack spacing={0.25}>
              <Typography variant="body2">
                {row.deliveryType === 'delivery' ? 'Entrega' : 'Retirada'}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PaymentMethodIcon method={row.paymentMethod} size={16} />
                <Typography variant="caption" color="text.secondary">
                  {PAYMENT_LABELS[row.paymentMethod] || row.paymentMethod}
                </Typography>
              </Stack>
            </Stack>
          </TableCell>
        )}

        {isVisible('total') && (
          <TableCell align="right" sx={{ typography: 'subtitle2', whiteSpace: 'nowrap' }}>
            {fCurrency(row.total)}
          </TableCell>
        )}

        {isVisible('status') && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            {row.status === 'accepted' ? (
              <Button
                color="inherit"
                variant="outlined"
                disabled={busy}
                endIcon={<Iconify icon="eva:arrow-ios-downward-fill" />}
                onClick={statusPopover.onOpen}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {badge.label}
              </Button>
            ) : (
              <Label variant="soft" color={badge.color}>
                {badge.label}
              </Label>
            )}
          </TableCell>
        )}

        {isVisible('actions') && (
          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
            {row.status === 'pending' ? (
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small"
                  variant="contained"
                  disabled={busy}
                  onClick={onAccept}
                >
                  {t('onlineOrders.accept')}
                </Button>
                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  disabled={busy}
                  onClick={onReject}
                >
                  {t('onlineOrders.reject')}
                </Button>
              </Stack>
            ) : row.saleId ? (
              <Button
                size="small"
                variant="soft"
                color="primary"
                onClick={() => router.push(paths.dashboard.pos.saleDetails(row.saleId!))}
                endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
              >
                {t('onlineOrders.viewSale')}
              </Button>
            ) : null}
          </TableCell>
        )}
      </TableRow>

      <CustomPopover
        open={statusPopover.open}
        anchorEl={statusPopover.anchorEl}
        onClose={statusPopover.onClose}
        slotProps={{ arrow: { placement: 'top-right' } }}
      >
        <MenuList>
          {statusOptions.map((option) => (
            <MenuItem
              key={option.value}
              selected={option.value === row.fulfillmentStatus}
              onClick={() => handleSelectStatus(option.value)}
            >
              <Iconify icon={option.icon} sx={{ color: option.color }} />
              {option.label}
            </MenuItem>
          ))}
        </MenuList>
      </CustomPopover>
    </>
  );
}

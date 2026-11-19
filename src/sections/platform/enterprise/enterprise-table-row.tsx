import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import TableRow from '@mui/material/TableRow';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import TableCell from '@mui/material/TableCell';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';

import { fDate } from 'src/utils/format-time';
import { formatCnpj } from 'src/utils/br-docs';
import { fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

import type { EnterpriseBillingRow } from './view/enterprise-list-view';

// ----------------------------------------------------------------------

type Props = {
  row: EnterpriseBillingRow;
  selected?: boolean;
  onSelectRow?: () => void;
  onViewRow: () => void;
  onEditRow: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function EnterpriseTableRow({
  row,
  selected,
  onSelectRow,
  onViewRow,
  onEditRow,
  visibleColumns,
}: Props) {
  const popover = usePopover();

  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const isFree = row.planCode === 'free';
  const isPro = row.planCode === 'pro';
  const isUltra = row.planCode === 'ultra';

  const planColor = isFree ? 'success' : isPro ? 'info' : isUltra ? 'warning' : 'default';

  const subStatus = row.subscriptionStatus;
  const subStatusColor =
    subStatus === 'active'
      ? 'success'
      : subStatus === 'past_due'
        ? 'error'
        : subStatus === 'incomplete'
          ? 'warning'
          : subStatus === 'canceled'
            ? 'default'
            : 'info';

  const subStatusLabel =
    subStatus === 'active'
      ? 'Assinatura ativa'
      : subStatus === 'past_due'
        ? 'Em atraso'
        : subStatus === 'incomplete'
          ? 'Incompleta'
          : subStatus === 'canceled'
            ? 'Cancelada'
            : 'Sem assinatura';

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
                  bgcolor: 'primary.lighter',
                  color: 'primary.darker',
                  fontWeight: 'bold',
                  width: 44,
                  height: 44,
                }}
              >
                {row.name?.charAt(0)?.toUpperCase() || 'E'}
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
                    {row.tradeName || row.name}
                  </Link>
                }
                secondary={
                  <Box component="div" sx={{ typography: 'caption', color: 'text.disabled' }}>
                    ID: <strong>{row.id}</strong>
                    {row.document ? ` • CNPJ: ${formatCnpj(row.document)}` : ''}
                  </Box>
                }
                sx={{ display: 'flex', flexDirection: 'column' }}
              />
            </Stack>
          </TableCell>
        )}

        {isVisible('plan') && (
          <TableCell>
            <Stack spacing={0.5}>
              <Label variant="soft" color={planColor}>
                {row.planName}
              </Label>
              {row.planPrice > 0 && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {fCurrency(row.planPrice)}/mês
                </Typography>
              )}
            </Stack>
          </TableCell>
        )}

        {isVisible('subscriptionStatus') && (
          <TableCell>
            <Stack spacing={0.5}>
              <Label variant="soft" color={subStatusColor}>
                {subStatusLabel}
              </Label>
              {row.periodEnd && (
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  Expira: {fDate(row.periodEnd)}
                </Typography>
              )}
            </Stack>
          </TableCell>
        )}

        {isVisible('active') && (
          <TableCell>
            <Label variant="soft" color={row.active ? 'success' : 'default'}>
              {row.active ? 'Ativa' : 'Inativa'}
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
            Ver Detalhes
          </MenuItem>

          <MenuItem
            onClick={() => {
              popover.onClose();
              onEditRow();
            }}
          >
            <Iconify icon="solar:pen-bold" />
            Editar Empresa
          </MenuItem>
        </MenuList>
      </CustomPopover>
    </>
  );
}

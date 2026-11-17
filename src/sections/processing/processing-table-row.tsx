import type { ProcessingOrder } from 'src/api/firestore/processing-orders';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDate, fTime } from 'src/utils/format-time';
import { fNumber, fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

// ----------------------------------------------------------------------

type Props = {
  row: ProcessingOrder;
  onViewRow: () => void;
  onViewBatches: () => void;
  onCancelRow: () => void;
};

export function ProcessingTableRow({ row, onViewRow, onViewBatches, onCancelRow }: Props) {
  const confirm = useBoolean();
  const popover = usePopover();

  const isCompleted = row.status === 'completed';
  const totalOutputsQty = (row.outputs || []).reduce((sum, out) => sum + (out.qty || 0), 0);
  const kindsCount = row.outputs?.length || 0;

  return (
    <>
      <TableRow hover tabIndex={-1}>
        <TableCell>
          <Stack spacing={2} direction="row" alignItems="center">
            <Avatar
              alt={row.rawProductName}
              sx={{
                bgcolor: isCompleted ? 'success.lighter' : 'error.lighter',
                color: isCompleted ? 'success.darker' : 'error.darker',
                fontWeight: 'bold',
              }}
            >
              {row.rawProductName?.charAt(0)?.toUpperCase() || 'P'}
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
                  {row.code || 'Ordem'}
                </Link>
              }
              secondary={
                <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                  {row.rawProductName}
                </Typography>
              }
            />
          </Stack>
        </TableCell>

        <TableCell>
          <ListItemText
            primary={row.createdAt ? fDate(row.createdAt) : '—'}
            secondary={row.createdAt ? fTime(row.createdAt) : '—'}
            primaryTypographyProps={{ typography: 'body2', noWrap: true }}
            secondaryTypographyProps={{ mt: 0.5, component: 'span', typography: 'caption' }}
          />
        </TableCell>

        <TableCell>
          <ListItemText
            primary={`${fNumber(row.rawQtyUsed)} ${row.rawUnit || 'kg'}`}
            secondary={row.rawLotCode ? `Lote: ${row.rawLotCode}` : 'Sem lote origem'}
            primaryTypographyProps={{ typography: 'body2', noWrap: true, fontWeight: 500 }}
            secondaryTypographyProps={{ mt: 0.5, component: 'span', typography: 'caption' }}
          />
        </TableCell>

        <TableCell>
          <ListItemText
            primary={`${fNumber(totalOutputsQty)} un`}
            secondary={`${kindsCount} tipo${kindsCount > 1 ? 's' : ''} gerado${kindsCount > 1 ? 's' : ''}`}
            primaryTypographyProps={{ typography: 'body2', noWrap: true }}
            secondaryTypographyProps={{ mt: 0.5, component: 'span', typography: 'caption' }}
          />
        </TableCell>

        <TableCell>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {fCurrency(row.totalCost || 0)}
          </Typography>
        </TableCell>

        <TableCell>
          <Label variant="soft" color={isCompleted ? 'success' : 'error'}>
            {isCompleted ? 'Concluída' : 'Cancelada'}
          </Label>
        </TableCell>

        <TableCell align="right" sx={{ px: 1 }}>
          <IconButton color={popover.open ? 'inherit' : 'default'} onClick={popover.onOpen}>
            <Iconify icon="eva:more-vertical-fill" />
          </IconButton>
        </TableCell>
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
            Visualizar Detalhes
          </MenuItem>

          <MenuItem
            onClick={() => {
              popover.onClose();
              onViewBatches();
            }}
          >
            <Iconify icon="solar:box-minimalistic-bold" />
            Ver Lotes Gerados
          </MenuItem>

          {isCompleted && (
            <MenuItem
              onClick={() => {
                popover.onClose();
                confirm.onTrue();
              }}
              sx={{ color: 'error.main' }}
            >
              <Iconify icon="solar:trash-bin-trash-bold" />
              Cancelar Ordem
            </MenuItem>
          )}
        </MenuList>
      </CustomPopover>

      <ConfirmDialog
        open={confirm.value}
        onClose={confirm.onFalse}
        title="Cancelar Ordem de Beneficiamento"
        content="Tem certeza que deseja cancelar esta ordem? O estoque consumido será estornado e os lotes gerados serão cancelados."
        action={
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              confirm.onFalse();
              onCancelRow();
            }}
          >
            Confirmar Cancelamento
          </Button>
        }
      />
    </>
  );
}

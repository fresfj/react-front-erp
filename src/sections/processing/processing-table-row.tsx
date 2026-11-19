import type { ProcessingOrder } from 'src/api/firestore/processing-orders';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import Checkbox from '@mui/material/Checkbox';
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
  selected?: boolean;
  onSelectRow?: () => void;
  onViewRow: () => void;
  onViewBatches: () => void;
  onCancelRow: () => void;
  visibleColumns?: Record<string, boolean>;
};

export function ProcessingTableRow({
  row,
  selected,
  onSelectRow,
  onViewRow,
  onViewBatches,
  onCancelRow,
  visibleColumns,
}: Props) {
  const confirm = useBoolean();
  const popover = usePopover();

  const isVisible = (colId: string) => visibleColumns?.[colId] !== false;
  const isCompleted = row.status === 'completed';
  const totalOutputsQty = (row.outputs || []).reduce((sum, out) => sum + (out.qty || 0), 0);
  const kindsCount = row.outputs?.length || 0;

  return (
    <>
      <TableRow hover selected={selected} aria-checked={selected} tabIndex={-1}>
        {onSelectRow && (
          <TableCell padding="checkbox">
            <Checkbox checked={selected} onClick={onSelectRow} />
          </TableCell>
        )}

        {isVisible('code') && (
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
                  <Box component="div" sx={{ typography: 'body2', color: 'text.secondary' }}>
                    {row.rawProductName}
                  </Box>
                }
                sx={{ display: 'flex', flexDirection: 'column' }}
              />
            </Stack>
          </TableCell>
        )}

        {isVisible('createdAt') && (
          <TableCell>
            <ListItemText
              primary={row.createdAt ? fDate(row.createdAt) : '—'}
              secondary={row.createdAt ? fTime(row.createdAt) : '—'}
              primaryTypographyProps={{ typography: 'body2', noWrap: true }}
              secondaryTypographyProps={{ mt: 0.5, component: 'span', typography: 'caption' }}
            />
          </TableCell>
        )}

        {isVisible('rawQtyUsed') && (
          <TableCell>
            <ListItemText
              primary={`${fNumber(row.rawQtyUsed)} ${row.rawUnit || 'kg'}`}
              secondary={row.rawLotCode ? `Lote: ${row.rawLotCode}` : 'Sem lote origem'}
              primaryTypographyProps={{ typography: 'body2', noWrap: true, fontWeight: 500 }}
              secondaryTypographyProps={{ mt: 0.5, component: 'span', typography: 'caption' }}
            />
          </TableCell>
        )}

        {isVisible('outputs') && (
          <TableCell>
            <ListItemText
              primary={`${fNumber(totalOutputsQty)} un`}
              secondary={`${kindsCount} tipo${kindsCount > 1 ? 's' : ''} gerado${kindsCount > 1 ? 's' : ''}`}
              primaryTypographyProps={{ typography: 'body2', noWrap: true }}
              secondaryTypographyProps={{ mt: 0.5, component: 'span', typography: 'caption' }}
            />
          </TableCell>
        )}

        {isVisible('totalCost') && (
          <TableCell>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {fCurrency(row.totalCost || 0)}
            </Typography>
          </TableCell>
        )}

        {isVisible('status') && (
          <TableCell>
            <Label variant="soft" color={isCompleted ? 'success' : 'error'}>
              {isCompleted ? 'Concluída' : 'Cancelada'}
            </Label>
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

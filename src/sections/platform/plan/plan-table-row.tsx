import type { Plan } from 'src/api/firestore/plans';

import TableRow from '@mui/material/TableRow';
import MenuItem from '@mui/material/MenuItem';
import TableCell from '@mui/material/TableCell';
import IconButton from '@mui/material/IconButton';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { fCurrency } from 'src/utils/format-number';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

// ----------------------------------------------------------------------

type Props = {
  row: Plan;
};

export function PlanTableRow({ row }: Props) {
  const router = useRouter();
  const popover = usePopover();

  const handleEdit = () => {
    popover.onClose();
    router.push(paths.dashboard.plans.edit(row.id));
  };

  return (
    <>
      <TableRow hover>
        <TableCell sx={{ typography: 'subtitle2' }}>{row.name}</TableCell>

        <TableCell sx={{ typography: 'body2' }}>{row.code}</TableCell>

        <TableCell sx={{ typography: 'body2' }}>
          {fCurrency(row.priceMonthly ?? 0)}
        </TableCell>

        <TableCell>
          <Label variant="soft" color={row.active ? 'success' : 'default'}>
            {row.active ? 'Ativo' : 'Inativo'}
          </Label>
        </TableCell>

        <TableCell sx={{ typography: 'body2' }}>{row.sortOrder ?? 0}</TableCell>

        <TableCell align="right">
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
        <MenuItem onClick={handleEdit}>
          <Iconify icon="solar:pen-bold" />
          Editar Plano
        </MenuItem>
      </CustomPopover>
    </>
  );
}

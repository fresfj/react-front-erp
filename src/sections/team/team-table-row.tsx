import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TableRow from '@mui/material/TableRow';
import MenuItem from '@mui/material/MenuItem';
import TableCell from '@mui/material/TableCell';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';

import {
  type TeamMember,
  ALL_MEMBER_PERMISSIONS,
} from 'src/api/firestore/members';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

// ----------------------------------------------------------------------

type Props = {
  row: TeamMember;
  isAdmin: boolean;
  onEditPermissions: () => void;
};

export function TeamTableRow({ row, isAdmin, onEditPermissions }: Props) {
  const popover = usePopover();

  const getRoleLabel = () => {
    if (row.role === 'admin') return { label: 'Admin', color: 'primary' as const };
    if (row.role === 'gestor') return { label: 'Gestor', color: 'info' as const };
    return { label: 'Operador (PDV)', color: 'warning' as const };
  };

  const roleInfo = getRoleLabel();

  return (
    <>
      <TableRow hover>
        <TableCell>
          <ListItemText
            primary={row.displayName || row.email.split('@')[0]}
            secondary={row.email}
            primaryTypographyProps={{ typography: 'subtitle2' }}
            secondaryTypographyProps={{ typography: 'caption', color: 'text.disabled' }}
          />
        </TableCell>

        <TableCell>
          <Label variant="soft" color={roleInfo.color}>
            {roleInfo.label}
          </Label>
        </TableCell>

        <TableCell>
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ py: 1 }}>
            {row.permissions.map((permKey) => {
              const meta = ALL_MEMBER_PERMISSIONS.find((p) => p.key === permKey);
              return (
                <Chip
                  key={permKey}
                  size="small"
                  variant="soft"
                  color={meta?.defaultForOperator ? 'default' : 'info'}
                  label={meta?.label || permKey}
                />
              );
            })}
          </Stack>
        </TableCell>

        <TableCell align="right">
          {isAdmin && (
            <IconButton color={popover.open ? 'inherit' : 'default'} onClick={popover.onOpen}>
              <Iconify icon="eva:more-vertical-fill" />
            </IconButton>
          )}
        </TableCell>
      </TableRow>

      {isAdmin && (
        <CustomPopover
          open={popover.open}
          anchorEl={popover.anchorEl}
          onClose={popover.onClose}
          slotProps={{ arrow: { placement: 'right-top' } }}
        >
          <MenuItem
            onClick={() => {
              popover.onClose();
              onEditPermissions();
            }}
          >
            <Iconify icon="solar:settings-bold" />
            Configurar Permissões
          </MenuItem>
        </CustomPopover>
      )}
    </>
  );
}

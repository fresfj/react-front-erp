import type { ButtonBaseProps } from '@mui/material/ButtonBase';
import type { AccessibleWorkspace } from 'src/api/firestore/platform';

import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { AUTH } from 'src/lib/firebase';
import {
  switchActiveEnterprise,
  listAccessibleWorkspaces,
} from 'src/api/firestore/platform';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export type WorkspacesPopoverProps = ButtonBaseProps & {
  data?: {
    id: string;
    name: string;
    logo: string;
    plan: string;
  }[];
};

function getPlanLabelColor(planCode?: string, planName?: string): 'default' | 'info' | 'warning' {
  const norm = String(planCode || planName || '').toLowerCase();
  if (norm === 'ultra') return 'warning';
  if (norm === 'pro') return 'info';
  return 'default';
}

export function WorkspacesPopover({ data = [], sx, ...other }: WorkspacesPopoverProps) {
  const popover = usePopover();
  const { user, checkUserSession } = useAuthContext();

  const mediaQuery = 'sm';
  const activeEnterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(Boolean(user));
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<AccessibleWorkspace[]>([]);

  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setLoading(false);
      return undefined;
    }

    let alive = true;
    setLoading(true);
    listAccessibleWorkspaces()
      .then((res) => {
        if (!alive) return;
        setWorkspaces(res.workspaces || []);
      })
      .catch(() => {
        if (!alive) return;
        setWorkspaces([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user, activeEnterpriseId]);

  const items: AccessibleWorkspace[] =
    workspaces.length > 0
      ? workspaces
      : data.map((d) => ({
          id: d.id,
          name: d.name,
          logo: d.logo,
          plan: d.plan,
          planCode: d.plan.toLowerCase(),
          role: 'admin',
        }));

  const currentWorkspace =
    items.find((item) => item.id === activeEnterpriseId) || items[0] || null;

  const canSwitch = items.length > 1;

  const handleChangeWorkspace = useCallback(
    async (target: AccessibleWorkspace) => {
      if (!target || target.id === activeEnterpriseId) {
        popover.onClose();
        return;
      }

      setSwitchingId(target.id);
      try {
        await switchActiveEnterprise(target.id);
        if (AUTH.currentUser) {
          await AUTH.currentUser.getIdToken(true);
        }
        if (checkUserSession) {
          await checkUserSession();
        }
        popover.onClose();
        toast.success(`Empresa alterada para ${target.name}`);
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Não foi possível trocar de empresa.'));
      } finally {
        setSwitchingId(null);
      }
    },
    [activeEnterpriseId, checkUserSession, popover]
  );

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
        <Skeleton animation="wave" variant="circular" width={24} height={24} />
        <Skeleton
          animation="wave"
          variant="rounded"
          width={120}
          height={20}
          sx={{ display: { xs: 'none', [mediaQuery]: 'block' } }}
        />
        <Skeleton
          animation="wave"
          variant="rounded"
          width={42}
          height={20}
          sx={{ display: { xs: 'none', [mediaQuery]: 'block' } }}
        />
      </Stack>
    );
  }

  if (!currentWorkspace) {
    return null;
  }

  const planColor = getPlanLabelColor(currentWorkspace.planCode, currentWorkspace.plan);

  return (
    <>
      <ButtonBase
        disableRipple={!canSwitch}
        onClick={canSwitch ? popover.onOpen : undefined}
        sx={{
          py: 0.5,
          px: canSwitch ? 0.75 : 0,
          borderRadius: 1,
          gap: { xs: 0.5, [mediaQuery]: 1 },
          cursor: canSwitch ? 'pointer' : 'default',
          ...sx,
        }}
        {...other}
      >
        <Avatar
          alt={currentWorkspace.name}
          src={currentWorkspace.logo || undefined}
          sx={{
            width: 26,
            height: 26,
            fontSize: 12,
            fontWeight: 700,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          }}
        >
          {currentWorkspace.name.charAt(0).toUpperCase()}
        </Avatar>

        <Typography
          variant="subtitle2"
          noWrap
          sx={{
            maxWidth: { sm: 160, md: 220 },
            display: { xs: 'none', [mediaQuery]: 'inline-block' },
          }}
        >
          {currentWorkspace.name}
        </Typography>

        <Label
          color={planColor}
          sx={{
            height: 22,
            display: { xs: 'none', [mediaQuery]: 'inline-flex' },
          }}
        >
          {currentWorkspace.plan}
        </Label>

        {canSwitch && (
          <Iconify width={16} icon="carbon:chevron-sort" sx={{ color: 'text.disabled' }} />
        )}
      </ButtonBase>

      {canSwitch && (
        <CustomPopover
          open={popover.open}
          anchorEl={popover.anchorEl}
          onClose={popover.onClose}
          slotProps={{ arrow: { placement: 'top-left' } }}
        >
          <MenuList sx={{ width: 280, maxHeight: 360, overflowY: 'auto' }}>
            {items.map((option) => {
              const isSelected = option.id === currentWorkspace.id;
              const isBusy = switchingId === option.id;
              return (
                <MenuItem
                  key={option.id}
                  selected={isSelected}
                  disabled={Boolean(switchingId)}
                  onClick={() => handleChangeWorkspace(option)}
                  sx={{ minHeight: 48, gap: 1.25 }}
                >
                  <Avatar
                    alt={option.name}
                    src={option.logo || undefined}
                    sx={{
                      width: 26,
                      height: 26,
                      fontSize: 12,
                      fontWeight: 700,
                      bgcolor: isSelected ? 'primary.main' : 'action.selected',
                      color: isSelected ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    {option.name.charAt(0).toUpperCase()}
                  </Avatar>

                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {option.name}
                    </Typography>
                  </Box>

                  {isBusy ? (
                    <CircularProgress size={16} />
                  ) : (
                    <Label color={getPlanLabelColor(option.planCode, option.plan)}>
                      {option.plan}
                    </Label>
                  )}
                </MenuItem>
              );
            })}
          </MenuList>
        </CustomPopover>
      )}
    </>
  );
}

import type { StackProps } from '@mui/material/Stack';

import { m } from 'framer-motion';
import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import { alpha as hexAlpha } from '@mui/material/styles';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { CONFIG } from 'src/config-global';
import { varAlpha, bgGradient } from 'src/theme/styles';
import { getEnterprise } from 'src/api/firestore/platform';

import { Label } from 'src/components/label';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

function planLabel(code?: string | null) {
  if (code === 'pro') return 'Pro';
  if (code === 'ultra') return 'Ultra';
  return 'Free Starter';
}

function planLabelColor(code?: string | null): 'success' | 'info' | 'warning' {
  if (code === 'pro') return 'info';
  if (code === 'ultra') return 'warning';
  return 'success';
}

// ----------------------------------------------------------------------

export function NavUpgrade({ sx, ...other }: StackProps) {
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;
  const [planCode, setPlanCode] = useState<string>('free');

  useEffect(() => {
    let cancelled = false;
    if (!enterpriseId) {
      setPlanCode('free');
      return undefined;
    }
    getEnterprise(enterpriseId)
      .then((ent) => {
        if (!cancelled) setPlanCode(ent?.subscription?.planCode || 'free');
      })
      .catch(() => {
        if (!cancelled) setPlanCode('free');
      });
    return () => {
      cancelled = true;
    };
  }, [enterpriseId]);

  const isFree = planCode === 'free';
  const billingHref = paths.dashboard.account.billing;

  return (
    <Stack sx={{ px: 2, py: 5, textAlign: 'center', ...sx }} {...other}>
      <Stack alignItems="center">
        <Box sx={{ position: 'relative' }}>
          <Avatar src={user?.photoURL} alt={user?.displayName} sx={{ width: 48, height: 48 }}>
            {user?.displayName?.charAt(0).toUpperCase()}
          </Avatar>

          <Label
            color={planLabelColor(planCode)}
            variant="filled"
            sx={{
              top: -6,
              px: 0.5,
              left: 40,
              height: 20,
              position: 'absolute',
              borderBottomLeftRadius: 2,
            }}
          >
            {planLabel(planCode)}
          </Label>
        </Box>

        <Stack spacing={0.5} sx={{ mb: 2, mt: 1.5, width: 1 }}>
          <Typography
            variant="subtitle2"
            noWrap
            sx={{ color: 'var(--layout-nav-text-primary-color)' }}
          >
            {user?.displayName}
          </Typography>

          <Typography
            variant="body2"
            noWrap
            sx={{ color: 'var(--layout-nav-text-disabled-color)' }}
          >
            {user?.email}
          </Typography>
        </Stack>

        <Button
          component={RouterLink}
          href={billingHref}
          variant="contained"
          disabled={user?.role !== 'admin'}
        >
          {isFree ? 'Upgrade to Pro' : 'Gerenciar plano'}
        </Button>
      </Stack>
    </Stack>
  );
}

// ----------------------------------------------------------------------

export function UpgradeBlock({ sx, ...other }: StackProps) {
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;
  const [planCode, setPlanCode] = useState<string>('free');

  useEffect(() => {
    let cancelled = false;
    if (!enterpriseId) return undefined;
    getEnterprise(enterpriseId)
      .then((ent) => {
        if (!cancelled) setPlanCode(ent?.subscription?.planCode || 'free');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enterpriseId]);

  const isFree = planCode === 'free';

  return (
    <Stack
      sx={{
        ...bgGradient({
          color: `135deg, ${hexAlpha('#F7BB95', 0.92)}, ${hexAlpha('#5B2FF3', 0.92)}`,
          imgUrl: `${CONFIG.site.basePath}/assets/background/background-7.webp`,
        }),
        px: 3,
        py: 4,
        borderRadius: 2,
        position: 'relative',
        ...sx,
      }}
      {...other}
    >
      <Box
        sx={{
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          borderRadius: 2,
          position: 'absolute',
          border: (theme) => `solid 3px ${varAlpha(theme.vars.palette.common.whiteChannel, 0.16)}`,
        }}
      />

      <Box
        component={m.img}
        animate={{ y: [12, -12, 12] }}
        transition={{
          duration: 8,
          ease: 'linear',
          repeat: Infinity,
          repeatDelay: 0,
        }}
        alt="Small Rocket"
        src={`${CONFIG.site.basePath}/assets/illustrations/illustration-rocket-small.webp`}
        sx={{ right: 0, width: 112, height: 112, position: 'absolute' }}
      />

      <Stack alignItems="flex-start" sx={{ position: 'relative' }}>
        <Box component="span" sx={{ typography: 'h5', color: 'common.white' }}>
          {planLabel(planCode)}
        </Box>

        <Box
          component="span"
          sx={{ mb: 2, mt: 0.5, color: 'common.white', typography: 'subtitle2' }}
        >
          {isFree ? 'Faça upgrade e libere mais recursos' : 'Gerencie sua assinatura'}
        </Box>

        <Button
          component={RouterLink}
          href={paths.dashboard.account.billing}
          variant="contained"
          size="small"
          color="warning"
          disabled={user?.role !== 'admin'}
        >
          {isFree ? 'Upgrade to Pro' : 'Assinatura'}
        </Button>
      </Stack>
    </Stack>
  );
}

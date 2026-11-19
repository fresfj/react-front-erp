import type { Theme, SxProps } from '@mui/material/styles';
import type { TenantRole } from 'src/auth/firebase-claims';
import type { MemberPermissionKey } from 'src/api/firestore/members';

import { m } from 'framer-motion';

import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

import { useTranslate } from 'src/locales';
import { ForbiddenIllustration } from 'src/assets/illustrations';

import { varBounce, MotionContainer } from 'src/components/animate';

import { useAuthContext } from 'src/auth/hooks';

import { resolvePermissionAccess } from './resolve-permission-access';

// ----------------------------------------------------------------------

export type PermissionGuardProps = {
  sx?: SxProps<Theme>;
  hasContent?: boolean;
  children: React.ReactNode;
  permission?: MemberPermissionKey | MemberPermissionKey[];
  roles?: TenantRole[];
  requirePlatformAdmin?: boolean;
};

export function PermissionGuard({
  sx,
  children,
  hasContent = true,
  permission,
  roles,
  requirePlatformAdmin,
}: PermissionGuardProps) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const allowed = resolvePermissionAccess({
    platformAdmin: Boolean(user?.platformAdmin),
    role: user?.role,
    permissions: user?.permissions as string[] | undefined,
    requirePlatformAdmin,
    roles,
    permission,
  });

  if (!allowed) {
    return hasContent ? (
      <Container component={MotionContainer} sx={{ textAlign: 'center', ...sx }}>
        <m.div variants={varBounce().in}>
          <Typography variant="h3" sx={{ mb: 2 }}>
            {t('permission.deniedTitle')}
          </Typography>
        </m.div>

        <m.div variants={varBounce().in}>
          <Typography sx={{ color: 'text.secondary' }}>
            {t('permission.deniedBody')}
          </Typography>
        </m.div>

        <m.div variants={varBounce().in}>
          <ForbiddenIllustration sx={{ my: { xs: 5, sm: 10 } }} />
        </m.div>
      </Container>
    ) : null;
  }

  return <>{children}</>;
}

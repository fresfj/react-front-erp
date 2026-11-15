import type { ButtonProps } from '@mui/material/Button';
import type { Theme, SxProps } from '@mui/material/styles';

import { useCallback } from 'react';

import Button from '@mui/material/Button';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import axios from 'src/utils/axios';

import { CONFIG } from 'src/config-global';

import { toast } from 'src/components/snackbar';

import { useAuthContext } from 'src/auth/hooks';
import { signOut as signOutJwt } from 'src/auth/context/jwt/action';
import { clearClientAuthStorage } from 'src/auth/session/erp-session';
import { signOut as signOutFirebase } from 'src/auth/context/firebase/action';

// ----------------------------------------------------------------------

type Props = ButtonProps & {
  sx?: SxProps<Theme>;
  onClose?: () => void;
};

export function SignOutButton({ onClose, ...other }: Props) {
  const router = useRouter();

  const { checkUserSession } = useAuthContext();

  const handleLogout = useCallback(async () => {
    try {
      if (CONFIG.auth.method === 'firebase') {
        await signOutFirebase();
      } else {
        await signOutJwt();
      }

      clearClientAuthStorage();
      delete axios.defaults.headers.common.Authorization;

      await checkUserSession?.();
      onClose?.();

      const signInPath =
        CONFIG.auth.method === 'firebase' ? paths.auth.firebase.signIn : paths.auth.jwt.signIn;

      router.replace(signInPath);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível sair. Tente novamente.');
    }
  }, [checkUserSession, onClose, router]);

  return (
    <Button fullWidth variant="soft" size="large" color="error" onClick={handleLogout} {...other}>
      Sair
    </Button>
  );
}
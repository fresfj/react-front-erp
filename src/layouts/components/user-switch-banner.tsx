import { useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { AUTH } from 'src/lib/firebase';
import {
  returnFromUserSwitchCf,
  getReturnSwitchSession,
  clearReturnSwitchSession,
} from 'src/api/firestore/user-switch';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

function roleLabelPt(role?: string): string {
  if (role === 'admin') return 'Administrador';
  if (role === 'gestor') return 'Gestor';
  return 'Operador';
}

export function UserSwitchBanner() {
  const { user } = useAuthContext();
  const [returning, setReturning] = useState(false);

  const returnSession = getReturnSwitchSession();
  const currentUid = (user?.uid || user?.id) as string | undefined;

  if (!returnSession || !currentUid || returnSession.targetUid !== currentUid) {
    return null;
  }

  const handleReturn = async () => {
    setReturning(true);
    try {
      const res = await returnFromUserSwitchCf(returnSession.returnSessionId);
      clearReturnSwitchSession();
      await signInWithCustomToken(AUTH, res.customToken);
      toast.success(`Retornou para ${returnSession.originalName}`);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Não foi possível retornar para sua conta.'));
    } finally {
      setReturning(false);
    }
  };

  return (
    <Box
      sx={{
        px: 2,
        py: 0.75,
        bgcolor: 'warning.main',
        color: 'warning.contrastText',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems="center"
        justifyContent="center"
      >
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Iconify icon="solar:user-id-bold" width={18} />
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            Visualizando como {returnSession.targetName} ({roleLabelPt(returnSession.targetRole)})
          </Typography>
        </Stack>

        <LoadingButton
          size="small"
          variant="contained"
          color="inherit"
          loading={returning}
          onClick={handleReturn}
          startIcon={<Iconify icon="solar:undo-left-bold" width={16} />}
          sx={{
            py: 0.25,
            px: 1.25,
            fontSize: 12,
            bgcolor: 'common.black',
            color: 'common.white',
            '&:hover': { bgcolor: 'grey.800' },
          }}
        >
          Voltar para {returnSession.originalName}
        </LoadingButton>
      </Stack>
    </Box>
  );
}

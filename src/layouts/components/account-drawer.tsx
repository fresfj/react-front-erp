import type { IconButtonProps } from '@mui/material/IconButton';
import type { SwitchableMember } from 'src/api/firestore/user-switch';

import { signInWithCustomToken } from 'firebase/auth';
import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import { paths } from 'src/routes/paths';
import { useRouter, usePathname } from 'src/routes/hooks';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { AUTH } from 'src/lib/firebase';
import { varAlpha } from 'src/theme/styles';
import {
  switchUserSessionCf,
  returnFromUserSwitchCf,
  getReturnSwitchSession,
  listSwitchableMembersCf,
  saveReturnSwitchSession,
  clearReturnSwitchSession,
} from 'src/api/firestore/user-switch';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { AnimateAvatar } from 'src/components/animate';

import { useAuthContext } from 'src/auth/hooks';

import { UpgradeBlock } from './nav-upgrade';
import { AccountButton } from './account-button';
import { SignOutButton } from './sign-out-button';

// ----------------------------------------------------------------------

export type AccountDrawerProps = IconButtonProps & {
  data?: {
    label: string;
    href: string;
    icon?: React.ReactNode;
    info?: React.ReactNode;
  }[];
};

function roleLabelPt(role?: string): string {
  if (role === 'admin') return 'Administrador';
  if (role === 'gestor') return 'Gestor';
  return 'Operador';
}

export function AccountDrawer({ data = [], sx, ...other }: AccountDrawerProps) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const currentUid = (user?.uid || user?.id) as string | undefined;

  const [open, setOpen] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [members, setMembers] = useState<SwitchableMember[]>([]);
  const [canDirectSwitch, setCanDirectSwitch] = useState(false);
  const [switchingUid, setSwitchingUid] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);

  const [pinTarget, setPinTarget] = useState<SwitchableMember | null>(null);
  const [pinValue, setPinValue] = useState('');

  const returnSession = getReturnSwitchSession();
  const hasActiveReturn = Boolean(
    returnSession && currentUid && returnSession.targetUid === currentUid
  );

  useEffect(() => {
    if (!open || !enterpriseId) return undefined;
    let alive = true;
    setLoadingMembers(true);
    listSwitchableMembersCf(enterpriseId)
      .then((res) => {
        if (!alive) return;
        setMembers(res.members || []);
        setCanDirectSwitch(Boolean(res.canDirectSwitch));
      })
      .catch(() => {
        if (!alive) return;
        setMembers([]);
      })
      .finally(() => {
        if (alive) setLoadingMembers(false);
      });
    return () => {
      alive = false;
    };
  }, [open, enterpriseId, currentUid]);

  const handleOpenDrawer = useCallback(() => {
    setOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setOpen(false);
  }, []);

  const handleClickItem = useCallback(
    (path: string) => {
      handleCloseDrawer();
      router.push(path);
    },
    [handleCloseDrawer, router]
  );

  const executeSwitch = async (target: SwitchableMember, pin?: string) => {
    if (!enterpriseId) return;
    setSwitchingUid(target.uid);
    try {
      const res = await switchUserSessionCf({
        enterpriseId,
        targetUid: target.uid,
        ...(pin ? { pin } : {}),
      });

      if (res.returnSessionId) {
        saveReturnSwitchSession({
          returnSessionId: res.returnSessionId,
          originalName: String(user?.displayName || user?.email || 'Admin'),
          targetUid: res.targetUser.uid,
          targetName: res.targetUser.displayName,
          targetRole: res.targetUser.role,
        });
      } else {
        clearReturnSwitchSession();
      }

      await signInWithCustomToken(AUTH, res.customToken);
      setPinTarget(null);
      setPinValue('');
      handleCloseDrawer();
      toast.success(`Sessão alterada para ${res.targetUser.displayName}`);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Não foi possível trocar de usuário.'));
    } finally {
      setSwitchingUid(null);
    }
  };

  const handleSelectMember = (member: SwitchableMember) => {
    if (switchingUid) return;
    if (canDirectSwitch) {
      executeSwitch(member);
    } else {
      setPinTarget(member);
      setPinValue('');
    }
  };

  const handleReturnOriginal = async () => {
    if (!returnSession) return;
    setReturning(true);
    try {
      const res = await returnFromUserSwitchCf(returnSession.returnSessionId);
      clearReturnSwitchSession();
      await signInWithCustomToken(AUTH, res.customToken);
      handleCloseDrawer();
      toast.success(`Retornou para ${returnSession.originalName}`);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Não foi possível retornar para sua conta.'));
    } finally {
      setReturning(false);
    }
  };

  const renderAvatar = (
    <AnimateAvatar
      width={96}
      slotProps={{
        avatar: { src: user?.photoURL, alt: user?.displayName },
        overlay: {
          border: 2,
          spacing: 3,
          color: `linear-gradient(135deg, ${varAlpha(theme.vars.palette.primary.mainChannel, 0)} 25%, ${theme.vars.palette.primary.main} 100%)`,
        },
      }}
    >
      {user?.displayName?.charAt(0).toUpperCase()}
    </AnimateAvatar>
  );

  return (
    <>
      <AccountButton
        open={open}
        onClick={handleOpenDrawer}
        photoURL={user?.photoURL}
        displayName={user?.displayName}
        sx={sx}
        {...other}
      />

      <Drawer
        open={open}
        onClose={handleCloseDrawer}
        anchor="right"
        slotProps={{ backdrop: { invisible: true } }}
        PaperProps={{ sx: { width: 320 } }}
      >
        <IconButton
          onClick={handleCloseDrawer}
          sx={{ top: 12, left: 12, zIndex: 9, position: 'absolute' }}
        >
          <Iconify icon="mingcute:close-line" />
        </IconButton>

        <Scrollbar>
          <Stack alignItems="center" sx={{ pt: 8, px: 2 }}>
            {renderAvatar}

            <Typography variant="subtitle1" noWrap sx={{ mt: 2 }}>
              {user?.displayName}
            </Typography>

            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }} noWrap>
              {user?.email}
            </Typography>

            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" sx={{ mt: 1.5 }}>
              {user?.platformAdmin && (
                <Label color="warning" variant="soft">
                  Platform Admin
                </Label>
              )}
              {user?.role && (
                <Label color="info" variant="soft">
                  {roleLabelPt(user.role)}
                </Label>
              )}
            </Stack>
          </Stack>

          {/* Retorno rápido para Admin quando em modo "Visualizando como" */}
          {hasActiveReturn && returnSession && (
            <Box sx={{ px: 2.5, pt: 2 }}>
              <LoadingButton
                fullWidth
                size="small"
                variant="soft"
                color="warning"
                loading={returning}
                onClick={handleReturnOriginal}
                startIcon={<Iconify icon="solar:undo-left-bold" />}
              >
                Voltar para {returnSession.originalName}
              </LoadingButton>
            </Box>
          )}

          {/* Troca rápida de usuário (Admin direto / Operadores via PIN) */}
          <Stack alignItems="center" spacing={1} sx={{ p: 3 }}>
            {loadingMembers ? (
              <Stack direction="row" spacing={1} justifyContent="center">
                <Skeleton animation="wave" variant="circular" width={40} height={40} />
                <Skeleton animation="wave" variant="circular" width={40} height={40} />
                <Skeleton animation="wave" variant="circular" width={40} height={40} />
              </Stack>
            ) : members.length > 0 ? (
              <>
                <Typography variant="caption" color="text.secondary">
                  {canDirectSwitch
                    ? 'Trocar usuário (acesso direto Admin)'
                    : 'Troca rápida de operador (PIN)'}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
                  {members.slice(0, 6).map((member) => {
                    const isBusy = switchingUid === member.uid;
                    return (
                      <Tooltip
                        key={member.uid}
                        title={`Trocar para: ${member.displayName} (${roleLabelPt(member.role)})${
                          !canDirectSwitch ? ' • Requer PIN' : ''
                        }`}
                      >
                        <Avatar
                          alt={member.displayName}
                          src={member.photoURL || undefined}
                          onClick={() => handleSelectMember(member)}
                          sx={{
                            cursor: switchingUid ? 'wait' : 'pointer',
                            opacity: isBusy ? 0.5 : 1,
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            fontWeight: 700,
                            border: `2px solid ${theme.vars.palette.background.paper}`,
                            transition: theme.transitions.create('transform'),
                            '&:hover': { transform: 'scale(1.08)' },
                          }}
                        >
                          {member.displayName.charAt(0).toUpperCase()}
                        </Avatar>
                      </Tooltip>
                    );
                  })}
                </Stack>
              </>
            ) : null}
          </Stack>

          <Stack
            sx={{
              py: 3,
              px: 2.5,
              borderTop: `dashed 1px ${theme.vars.palette.divider}`,
              borderBottom: `dashed 1px ${theme.vars.palette.divider}`,
            }}
          >
            {data.map((option) => {
              const rootLabel = pathname.includes('/dashboard') ? 'Home' : 'Dashboard';

              const rootHref = pathname.includes('/dashboard') ? '/' : paths.dashboard.root;

              return (
                <MenuItem
                  key={option.label}
                  onClick={() => handleClickItem(option.label === 'Home' ? rootHref : option.href)}
                  sx={{
                    py: 1,
                    color: 'text.secondary',
                    '& svg': { width: 24, height: 24 },
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {option.icon}

                  <Box component="span" sx={{ ml: 2 }}>
                    {option.label === 'Home' ? rootLabel : option.label}
                  </Box>

                  {option.info && (
                    <Label color="error" sx={{ ml: 1 }}>
                      {option.info}
                    </Label>
                  )}
                </MenuItem>
              );
            })}
          </Stack>

          <Box sx={{ px: 2.5, py: 3 }}>
            <UpgradeBlock />
          </Box>
        </Scrollbar>

        <Box sx={{ p: 2.5 }}>
          <SignOutButton onClose={handleCloseDrawer} />
        </Box>
      </Drawer>

      {/* Dialog de PIN para troca rápida de operador (PDV) */}
      <Dialog
        open={Boolean(pinTarget)}
        onClose={() => {
          if (!switchingUid) {
            setPinTarget(null);
            setPinValue('');
          }
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Trocar para {pinTarget?.displayName}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Informe o PIN numérico (4 a 6 dígitos) configurado por{' '}
            <strong>{pinTarget?.displayName}</strong> ({roleLabelPt(pinTarget?.role)}) para
            alternar o operador.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="PIN de acesso rápido"
            placeholder="Digite 4 a 6 dígitos"
            value={pinValue}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pinTarget && pinValue.length >= 4) {
                executeSwitch(pinTarget, pinValue);
              }
            }}
            inputProps={{ inputMode: 'numeric', maxLength: 6 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setPinTarget(null);
              setPinValue('');
            }}
            disabled={Boolean(switchingUid)}
          >
            Cancelar
          </Button>
          <LoadingButton
            variant="contained"
            loading={Boolean(switchingUid)}
            disabled={pinValue.length < 4}
            onClick={() => pinTarget && executeSwitch(pinTarget, pinValue)}
          >
            Confirmar troca
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

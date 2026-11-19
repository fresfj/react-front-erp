import type { UserInfo } from 'firebase/auth';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  unlink,
  linkWithPopup,
  updatePassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { AUTH } from 'src/lib/firebase';
import { useTranslate } from 'src/locales';
import { setMemberQuickPinCf } from 'src/api/firestore/user-switch';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';
import { ConfirmDialog } from 'src/components/custom-dialog';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export type ChangePasswordSchemaType = zod.infer<typeof ChangePasswordSchema>;

export const ChangePasswordSchema = zod
  .object({
    oldPassword: zod.string().min(1, { message: 'Required' }).min(6, { message: 'Min 6' }),
    newPassword: zod.string().min(1, { message: 'Required' }).min(6, { message: 'Min 6' }),
    confirmNewPassword: zod.string().min(1, { message: 'Required' }),
  })
  .refine((data) => data.oldPassword !== data.newPassword, {
    message: 'Different',
    path: ['newPassword'],
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Mismatch',
    path: ['confirmNewPassword'],
  });

function passwordErrorKey(code: string | undefined): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'account.password.wrongPassword';
    case 'auth/weak-password':
      return 'account.password.weakPassword';
    case 'auth/requires-recent-login':
      return 'account.password.requiresRecentLogin';
    case 'auth/too-many-requests':
      return 'account.password.tooManyRequests';
    case 'auth/user-mismatch':
    case 'auth/user-not-found':
      return 'account.password.userMismatch';
    default:
      return 'account.password.updateError';
  }
}

function extractAuthCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: string }).code)
    : undefined;
}

// ----------------------------------------------------------------------

export function AccountChangePasswordForm() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const password = useBoolean();
  const openLinked = useBoolean(true);
  const openPin = useBoolean(true);
  const openPassword = useBoolean(true);
  const confirmUnlink = useBoolean();

  const [quickPin, setQuickPin] = useState('');
  const [confirmQuickPin, setConfirmQuickPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const [providers, setProviders] = useState<UserInfo[]>(
    () => AUTH.currentUser?.providerData ?? []
  );
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [unlinkingGoogle, setUnlinkingGoogle] = useState(false);

  useEffect(() => {
    setProviders(AUTH.currentUser?.providerData ?? []);
  }, []);

  const syncProviders = () => {
    setProviders([...(AUTH.currentUser?.providerData ?? [])]);
  };

  const googleProvider = providers.find((item) => item.providerId === 'google.com');
  const passwordProvider = providers.find((item) => item.providerId === 'password');
  const isGoogleLinked = Boolean(googleProvider);
  const hasPasswordProvider = Boolean(passwordProvider);
  const canUnlinkGoogle = isGoogleLinked && providers.length > 1;

  const defaultValues = { oldPassword: '', newPassword: '', confirmNewPassword: '' };

  const methods = useForm<ChangePasswordSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues,
  });

  const {
    reset,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const handleLinkGoogle = async () => {
    const { currentUser } = AUTH;
    if (!currentUser) return;

    setLinkingGoogle(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await linkWithPopup(currentUser, provider);
      await currentUser.reload();
      syncProviders();
      toast.success(t('account.linkedAccounts.linkSuccess'));
    } catch (error) {
      const code = extractAuthCode(error);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        toast.info(t('account.linkedAccounts.popupCancelled'));
      } else if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        toast.error(t('account.linkedAccounts.alreadyInUse'));
      } else if (code === 'auth/provider-already-linked') {
        await currentUser.reload();
        syncProviders();
        toast.info(t('account.linkedAccounts.alreadyLinked'));
      } else if (code === 'auth/requires-recent-login') {
        toast.error(t('account.linkedAccounts.requiresRecentLogin'));
      } else {
        console.error('Link Google error:', error);
        toast.error(t('account.linkedAccounts.linkError'));
      }
    } finally {
      setLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    const { currentUser } = AUTH;
    if (!currentUser || !canUnlinkGoogle) return;

    setUnlinkingGoogle(true);
    try {
      await unlink(currentUser, 'google.com');
      await currentUser.reload();
      syncProviders();
      confirmUnlink.onFalse();
      toast.success(t('account.linkedAccounts.unlinkSuccess'));
    } catch (error) {
      const code = extractAuthCode(error);
      if (code === 'auth/requires-recent-login') {
        toast.error(t('account.linkedAccounts.requiresRecentLogin'));
      } else {
        console.error('Unlink Google error:', error);
        toast.error(t('account.linkedAccounts.unlinkError'));
      }
    } finally {
      setUnlinkingGoogle(false);
    }
  };

  const handleSaveQuickPin = async () => {
    if (!/^\d{4,6}$/.test(quickPin)) {
      toast.error('O PIN deve conter entre 4 e 6 dígitos numéricos.');
      return;
    }
    if (quickPin !== confirmQuickPin) {
      toast.error('Os PINs digitados não conferem.');
      return;
    }
    setSavingPin(true);
    try {
      await setMemberQuickPinCf({
        pin: quickPin,
        enterpriseId: (user?.enterpriseId as string | undefined) || undefined,
      });
      setQuickPin('');
      setConfirmQuickPin('');
      toast.success('PIN de troca rápida salvo com sucesso!');
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Não foi possível salvar o PIN.'));
    } finally {
      setSavingPin(false);
    }
  };

  const onSubmit = handleSubmit(async (data) => {
    const { currentUser } = AUTH;

    if (!currentUser?.email) {
      toast.error(t('account.password.noEmailUser'));
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, data.oldPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, data.newPassword);
      reset();
      toast.success(t('account.password.updateSuccess'));
    } catch (error) {
      console.error(error);
      toast.error(t(passwordErrorKey(extractAuthCode(error))));
    }
  });

  return (
    <>
      <Stack spacing={3} sx={{ mx: 'auto', width: 1, maxWidth: { xs: 720, xl: 880 } }}>
        {/* Card 1: Contas vinculadas (E-mail/Senha + Google) */}
        <Card>
          <CardHeader
            title={t('account.linkedAccounts.title')}
            subheader={t('account.linkedAccounts.subheader')}
            action={
              <IconButton onClick={openLinked.onToggle}>
                <Iconify
                  icon={
                    openLinked.value
                      ? 'eva:arrow-ios-upward-fill'
                      : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: 3 }}
          />
          <Collapse in={openLinked.value}>
            <Divider />
            <Stack spacing={2} sx={{ p: 3 }}>
              {/* Provedor E-mail e Senha */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ sm: 'center' }}
                justifyContent="space-between"
                sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}
              >
                <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 1.25,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'background.paper',
                      flexShrink: 0,
                    }}
                  >
                    <Iconify icon="solar:letter-bold" width={22} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="subtitle2">
                        {t('account.linkedAccounts.emailPasswordTitle')}
                      </Typography>
                      <Label
                        variant="soft"
                        color={hasPasswordProvider ? 'success' : 'default'}
                      >
                        {hasPasswordProvider
                          ? t('account.linkedAccounts.linked')
                          : t('account.linkedAccounts.notLinked')}
                      </Label>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                      {passwordProvider?.email || AUTH.currentUser?.email || '—'}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>

              {/* Provedor Google */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ sm: 'center' }}
                justifyContent="space-between"
                sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}
              >
                <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 1.25,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'background.paper',
                      flexShrink: 0,
                    }}
                  >
                    <Iconify icon="logos:google-icon" width={22} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="subtitle2">
                        {t('account.linkedAccounts.googleTitle')}
                      </Typography>
                      <Label variant="soft" color={isGoogleLinked ? 'success' : 'default'}>
                        {isGoogleLinked
                          ? t('account.linkedAccounts.linked')
                          : t('account.linkedAccounts.notLinked')}
                      </Label>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                      {isGoogleLinked
                        ? googleProvider?.email || googleProvider?.displayName || 'Google'
                        : t('account.linkedAccounts.googleHint')}
                    </Typography>
                  </Box>
                </Stack>

                <Box sx={{ flexShrink: 0 }}>
                  {isGoogleLinked ? (
                    <LoadingButton
                      variant="outlined"
                      color="error"
                      loading={unlinkingGoogle}
                      disabled={!canUnlinkGoogle}
                      onClick={confirmUnlink.onTrue}
                    >
                      {t('account.linkedAccounts.unlink')}
                    </LoadingButton>
                  ) : (
                    <LoadingButton
                      variant="outlined"
                      color="inherit"
                      loading={linkingGoogle}
                      onClick={handleLinkGoogle}
                      startIcon={<Iconify icon="logos:google-icon" width={18} />}
                    >
                      {t('account.linkedAccounts.linkGoogle')}
                    </LoadingButton>
                  )}
                </Box>
              </Stack>

              {isGoogleLinked && !canUnlinkGoogle && (
                <Typography variant="caption" color="text.secondary">
                  {t('account.linkedAccounts.cannotUnlinkOnly')}
                </Typography>
              )}
            </Stack>
          </Collapse>
        </Card>

        {/* Card 2: PIN de Troca Rápida (PDV) */}
        <Card>
          <CardHeader
            title="PIN de Troca Rápida (PDV)"
            subheader="Defina um PIN de 4 a 6 dígitos para alternar rapidamente entre operadores no caixa"
            action={
              <IconButton onClick={openPin.onToggle}>
                <Iconify
                  icon={
                    openPin.value ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: 3 }}
          />
          <Collapse in={openPin.value}>
            <Divider />
            <Stack spacing={2.5} sx={{ p: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  type="password"
                  label="Novo PIN (4 a 6 dígitos)"
                  placeholder="Ex.: 1234"
                  value={quickPin}
                  onChange={(e) => setQuickPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                />
                <TextField
                  fullWidth
                  type="password"
                  label="Confirmar PIN"
                  placeholder="Repita o PIN"
                  value={confirmQuickPin}
                  onChange={(e) =>
                    setConfirmQuickPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                />
              </Stack>
              <LoadingButton
                variant="contained"
                loading={savingPin}
                disabled={quickPin.length < 4 || confirmQuickPin.length < 4}
                onClick={handleSaveQuickPin}
                sx={{ ml: 'auto' }}
              >
                Salvar PIN
              </LoadingButton>
            </Stack>
          </Collapse>
        </Card>

        {/* Card 3: Alterar senha */}
        <Form methods={methods} onSubmit={onSubmit}>
          <Card>
            <CardHeader
              title={t('account.password.cardTitle')}
              subheader={t('account.password.cardSubheader')}
              action={
                <IconButton onClick={openPassword.onToggle}>
                  <Iconify
                    icon={
                      openPassword.value
                        ? 'eva:arrow-ios-upward-fill'
                        : 'eva:arrow-ios-downward-fill'
                    }
                  />
                </IconButton>
              }
              sx={{ mb: 3 }}
            />
            <Collapse in={openPassword.value}>
              <Divider />
              <Stack spacing={3} sx={{ p: 3 }}>
                {!hasPasswordProvider ? (
                  <Alert severity="info">{t('account.password.googleOnlyHint')}</Alert>
                ) : (
                  <>
                    <Field.Text
                      name="oldPassword"
                      type={password.value ? 'text' : 'password'}
                      label={t('account.password.oldPassword')}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={password.onToggle} edge="end">
                              <Iconify
                                icon={
                                  password.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'
                                }
                              />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />

                    <Field.Text
                      name="newPassword"
                      label={t('account.password.newPassword')}
                      type={password.value ? 'text' : 'password'}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={password.onToggle} edge="end">
                              <Iconify
                                icon={
                                  password.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'
                                }
                              />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      helperText={
                        <Stack component="span" direction="row" alignItems="center">
                          <Iconify icon="eva:info-fill" width={16} sx={{ mr: 0.5 }} />
                          {t('account.password.minLengthHint')}
                        </Stack>
                      }
                    />

                    <Field.Text
                      name="confirmNewPassword"
                      type={password.value ? 'text' : 'password'}
                      label={t('account.password.confirmNewPassword')}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={password.onToggle} edge="end">
                              <Iconify
                                icon={
                                  password.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'
                                }
                              />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />

                    <LoadingButton
                      type="submit"
                      variant="contained"
                      loading={isSubmitting}
                      sx={{ ml: 'auto' }}
                    >
                      {t('account.saveSubmit')}
                    </LoadingButton>
                  </>
                )}
              </Stack>
            </Collapse>
          </Card>
        </Form>
      </Stack>

      <ConfirmDialog
        open={confirmUnlink.value}
        onClose={confirmUnlink.onFalse}
        title={t('account.linkedAccounts.confirmUnlinkTitle')}
        content={t('account.linkedAccounts.confirmUnlinkContent')}
        action={
          <Button
            variant="contained"
            color="error"
            disabled={unlinkingGoogle}
            onClick={handleUnlinkGoogle}
          >
            {t('account.linkedAccounts.unlink')}
          </Button>
        }
      />
    </>
  );
}

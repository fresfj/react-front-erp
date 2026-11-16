import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';

import { useBoolean } from 'src/hooks/use-boolean';

import { AUTH } from 'src/lib/firebase';
import { useTranslate } from 'src/locales';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

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

// ----------------------------------------------------------------------

export function AccountChangePasswordForm() {
  const { t } = useTranslate('common');
  const password = useBoolean();

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

  const onSubmit = handleSubmit(async (data) => {
    const {currentUser} = AUTH;

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
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined;
      toast.error(t(passwordErrorKey(code)));
    }
  });

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Card sx={{ p: 3, gap: 3, display: 'flex', flexDirection: 'column' }}>
        <Field.Text
          name="oldPassword"
          type={password.value ? 'text' : 'password'}
          label={t('account.password.oldPassword')}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={password.onToggle} edge="end">
                  <Iconify icon={password.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'} />
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
                  <Iconify icon={password.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'} />
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
                  <Iconify icon={password.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <LoadingButton type="submit" variant="contained" loading={isSubmitting} sx={{ ml: 'auto' }}>
          {t('account.saveSubmit')}
        </LoadingButton>
      </Card>
    </Form>
  );
}

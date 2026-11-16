import type { MemberProfile } from 'src/api/firestore/members';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useEffect, useCallback } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateProfile } from 'firebase/auth';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Unstable_Grid2';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { fData } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';
import { AUTH } from 'src/lib/firebase';
import { getMember, setMember } from 'src/api/firestore/members';
import { uploadMemberAvatar } from 'src/api/firestore/storage';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export const AccountGeneralSchema = zod.object({
  displayName: zod.string().min(1, { message: 'Required' }),
  email: zod.string().email().or(zod.literal('')),
  phone: zod.string().optional().or(zod.literal('')),
  photoURL: zod.any().optional().nullable(),
});

export type AccountGeneralSchemaType = zod.infer<typeof AccountGeneralSchema>;

// ----------------------------------------------------------------------

export function AccountGeneralForm() {
  const { t } = useTranslate('common');
  const { user, checkUserSession } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const uid = user?.uid as string | undefined;

  const defaultValues = useMemo<AccountGeneralSchemaType>(
    () => ({
      displayName: user?.displayName || '',
      email: user?.email || '',
      phone: '',
      photoURL: user?.photoURL || null,
    }),
    [user]
  );

  const methods = useForm<AccountGeneralSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(AccountGeneralSchema),
    defaultValues,
  });

  const {
    reset,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!enterpriseId || !uid) {
        reset(defaultValues);
        return;
      }

      try {
        const member: MemberProfile | null = await getMember(enterpriseId, uid);
        if (cancelled) return;

        reset({
          displayName: member?.displayName || user?.displayName || '',
          email: user?.email || '',
          phone: member?.phone || '',
          photoURL: member?.photoURL || user?.photoURL || null,
        });
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          toast.error(t('account.loadError'));
          reset(defaultValues);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [defaultValues, enterpriseId, reset, t, uid, user?.displayName, user?.email, user?.photoURL]);

  const handleDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      const newFile = Object.assign(file, {
        preview: URL.createObjectURL(file),
      });

      setValue('photoURL', newFile, { shouldValidate: true });
    },
    [setValue]
  );

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId || !uid) {
      toast.error(t('account.errorMissingEnterprise'));
      return;
    }

    try {
      let photoURL =
        typeof data.photoURL === 'string' ? data.photoURL.trim() : (user?.photoURL as string) || '';

      if (data.photoURL instanceof File) {
        photoURL = await uploadMemberAvatar(enterpriseId, uid, data.photoURL);
      }

      await setMember(enterpriseId, uid, {
        displayName: data.displayName.trim(),
        phone: data.phone?.trim() || '',
        photoURL: photoURL || '',
      });

      const authUser = AUTH.currentUser;
      if (authUser) {
        await updateProfile(authUser, {
          displayName: data.displayName.trim(),
          photoURL: photoURL || null,
        });
        await checkUserSession?.();
      }

      toast.success(t('account.updateSuccess'));
      reset({
        ...data,
        photoURL: photoURL || null,
      });
    } catch (error) {
      console.error(error);
      toast.error(t('account.updateError'));
    }
  });

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Grid container spacing={3}>
        <Grid xs={12} md={4}>
          <Card sx={{ pt: 10, pb: 5, px: 3, textAlign: 'center' }}>
            <Field.UploadAvatar
              name="photoURL"
              maxSize={3145728}
              onDrop={handleDrop}
              helperText={
                <Typography
                  variant="caption"
                  sx={{
                    mt: 3,
                    mx: 'auto',
                    display: 'block',
                    textAlign: 'center',
                    color: 'text.disabled',
                  }}
                >
                  {t('account.avatarHint', { size: fData(3145728) })}
                </Typography>
              }
            />
          </Card>
        </Grid>

        <Grid xs={12} md={8}>
          <Card sx={{ p: 3 }}>
            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
            >
              <Field.Text name="displayName" label={t('account.fields.displayName')} />
              <Field.Text name="email" label={t('account.fields.email')} disabled />
              <Field.Phone name="phone" label={t('account.fields.phone')} country="BR" />
            </Box>

            <Stack alignItems="flex-end" sx={{ mt: 3 }}>
              <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
                {t('account.saveSubmit')}
              </LoadingButton>
            </Stack>
          </Card>
        </Grid>
      </Grid>
    </Form>
  );
}

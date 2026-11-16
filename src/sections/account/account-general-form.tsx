import type { MemberProfile } from 'src/api/firestore/members';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import LoadingButton from '@mui/lab/LoadingButton';

import { useTranslate } from 'src/locales';
import { getMember, setMember } from 'src/api/firestore/members';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export const AccountGeneralSchema = zod.object({
  displayName: zod.string().min(1, { message: 'Required' }),
  email: zod.string().email().or(zod.literal('')),
  phone: zod.string().optional().or(zod.literal('')),
  photoURL: zod.string().optional().or(zod.literal('')),
});

export type AccountGeneralSchemaType = zod.infer<typeof AccountGeneralSchema>;

// ----------------------------------------------------------------------

export function AccountGeneralForm() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const uid = user?.uid as string | undefined;

  const defaultValues = useMemo<AccountGeneralSchemaType>(
    () => ({
      displayName: user?.displayName || '',
      email: user?.email || '',
      phone: '',
      photoURL: user?.photoURL || '',
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
          photoURL: member?.photoURL || user?.photoURL || '',
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

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId || !uid) {
      toast.error(t('account.errorMissingEnterprise'));
      return;
    }

    try {
      await setMember(enterpriseId, uid, {
        displayName: data.displayName.trim(),
        phone: data.phone?.trim() || '',
        photoURL: data.photoURL?.trim() || '',
      });
      toast.success(t('account.updateSuccess'));
    } catch (error) {
      console.error(error);
      toast.error(t('account.updateError'));
    }
  });

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Card sx={{ p: 3 }}>
        <Box
          rowGap={3}
          columnGap={2}
          display="grid"
          gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
        >
          <Field.Text name="displayName" label={t('account.fields.displayName')} />
          <Field.Text name="email" label={t('account.fields.email')} disabled />
          <Field.Text name="phone" label={t('account.fields.phone')} />
          <Field.Text name="photoURL" label={t('account.fields.photoURL')} />
        </Box>

        <Stack alignItems="flex-end" sx={{ mt: 3 }}>
          <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
            {t('account.saveSubmit')}
          </LoadingButton>
        </Stack>
      </Card>
    </Form>
  );
}

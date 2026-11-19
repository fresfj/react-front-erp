import type { MemberProfile } from 'src/api/firestore/members';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { updateProfile } from 'firebase/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Unstable_Grid2';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { useCepLookup } from 'src/hooks/use-cep-lookup';

import { fData } from 'src/utils/format-number';
import { formatCep, digitsOnly } from 'src/utils/br-docs';

import { AUTH } from 'src/lib/firebase';
import { useTranslate } from 'src/locales';
import { uploadMemberAvatar } from 'src/api/firestore/storage';
import { getMember, setMember } from 'src/api/firestore/members';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export const AccountGeneralSchema = zod.object({
  displayName: zod.string().min(1, { message: 'Required' }),
  email: zod.string().email().or(zod.literal('')),
  phone: zod.string().optional().or(zod.literal('')),
  birthDate: zod.string().optional().or(zod.literal('')),
  zipCode: zod.string().optional().or(zod.literal('')),
  address: zod.string().optional().or(zod.literal('')),
  addressNumber: zod.string().optional().or(zod.literal('')),
  complement: zod.string().optional().or(zod.literal('')),
  neighborhood: zod.string().optional().or(zod.literal('')),
  city: zod.string().optional().or(zod.literal('')),
  state: zod.string().optional().or(zod.literal('')),
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
      birthDate: '',
      zipCode: '',
      address: '',
      addressNumber: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
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
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const zipCodeWatch = watch('zipCode') || '';

  const { handleBlur: handleCepBlur } = useCepLookup({
    cep: zipCodeWatch,
    initialValue: methods.getValues('zipCode'),
    onSuccess: (fields) => {
      setValue('zipCode', formatCep(fields.zipCode), { shouldDirty: true });
      if (fields.address) setValue('address', fields.address, { shouldDirty: true });
      if (fields.neighborhood) {
        setValue('neighborhood', fields.neighborhood, { shouldDirty: true });
      }
      if (fields.city) setValue('city', fields.city, { shouldDirty: true });
      if (fields.state) setValue('state', fields.state, { shouldDirty: true });
      toast.success(t('brasilapi.cepSuccess', { defaultValue: 'Endereço preenchido pelo CEP' }));
    },
    onError: (code) => {
      toast.error(
        code === 'CEP_NOT_FOUND'
          ? t('brasilapi.cepNotFound', { defaultValue: 'CEP não encontrado' })
          : t('brasilapi.cepError', { defaultValue: 'Falha ao consultar CEP' })
      );
    },
  });

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
          birthDate: member?.birthDate || '',
          zipCode: formatCep(member?.zipCode || ''),
          address: member?.address || '',
          addressNumber: member?.addressNumber || '',
          complement: member?.complement || '',
          neighborhood: member?.neighborhood || '',
          city: member?.city || '',
          state: member?.state || '',
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
        phone: digitsOnly(data.phone) || data.phone?.trim() || '',
        photoURL: photoURL || '',
        birthDate: data.birthDate?.trim() || '',
        zipCode: digitsOnly(data.zipCode) || '',
        address: data.address?.trim() || '',
        addressNumber: data.addressNumber?.trim() || '',
        complement: data.complement?.trim() || '',
        neighborhood: data.neighborhood?.trim() || '',
        city: data.city?.trim() || '',
        state: data.state?.trim() || '',
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
        zipCode: formatCep(data.zipCode || ''),
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
              <Field.DatePicker
                name="birthDate"
                label={t('account.fields.birthDate', { defaultValue: 'Data de nascimento' })}
              />
            </Box>

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              {t('account.addressSection', { defaultValue: 'Endereço' })}
            </Typography>

            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: '1fr 2fr 1fr' }}
            >
              <Field.Text
                name="zipCode"
                label={t('account.fields.zipCode', { defaultValue: 'CEP' })}
                placeholder="00000-000"
                value={formatCep(zipCodeWatch)}
                onChange={(event) => {
                  setValue('zipCode', formatCep(event.target.value), { shouldDirty: true });
                }}
                onBlur={handleCepBlur}
              />
              <Field.Text
                name="address"
                label={t('account.fields.address', { defaultValue: 'Logradouro' })}
              />
              <Field.Text
                name="addressNumber"
                label={t('account.fields.addressNumber', { defaultValue: 'Número' })}
              />
            </Box>

            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(4, 1fr)' }}
              sx={{ mt: 3 }}
            >
              <Field.Text
                name="neighborhood"
                label={t('account.fields.neighborhood', { defaultValue: 'Bairro' })}
              />
              <Field.Text
                name="complement"
                label={t('account.fields.complement', { defaultValue: 'Complemento' })}
              />
              <Field.Text
                name="city"
                label={t('account.fields.city', { defaultValue: 'Cidade' })}
              />
              <Field.Text name="state" label={t('account.fields.state', { defaultValue: 'UF' })} />
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

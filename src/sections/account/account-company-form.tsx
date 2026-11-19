import type { Enterprise } from 'src/api/firestore/platform';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import LoadingButton from '@mui/lab/LoadingButton';
import CircularProgress from '@mui/material/CircularProgress';

import { useBoolean } from 'src/hooks/use-boolean';
import { useCepLookup } from 'src/hooks/use-cep-lookup';
import { useCnpjLookup } from 'src/hooks/use-cnpj-lookup';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { formatCep, digitsOnly, formatCnpj } from 'src/utils/br-docs';

import { useTranslate } from 'src/locales';
import { getEnterprise, updateEnterpriseSettings } from 'src/api/firestore/platform';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export const AccountCompanySchema = zod.object({
  name: zod.string().min(1, { message: 'Razão social obrigatória' }),
  tradeName: zod.string().optional().or(zod.literal('')),
  document: zod
    .string()
    .min(1, { message: 'CNPJ obrigatório' })
    .refine((v) => digitsOnly(v).length === 14, { message: 'CNPJ deve ter 14 dígitos' }),
  stateRegistration: zod.string().optional().or(zod.literal('')),
  phone: zod.string().optional().or(zod.literal('')),
  zipCode: zod.string().optional().or(zod.literal('')),
  address: zod.string().optional().or(zod.literal('')),
  addressNumber: zod.string().optional().or(zod.literal('')),
  complement: zod.string().optional().or(zod.literal('')),
  neighborhood: zod.string().optional().or(zod.literal('')),
  city: zod.string().optional().or(zod.literal('')),
  state: zod.string().optional().or(zod.literal('')),
});

export type AccountCompanySchemaType = zod.infer<typeof AccountCompanySchema>;

// ----------------------------------------------------------------------

export function AccountCompanyForm() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);

  const openGeneral = useBoolean(true);
  const openAddress = useBoolean(true);

  const canEdit =
    Boolean(user?.platformAdmin) || user?.role === 'admin' || user?.role === 'gestor';

  const defaultValues = useMemo<AccountCompanySchemaType>(
    () => ({
      name: enterprise?.name || '',
      tradeName: enterprise?.tradeName || '',
      document: formatCnpj(enterprise?.document || ''),
      stateRegistration: enterprise?.stateRegistration || '',
      phone: enterprise?.phone || '',
      zipCode: formatCep(enterprise?.zipCode || ''),
      address: enterprise?.address || '',
      addressNumber: enterprise?.addressNumber || '',
      complement: enterprise?.complement || '',
      neighborhood: enterprise?.neighborhood || '',
      city: enterprise?.city || '',
      state: enterprise?.state || '',
    }),
    [enterprise]
  );

  const methods = useForm<AccountCompanySchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(AccountCompanySchema),
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
  const documentWatch = watch('document') || '';

  useEffect(() => {
    if (!enterpriseId) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    getEnterprise(enterpriseId)
      .then((data) => {
        if (!alive) return;
        setEnterprise(data);
        if (data) {
          reset({
            name: data.name || '',
            tradeName: data.tradeName || '',
            document: formatCnpj(data.document || ''),
            stateRegistration: data.stateRegistration || '',
            phone: data.phone || '',
            zipCode: formatCep(data.zipCode || ''),
            address: data.address || '',
            addressNumber: data.addressNumber || '',
            complement: data.complement || '',
            neighborhood: data.neighborhood || '',
            city: data.city || '',
            state: data.state || '',
          });
        }
      })
      .catch((err) => {
        console.error(err);
        toast.error(t('account.companyLoadError'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [enterpriseId, reset, t]);

  const { handleBlur: handleCepBlur } = useCepLookup({
    cep: zipCodeWatch,
    initialValue: enterprise?.zipCode,
    onSuccess: (fields) => {
      setValue('zipCode', formatCep(fields.zipCode), { shouldDirty: true });
      if (fields.address) setValue('address', fields.address, { shouldDirty: true });
      if (fields.neighborhood) setValue('neighborhood', fields.neighborhood, { shouldDirty: true });
      if (fields.city) setValue('city', fields.city, { shouldDirty: true });
      if (fields.state) setValue('state', fields.state, { shouldDirty: true });
    },
  });

  const { handleBlur: handleCnpjBlur } = useCnpjLookup({
    document: documentWatch,
    initialValue: enterprise?.document,
    onSuccess: (fields) => {
      if (fields.name) setValue('name', fields.name, { shouldDirty: true });
      if (fields.tradeName) setValue('tradeName', fields.tradeName, { shouldDirty: true });
      if (fields.phone) setValue('phone', fields.phone, { shouldDirty: true });
      if (fields.zipCode) setValue('zipCode', formatCep(fields.zipCode), { shouldDirty: true });
      if (fields.address) setValue('address', fields.address, { shouldDirty: true });
      if (fields.addressNumber) {
        setValue('addressNumber', fields.addressNumber, { shouldDirty: true });
      }
      if (fields.complement) setValue('complement', fields.complement, { shouldDirty: true });
      if (fields.neighborhood) setValue('neighborhood', fields.neighborhood, { shouldDirty: true });
      if (fields.city) setValue('city', fields.city, { shouldDirty: true });
      if (fields.state) setValue('state', fields.state, { shouldDirty: true });
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId || !canEdit) return;
    try {
      await updateEnterpriseSettings(enterpriseId, {
        name: data.name,
        tradeName: data.tradeName || undefined,
        document: digitsOnly(data.document),
        stateRegistration: data.stateRegistration || undefined,
        phone: data.phone || undefined,
        zipCode: digitsOnly(data.zipCode) || undefined,
        address: data.address || undefined,
        addressNumber: data.addressNumber || undefined,
        complement: data.complement || undefined,
        neighborhood: data.neighborhood || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
      });
      toast.success(t('account.companySaveSuccess'));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('account.companySaveError')));
    }
  });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Stack spacing={3} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
        <Card>
          <CardHeader
            title={t('account.companyDataTitle')}
            subheader={t('account.companyDataHint')}
            action={
              <IconButton onClick={openGeneral.onToggle}>
                <Iconify
                  icon={
                    openGeneral.value
                      ? 'eva:arrow-ios-upward-fill'
                      : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: 3 }}
          />
          <Collapse in={openGeneral.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
              >
                <Field.Text
                  name="document"
                  label={t('account.fields.document')}
                  disabled={!canEdit}
                  placeholder="00.000.000/0000-00"
                  value={formatCnpj(documentWatch)}
                  onChange={(event) => {
                    setValue('document', formatCnpj(event.target.value), { shouldDirty: true });
                  }}
                  onBlur={handleCnpjBlur}
                />
                <Field.Text
                  name="stateRegistration"
                  label={t('account.fields.stateRegistration')}
                  disabled={!canEdit}
                />
                <Field.Text name="name" label={t('account.fields.companyName')} disabled={!canEdit} />
                <Field.Text
                  name="tradeName"
                  label={t('account.fields.tradeName')}
                  disabled={!canEdit}
                />
                <Field.Phone
                  name="phone"
                  label={t('account.fields.phone')}
                  disabled={!canEdit}
                  country="BR"
                />
              </Box>
            </Stack>
          </Collapse>
        </Card>

        <Card>
          <CardHeader
            title={t('account.companyAddressTitle')}
            subheader={t('account.companyAddressHint')}
            action={
              <IconButton onClick={openAddress.onToggle}>
                <Iconify
                  icon={
                    openAddress.value
                      ? 'eva:arrow-ios-upward-fill'
                      : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: 3 }}
          />
          <Collapse in={openAddress.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: '1fr 2fr 1fr' }}
              >
                <Field.Text
                  name="zipCode"
                  label={t('account.fields.zipCode')}
                  disabled={!canEdit}
                  value={formatCep(zipCodeWatch)}
                  onChange={(event) => {
                    setValue('zipCode', formatCep(event.target.value), { shouldDirty: true });
                  }}
                  onBlur={handleCepBlur}
                />
                <Field.Text
                  name="address"
                  label={t('account.fields.address')}
                  disabled={!canEdit}
                />
                <Field.Text
                  name="addressNumber"
                  label={t('account.fields.addressNumber')}
                  disabled={!canEdit}
                />
              </Box>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(4, 1fr)' }}
              >
                <Field.Text
                  name="neighborhood"
                  label={t('account.fields.neighborhood')}
                  disabled={!canEdit}
                />
                <Field.Text
                  name="complement"
                  label={t('account.fields.complement')}
                  disabled={!canEdit}
                />
                <Field.Text name="city" label={t('account.fields.city')} disabled={!canEdit} />
                <Field.Text name="state" label={t('account.fields.state')} disabled={!canEdit} />
              </Box>
            </Stack>
          </Collapse>
        </Card>

        {canEdit && (
          <Stack direction="row" justifyContent="flex-end">
            <LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
              {t('account.saveSubmit')}
            </LoadingButton>
          </Stack>
        )}
      </Stack>
    </Form>
  );
}

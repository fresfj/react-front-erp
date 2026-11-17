import type { Enterprise } from 'src/api/firestore/platform';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import LoadingButton from '@mui/lab/LoadingButton';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';
import { useCepLookup } from 'src/hooks/use-cep-lookup';
import { useCnpjLookup } from 'src/hooks/use-cnpj-lookup';

import { formatCep, digitsOnly, formatCnpj } from 'src/utils/br-docs';

import { useTranslate } from 'src/locales';
import { createEnterprise, updateEnterprise } from 'src/api/firestore/platform';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

// ----------------------------------------------------------------------

export const EnterpriseSchema = zod.object({
  id: zod
    .string()
    .min(2)
    .regex(/^[a-z0-9-_]+$/i, { message: 'Invalid id' }),
  name: zod.string().min(1, { message: 'Required' }),
  tradeName: zod.string().optional().or(zod.literal('')),
  document: zod
    .string()
    .min(1, { message: 'Required' })
    .refine((v) => digitsOnly(v).length === 14, { message: 'CNPJ inválido' }),
  adminEmail: zod.union([zod.literal(''), zod.string().email()]).optional(),
  phone: zod.string().optional().or(zod.literal('')),
  zipCode: zod.string().optional().or(zod.literal('')),
  address: zod.string().optional().or(zod.literal('')),
  addressNumber: zod.string().optional().or(zod.literal('')),
  complement: zod.string().optional().or(zod.literal('')),
  neighborhood: zod.string().optional().or(zod.literal('')),
  city: zod.string().optional().or(zod.literal('')),
  state: zod.string().optional().or(zod.literal('')),
  active: zod.boolean(),
});

export type EnterpriseSchemaType = zod.infer<typeof EnterpriseSchema>;

type Props = {
  currentEnterprise?: Enterprise;
};

// ----------------------------------------------------------------------

export function EnterpriseForm({ currentEnterprise }: Props) {
  const router = useRouter();
  const { t } = useTranslate('common');
  const openDetails = useBoolean(true);
  const openAddress = useBoolean(true);
  const isEdit = Boolean(currentEnterprise);

  const defaultValues = useMemo<EnterpriseSchemaType>(
    () => ({
      id: currentEnterprise?.id || '',
      name: currentEnterprise?.name || '',
      tradeName: currentEnterprise?.tradeName || '',
      document: formatCnpj(currentEnterprise?.document || ''),
      adminEmail: currentEnterprise?.adminEmail || '',
      phone: currentEnterprise?.phone || '',
      zipCode: formatCep(currentEnterprise?.zipCode || ''),
      address: currentEnterprise?.address || '',
      addressNumber: currentEnterprise?.addressNumber || '',
      complement: currentEnterprise?.complement || '',
      neighborhood: currentEnterprise?.neighborhood || '',
      city: currentEnterprise?.city || '',
      state: currentEnterprise?.state || '',
      active: currentEnterprise?.active ?? true,
    }),
    [currentEnterprise]
  );

  const methods = useForm<EnterpriseSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(EnterpriseSchema),
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

  useCepLookup({
    cep: zipCodeWatch,
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

  useCnpjLookup({
    document: documentWatch,
    onSuccess: (fields) => {
      setValue('document', formatCnpj(fields.document), { shouldDirty: true });
      if (fields.name) setValue('name', fields.name, { shouldDirty: true });
      if (fields.tradeName) setValue('tradeName', fields.tradeName, { shouldDirty: true });
      if (fields.zipCode) setValue('zipCode', formatCep(fields.zipCode), { shouldDirty: true });
      if (fields.address) setValue('address', fields.address, { shouldDirty: true });
      if (fields.addressNumber) {
        setValue('addressNumber', fields.addressNumber, { shouldDirty: true });
      }
      if (fields.complement) setValue('complement', fields.complement, { shouldDirty: true });
      if (fields.neighborhood) {
        setValue('neighborhood', fields.neighborhood, { shouldDirty: true });
      }
      if (fields.city) setValue('city', fields.city, { shouldDirty: true });
      if (fields.state) setValue('state', fields.state, { shouldDirty: true });
      if (fields.phone) setValue('phone', fields.phone, { shouldDirty: true });
      toast.success(t('brasilapi.cnpjSuccess', { defaultValue: 'Dados preenchidos pelo CNPJ' }));
    },
    onError: (code) => {
      toast.error(
        code === 'CNPJ_NOT_FOUND'
          ? t('brasilapi.cnpjNotFound', { defaultValue: 'CNPJ não encontrado' })
          : t('brasilapi.cnpjError', { defaultValue: 'Falha ao consultar CNPJ' })
      );
    },
  });

  useEffect(() => {
    if (currentEnterprise) reset(defaultValues);
  }, [currentEnterprise, defaultValues, reset]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      const addressPayload = {
        document: digitsOnly(data.document),
        tradeName: data.tradeName?.trim() || undefined,
        phone: digitsOnly(data.phone) || data.phone?.trim() || undefined,
        zipCode: digitsOnly(data.zipCode) || undefined,
        address: data.address?.trim() || undefined,
        addressNumber: data.addressNumber?.trim() || undefined,
        complement: data.complement?.trim() || undefined,
        neighborhood: data.neighborhood?.trim() || undefined,
        city: data.city?.trim() || undefined,
        state: data.state?.trim() || undefined,
      };

      if (isEdit && currentEnterprise) {
        await updateEnterprise({
          id: currentEnterprise.id,
          name: data.name.trim(),
          active: data.active,
          adminEmail: data.adminEmail?.trim() || '',
          ...addressPayload,
        });
        toast.success(t('enterprises.updateSuccess'));
        router.push(paths.dashboard.enterprises.details(currentEnterprise.id));
      } else {
        const created = await createEnterprise({
          id: data.id.trim(),
          name: data.name.trim(),
          adminEmail: data.adminEmail?.trim() || undefined,
          ...addressPayload,
        });
        toast.success(t('enterprises.createSuccess'));
        router.push(paths.dashboard.enterprises.details(created.id));
      }
    } catch (error) {
      console.error(error);
      toast.error(isEdit ? t('enterprises.updateError') : t('enterprises.createError'));
    }
  });

  const renderCollapseAction = (open: boolean, onToggle: () => void) => (
    <IconButton onClick={onToggle}>
      <Iconify icon={open ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'} />
    </IconButton>
  );

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Stack spacing={{ xs: 3, md: 5 }} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
        <Card>
          <CardHeader
            title={t('enterprises.details')}
            subheader={t('enterprises.detailsHint')}
            action={renderCollapseAction(openDetails.value, openDetails.onToggle)}
            sx={{ mb: 3 }}
          />
          <Collapse in={openDetails.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
              >
                <Field.Text
                  name="id"
                  label={t('enterprises.fields.id')}
                  disabled={isEdit}
                  helperText={t('enterprises.idHint')}
                />
                <Field.Text
                  name="document"
                  label={t('enterprises.fields.document', { defaultValue: 'CNPJ' })}
                  placeholder="00.000.000/0000-00"
                  value={formatCnpj(documentWatch)}
                  onChange={(event) => {
                    setValue('document', formatCnpj(event.target.value), { shouldDirty: true });
                  }}
                />
                <Field.Text name="name" label={t('enterprises.fields.name')} />
                <Field.Text
                  name="tradeName"
                  label={t('enterprises.fields.tradeName', { defaultValue: 'Nome fantasia' })}
                />
                <Field.Text name="adminEmail" label={t('enterprises.fields.adminEmail')} />
                <Field.Phone
                  name="phone"
                  label={t('enterprises.fields.phone', { defaultValue: 'Telefone' })}
                  country="BR"
                />
              </Box>
            </Stack>
          </Collapse>
        </Card>

        <Card>
          <CardHeader
            title={t('enterprises.addressSection', { defaultValue: 'Endereço' })}
            subheader={t('enterprises.addressHint', {
              defaultValue: 'CEP com preenchimento automático via BrasilAPI',
            })}
            action={renderCollapseAction(openAddress.value, openAddress.onToggle)}
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
                  label={t('enterprises.fields.zipCode', { defaultValue: 'CEP' })}
                  placeholder="00000-000"
                  value={formatCep(zipCodeWatch)}
                  onChange={(event) => {
                    setValue('zipCode', formatCep(event.target.value), { shouldDirty: true });
                  }}
                />
                <Field.Text
                  name="address"
                  label={t('enterprises.fields.address', { defaultValue: 'Logradouro' })}
                />
                <Field.Text
                  name="addressNumber"
                  label={t('enterprises.fields.addressNumber', { defaultValue: 'Número' })}
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
                  label={t('enterprises.fields.neighborhood', { defaultValue: 'Bairro' })}
                />
                <Field.Text
                  name="complement"
                  label={t('enterprises.fields.complement', { defaultValue: 'Complemento' })}
                />
                <Field.Text
                  name="city"
                  label={t('enterprises.fields.city', { defaultValue: 'Cidade' })}
                />
                <Field.Text
                  name="state"
                  label={t('enterprises.fields.state', { defaultValue: 'UF' })}
                />
              </Box>
            </Stack>
          </Collapse>
        </Card>

        <Stack
          spacing={3}
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
        >
          <Field.Switch
            name="active"
            label={t('enterprises.fields.active')}
            slotProps={{
              wrap: { pl: 3, flexGrow: 1 },
              switch: {},
            }}
          />

          <LoadingButton
            type="submit"
            variant="contained"
            size="large"
            loading={isSubmitting}
            sx={{ ml: 'auto' }}
          >
            {isEdit ? t('enterprises.saveSubmit') : t('enterprises.createSubmit')}
          </LoadingButton>
        </Stack>
      </Stack>
    </Form>
  );
}

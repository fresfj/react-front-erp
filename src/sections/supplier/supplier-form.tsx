import type { Supplier } from 'src/api/firestore/suppliers';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
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

import { digitsOnly, formatCep, formatCnpj } from 'src/utils/br-docs';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import {
  createSupplier,
  updateSupplier,
  deactivateSupplier,
} from 'src/api/firestore/suppliers';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';
import { ConfirmDialog } from 'src/components/custom-dialog';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export const SupplierSchema = zod.object({
  name: zod.string().min(1, { message: 'Required' }),
  tradeName: zod.string().optional().or(zod.literal('')),
  document: zod.string().optional().or(zod.literal('')),
  stateRegistration: zod.string().optional().or(zod.literal('')),
  contactPerson: zod.string().optional().or(zod.literal('')),
  phone: zod.string().optional().or(zod.literal('')),
  email: zod.union([zod.literal(''), zod.string().email({ message: 'Invalid email' })]).optional(),
  zipCode: zod.string().optional().or(zod.literal('')),
  address: zod.string().optional().or(zod.literal('')),
  addressNumber: zod.string().optional().or(zod.literal('')),
  complement: zod.string().optional().or(zod.literal('')),
  neighborhood: zod.string().optional().or(zod.literal('')),
  city: zod.string().optional().or(zod.literal('')),
  state: zod.string().optional().or(zod.literal('')),
  notes: zod.string().optional().or(zod.literal('')),
  active: zod.boolean(),
});

export type SupplierSchemaType = zod.infer<typeof SupplierSchema>;

type Props = {
  currentSupplier?: Supplier;
};

// ----------------------------------------------------------------------

export function SupplierForm({ currentSupplier }: Props) {
  const router = useRouter();
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const confirmDeactivate = useBoolean();
  const openDetails = useBoolean(true);
  const openContact = useBoolean(true);
  const openAddress = useBoolean(true);

  const enterpriseId = user?.enterpriseId as string | undefined;
  const canWrite = user?.role !== 'operador';

  const defaultValues = useMemo<SupplierSchemaType>(
    () => ({
      name: currentSupplier?.name || '',
      tradeName: currentSupplier?.tradeName || '',
      document: formatCnpj(currentSupplier?.document || ''),
      stateRegistration: currentSupplier?.stateRegistration || '',
      contactPerson: currentSupplier?.contactPerson || '',
      phone: currentSupplier?.phone || '',
      email: currentSupplier?.email || '',
      zipCode: formatCep(currentSupplier?.zipCode || ''),
      address: currentSupplier?.address || '',
      addressNumber: currentSupplier?.addressNumber || '',
      complement: currentSupplier?.complement || '',
      neighborhood: currentSupplier?.neighborhood || '',
      city: currentSupplier?.city || '',
      state: currentSupplier?.state || '',
      notes: currentSupplier?.notes || '',
      active: currentSupplier?.active ?? true,
    }),
    [currentSupplier]
  );

  const methods = useForm<SupplierSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(SupplierSchema),
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
      if (code === 'CEP_NOT_FOUND') {
        toast.error(t('brasilapi.cepNotFound', { defaultValue: 'CEP não encontrado' }));
      } else {
        toast.error(t('brasilapi.cepError', { defaultValue: 'Falha ao consultar CEP' }));
      }
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
      if (fields.neighborhood) {
        setValue('neighborhood', fields.neighborhood, { shouldDirty: true });
      }
      if (fields.city) setValue('city', fields.city, { shouldDirty: true });
      if (fields.state) setValue('state', fields.state, { shouldDirty: true });
      if (fields.complement) setValue('complement', fields.complement, { shouldDirty: true });
      if (fields.phone) setValue('phone', fields.phone, { shouldDirty: true });
      toast.success(t('brasilapi.cnpjSuccess', { defaultValue: 'Dados preenchidos pelo CNPJ' }));
    },
    onError: (code) => {
      if (code === 'CNPJ_NOT_FOUND') {
        toast.error(t('brasilapi.cnpjNotFound', { defaultValue: 'CNPJ não encontrado' }));
      } else {
        toast.error(t('brasilapi.cnpjError', { defaultValue: 'Falha ao consultar CNPJ' }));
      }
    },
  });

  useEffect(() => {
    if (currentSupplier) {
      reset(defaultValues);
    }
  }, [currentSupplier, defaultValues, reset]);

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) {
      toast.error(t('suppliers.errorMissingEnterprise'));
      return;
    }

    if (!canWrite) {
      toast.error(t('permission.deniedBody'));
      return;
    }

    try {
      const payload = {
        name: data.name.trim(),
        tradeName: data.tradeName?.trim() || undefined,
        document: digitsOnly(data.document) || undefined,
        stateRegistration: data.stateRegistration?.trim() || undefined,
        contactPerson: data.contactPerson?.trim() || undefined,
        phone: digitsOnly(data.phone) || data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
        zipCode: digitsOnly(data.zipCode) || undefined,
        address: data.address?.trim() || undefined,
        addressNumber: data.addressNumber?.trim() || undefined,
        complement: data.complement?.trim() || undefined,
        neighborhood: data.neighborhood?.trim() || undefined,
        city: data.city?.trim() || undefined,
        state: data.state?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        active: data.active,
      };

      if (currentSupplier) {
        await updateSupplier(enterpriseId, currentSupplier.id, payload);
        toast.success(t('suppliers.updateSuccess'));
      } else {
        await createSupplier(enterpriseId, payload);
        toast.success(t('suppliers.createSuccess'));
      }

      router.push(paths.dashboard.suppliers.list);
    } catch (error) {
      console.error(error);
      toast.error(
        getFirebaseErrorMessage(
          error,
          currentSupplier ? t('suppliers.updateError') : t('suppliers.createError')
        )
      );
    }
  });

  const handleConfirmDeactivate = async () => {
    if (!enterpriseId || !currentSupplier || !canWrite) {
      return;
    }

    try {
      await deactivateSupplier(enterpriseId, currentSupplier.id);
      toast.success(t('suppliers.deactivateSuccess'));
      confirmDeactivate.onFalse();
      router.push(paths.dashboard.suppliers.list);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('suppliers.deactivateError')));
    }
  };

  const renderCollapseAction = (open: boolean, onToggle: () => void) => (
    <IconButton onClick={onToggle}>
      <Iconify icon={open ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'} />
    </IconButton>
  );

  const renderDetails = (
    <Card>
      <CardHeader
        title={t('suppliers.details')}
        subheader={t('suppliers.detailsHint')}
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
            <Field.Text name="name" label={t('suppliers.fields.name')} />
            <Field.Text
              name="tradeName"
              label={t('suppliers.fields.tradeName', { defaultValue: 'Nome fantasia (opcional)' })}
            />
            <Field.Text
              name="document"
              label={t('suppliers.fields.document')}
              placeholder="00.000.000/0000-00 (opcional)"
              value={formatCnpj(documentWatch)}
              onChange={(event) => {
                setValue('document', formatCnpj(event.target.value), { shouldDirty: true });
              }}
            />
            <Field.Text
              name="stateRegistration"
              label={t('suppliers.fields.stateRegistration', {
                defaultValue: 'Inscrição Estadual / IE (opcional)',
              })}
            />
          </Box>
        </Stack>
      </Collapse>
    </Card>
  );

  const renderContact = (
    <Card>
      <CardHeader
        title={t('suppliers.contact')}
        subheader={t('suppliers.contactHint')}
        action={renderCollapseAction(openContact.value, openContact.onToggle)}
        sx={{ mb: 3 }}
      />

      <Collapse in={openContact.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          <Box
            columnGap={2}
            rowGap={3}
            display="grid"
            gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(3, 1fr)' }}
          >
            <Field.Text
              name="contactPerson"
              label={t('suppliers.fields.contactPerson', {
                defaultValue: 'Responsável / Contato',
              })}
            />
            <Field.Phone name="phone" label={t('suppliers.fields.phone')} country="BR" />
            <Field.Text name="email" label={t('suppliers.fields.email')} />
          </Box>
        </Stack>
      </Collapse>
    </Card>
  );

  const renderAddress = (
    <Card>
      <CardHeader
        title={t('suppliers.addressSection', { defaultValue: 'Endereço e Rastreabilidade' })}
        subheader={t('suppliers.addressHint', {
          defaultValue: 'Localização de origem, município, UF e observações de fornecimento',
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
              label={t('suppliers.fields.zipCode', { defaultValue: 'CEP' })}
              placeholder="00000-000"
              value={formatCep(zipCodeWatch)}
              onChange={(event) => {
                setValue('zipCode', formatCep(event.target.value), { shouldDirty: true });
              }}
            />
            <Field.Text
              name="address"
              label={t('suppliers.fields.address', { defaultValue: 'Logradouro / Rua / Rodovia' })}
            />
            <Field.Text
              name="addressNumber"
              label={t('suppliers.fields.addressNumber', { defaultValue: 'Número / Km' })}
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
              label={t('suppliers.fields.neighborhood', { defaultValue: 'Bairro / Comunidade' })}
            />
            <Field.Text
              name="complement"
              label={t('suppliers.fields.complement', { defaultValue: 'Complemento' })}
            />
            <Field.Text
              name="city"
              label={t('suppliers.fields.city', { defaultValue: 'Cidade / Município' })}
            />
            <Field.Text
              name="state"
              label={t('suppliers.fields.state', { defaultValue: 'UF / Estado' })}
              placeholder="PA, AP, AM, SP..."
            />
          </Box>

          <Field.Text
            name="notes"
            label={t('suppliers.fields.notes', {
              defaultValue: 'Observações / Condições de fornecimento e rastreabilidade',
            })}
            multiline
            rows={3}
          />
        </Stack>
      </Collapse>
    </Card>
  );

  const renderActions = (
    <Stack
      spacing={3}
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
    >
      <Field.Switch
        name="active"
        label={t('suppliers.fields.active')}
        slotProps={{
          wrap: { pl: 3, flexGrow: 1 },
          switch: {},
        }}
      />

      <Stack direction="row" spacing={2} alignItems="center" sx={{ ml: 'auto' }}>
        {canWrite && currentSupplier && (
          <Button
            color="error"
            variant="soft"
            onClick={confirmDeactivate.onTrue}
            disabled={isSubmitting}
          >
            {t('suppliers.deactivate')}
          </Button>
        )}
        {canWrite && (
          <LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
            {currentSupplier ? t('suppliers.saveSubmit') : t('suppliers.createSubmit')}
          </LoadingButton>
        )}
      </Stack>
    </Stack>
  );

  return (
    <>
      <Form methods={methods} onSubmit={onSubmit}>
        <Stack spacing={{ xs: 3, md: 5 }} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
          {renderDetails}
          {renderContact}
          {renderAddress}
          {renderActions}
        </Stack>
      </Form>

      <ConfirmDialog
        open={confirmDeactivate.value}
        onClose={confirmDeactivate.onFalse}
        title={t('suppliers.deactivate')}
        content={t('suppliers.deactivateConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivate}>
            {t('suppliers.deactivate')}
          </Button>
        }
      />
    </>
  );
}

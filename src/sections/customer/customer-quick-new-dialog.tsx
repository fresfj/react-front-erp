import type { Customer } from 'src/api/firestore/customers';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { useCepLookup } from 'src/hooks/use-cep-lookup';
import { useCnpjLookup } from 'src/hooks/use-cnpj-lookup';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { formatCep, digitsOnly, formatCpfCnpj } from 'src/utils/br-docs';

import { useTranslate } from 'src/locales';
import { createCustomer } from 'src/api/firestore/customers';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export const QuickCustomerSchema = zod.object({
  name: zod.string().min(1, { message: 'Required' }),
  document: zod.string().optional().or(zod.literal('')),
  phone: zod.string().optional().or(zod.literal('')),
  email: zod.union([zod.literal(''), zod.string().email()]).optional(),
  zipCode: zod.string().optional().or(zod.literal('')),
  address: zod.string().optional().or(zod.literal('')),
  addressNumber: zod.string().optional().or(zod.literal('')),
  neighborhood: zod.string().optional().or(zod.literal('')),
  complement: zod.string().optional().or(zod.literal('')),
  city: zod.string().optional().or(zod.literal('')),
  state: zod.string().optional().or(zod.literal('')),
});

export type QuickCustomerSchemaType = zod.infer<typeof QuickCustomerSchema>;

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
};

export function CustomerQuickNewDialog({ open, onClose, onCreated }: Props) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const methods = useForm<QuickCustomerSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(QuickCustomerSchema),
    defaultValues: {
      name: '',
      document: '',
      phone: '',
      email: '',
      zipCode: '',
      address: '',
      addressNumber: '',
      neighborhood: '',
      complement: '',
      city: '',
      state: '',
    },
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

  const {
    loading: cepLoading,
    lookup: lookupCep,
    handleBlur: handleCepBlur,
  } = useCepLookup({
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

  const { handleBlur: handleCnpjBlur } = useCnpjLookup({
    document: documentWatch,
    enabled: digitsOnly(documentWatch).length === 14,
    onSuccess: (fields) => {
      setValue('document', formatCpfCnpj(fields.document), { shouldDirty: true });
      if (fields.name) setValue('name', fields.name, { shouldDirty: true });
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

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) return;

    try {
      const created = await createCustomer(enterpriseId, {
        name: data.name.trim(),
        document: digitsOnly(data.document) || undefined,
        phone: digitsOnly(data.phone) || data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
        zipCode: digitsOnly(data.zipCode) || undefined,
        address: data.address?.trim() || undefined,
        addressNumber: data.addressNumber?.trim() || undefined,
        neighborhood: data.neighborhood?.trim() || undefined,
        complement: data.complement?.trim() || undefined,
        city: data.city?.trim() || undefined,
        state: data.state?.trim() || undefined,
        currentDebt: 0,
        active: true,
      });

      toast.success(
        t('customers.createSuccess', { defaultValue: 'Cliente cadastrado com sucesso' })
      );
      reset();
      onCreated(created);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(
        getFirebaseErrorMessage(
          error,
          t('customers.createError', { defaultValue: 'Erro ao cadastrar cliente' })
        )
      );
    }
  });

  return (
    <Dialog fullWidth maxWidth="sm" open={open} onClose={onClose}>
      <Form methods={methods} onSubmit={onSubmit}>
        <DialogTitle>
          {t('customers.quickCreateTitle', { defaultValue: 'Novo cliente rápido' })}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
            >
              <Field.Text
                name="name"
                label={t('customers.fields.name', { defaultValue: 'Nome completo / Razão Social' })}
              />
              <Field.Text
                name="document"
                label={t('customers.fields.document', { defaultValue: 'CPF / CNPJ (opcional)' })}
                value={formatCpfCnpj(documentWatch)}
                onChange={(event) => {
                  setValue('document', formatCpfCnpj(event.target.value), { shouldDirty: true });
                }}
                onBlur={handleCnpjBlur}
              />
              <Field.Phone
                name="phone"
                label={t('customers.fields.phone', { defaultValue: 'Telefone / WhatsApp' })}
                country="BR"
              />
              <Field.Text
                name="email"
                label={t('customers.fields.email', { defaultValue: 'E-mail' })}
              />
            </Box>

            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: '1fr 2fr 1fr' }}
            >
              <Field.Text
                name="zipCode"
                label={t('customers.fields.zipCode', { defaultValue: 'CEP' })}
                placeholder="00000-000"
                value={formatCep(zipCodeWatch)}
                onChange={(event) => {
                  const formatted = formatCep(event.target.value);
                  setValue('zipCode', formatted, { shouldDirty: true });
                  if (digitsOnly(formatted).length === 8) {
                    lookupCep(formatted).catch(() => undefined);
                  }
                }}
                onBlur={handleCepBlur}
                InputProps={{
                  endAdornment: cepLoading ? (
                    <InputAdornment position="end">
                      <CircularProgress size={18} />
                    </InputAdornment>
                  ) : undefined,
                }}
              />
              <Field.Text
                name="address"
                label={t('customers.fields.address', { defaultValue: 'Logradouro / Rua' })}
              />
              <Field.Text
                name="addressNumber"
                label={t('customers.fields.addressNumber', { defaultValue: 'Número' })}
              />
            </Box>

            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: '1.5fr 1fr 1.5fr 0.8fr' }}
            >
              <Field.Text
                name="neighborhood"
                label={t('customers.fields.neighborhood', { defaultValue: 'Bairro' })}
              />
              <Field.Text
                name="complement"
                label={t('customers.fields.complement', { defaultValue: 'Complemento' })}
              />
              <Field.Text
                name="city"
                label={t('customers.fields.city', { defaultValue: 'Cidade' })}
              />
              <Field.Text
                name="state"
                label={t('customers.fields.state', { defaultValue: 'UF' })}
              />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancelar' })}
          </Button>

          <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
            {t('customers.selectAndSave', { defaultValue: 'Salvar e vincular cliente' })}
          </LoadingButton>
        </DialogActions>
      </Form>
    </Dialog>
  );
}

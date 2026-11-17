import type { Customer } from 'src/api/firestore/customers';

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
import InputAdornment from '@mui/material/InputAdornment';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';
import { useCepLookup } from 'src/hooks/use-cep-lookup';
import { useCnpjLookup } from 'src/hooks/use-cnpj-lookup';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { formatCep, digitsOnly, formatCpfCnpj } from 'src/utils/br-docs';

import { useTranslate } from 'src/locales';
import {
  createCustomer,
  updateCustomer,
  deactivateCustomer,
} from 'src/api/firestore/customers';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';
import { ConfirmDialog } from 'src/components/custom-dialog';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const optionalNonNegative = zod.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return undefined;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : undefined;
}, zod.number().nonnegative().optional());

export const CustomerSchema = zod.object({
  name: zod.string().min(1, { message: 'Required' }),
  document: zod.string().optional().or(zod.literal('')),
  phone: zod.string().optional().or(zod.literal('')),
  email: zod.union([zod.literal(''), zod.string().email()]).optional(),
  zipCode: zod.string().optional().or(zod.literal('')),
  address: zod.string().optional().or(zod.literal('')),
  addressNumber: zod.string().optional().or(zod.literal('')),
  complement: zod.string().optional().or(zod.literal('')),
  neighborhood: zod.string().optional().or(zod.literal('')),
  city: zod.string().optional().or(zod.literal('')),
  state: zod.string().optional().or(zod.literal('')),
  creditLimit: optionalNonNegative,
  currentDebt: optionalNonNegative,
  notes: zod.string().optional().or(zod.literal('')),
  active: zod.boolean(),
});

export type CustomerSchemaType = zod.infer<typeof CustomerSchema>;

type Props = {
  currentCustomer?: Customer;
};

// ----------------------------------------------------------------------

export function CustomerForm({ currentCustomer }: Props) {
  const router = useRouter();
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const confirmDeactivate = useBoolean();
  const openDetails = useBoolean(true);
  const openAddress = useBoolean(true);
  const openCredit = useBoolean(true);

  const enterpriseId = user?.enterpriseId as string | undefined;

  const defaultValues = useMemo<CustomerSchemaType>(
    () => ({
      name: currentCustomer?.name || '',
      document: formatCpfCnpj(currentCustomer?.document || ''),
      phone: currentCustomer?.phone || '',
      email: currentCustomer?.email || '',
      zipCode: formatCep(currentCustomer?.zipCode || ''),
      address: currentCustomer?.address || '',
      addressNumber: currentCustomer?.addressNumber || '',
      complement: currentCustomer?.complement || '',
      neighborhood: currentCustomer?.neighborhood || '',
      city: currentCustomer?.city || '',
      state: currentCustomer?.state || '',
      creditLimit: currentCustomer?.creditLimit,
      currentDebt: currentCustomer?.currentDebt ?? 0,
      notes: currentCustomer?.notes || '',
      active: currentCustomer?.active ?? true,
    }),
    [currentCustomer]
  );

  const methods = useForm<CustomerSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(CustomerSchema),
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

  useEffect(() => {
    if (currentCustomer) {
      reset(defaultValues);
    }
  }, [currentCustomer, defaultValues, reset]);

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) {
      toast.error(t('customers.errorMissingEnterprise', { defaultValue: 'Empresa não configurada' }));
      return;
    }

    try {
      const payload = {
        name: data.name.trim(),
        document: digitsOnly(data.document) || undefined,
        phone: digitsOnly(data.phone) || data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
        zipCode: digitsOnly(data.zipCode) || undefined,
        address: data.address?.trim() || undefined,
        addressNumber: data.addressNumber?.trim() || undefined,
        complement: data.complement?.trim() || undefined,
        neighborhood: data.neighborhood?.trim() || undefined,
        city: data.city?.trim() || undefined,
        state: data.state?.trim() || undefined,
        creditLimit: data.creditLimit,
        currentDebt: data.currentDebt ?? 0,
        notes: data.notes?.trim() || undefined,
        active: data.active,
      };

      if (currentCustomer) {
        await updateCustomer(enterpriseId, currentCustomer.id, payload);
        toast.success(t('customers.updateSuccess', { defaultValue: 'Cliente atualizado com sucesso' }));
      } else {
        await createCustomer(enterpriseId, payload);
        toast.success(t('customers.createSuccess', { defaultValue: 'Cliente criado com sucesso' }));
      }

      router.push(paths.dashboard.customers.list);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('customers.createError', { defaultValue: 'Erro ao salvar cliente' })));
    }
  });

  const handleConfirmDeactivate = async () => {
    if (!enterpriseId || !currentCustomer) return;
    try {
      await deactivateCustomer(enterpriseId, currentCustomer.id);
      toast.success(t('customers.deactivateSuccess', { defaultValue: 'Cliente desativado' }));
      confirmDeactivate.onFalse();
      router.push(paths.dashboard.customers.list);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao desativar'));
    }
  };

  const renderCollapseAction = (open: boolean, onToggle: () => void) => (
    <IconButton onClick={onToggle}>
      <Iconify icon={open ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'} />
    </IconButton>
  );

  return (
    <>
      <Form methods={methods} onSubmit={onSubmit}>
        <Stack spacing={{ xs: 3, md: 5 }} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
          <Card>
            <CardHeader
              title={t('customers.details', { defaultValue: 'Dados e Contato do Cliente' })}
              subheader={t('customers.detailsSubheader', {
                defaultValue: 'Nome, CPF/CNPJ, telefone/WhatsApp e e-mail para contato e rastreabilidade',
              })}
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
                    name="name"
                    label={t('customers.fields.name', { defaultValue: 'Nome / Razão Social' })}
                  />
                  <Field.Text
                    name="document"
                    label={t('customers.fields.document', { defaultValue: 'CPF / CNPJ (opcional)' })}
                    value={formatCpfCnpj(documentWatch)}
                    onChange={(event) => {
                      setValue('document', formatCpfCnpj(event.target.value), {
                        shouldDirty: true,
                      });
                    }}
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
              </Stack>
            </Collapse>
          </Card>

          <Card>
            <CardHeader
              title={t('customers.addressSection', { defaultValue: 'Endereço de Entrega' })}
              subheader={t('customers.addressSubheader', {
                defaultValue: 'CEP, rua, número, bairro e cidade/UF',
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
                    label={t('customers.fields.zipCode', { defaultValue: 'CEP' })}
                    placeholder="00000-000"
                    value={formatCep(zipCodeWatch)}
                    onChange={(event) => {
                      setValue('zipCode', formatCep(event.target.value), { shouldDirty: true });
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
                  columnGap={2}
                  rowGap={3}
                  display="grid"
                  gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(4, 1fr)' }}
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
            </Collapse>
          </Card>

          <Card>
            <CardHeader
              title={t('customers.creditSection', {
                defaultValue: 'Crediário e Rastreabilidade de Débitos',
              })}
              subheader={t('customers.creditSubheader', {
                defaultValue: 'Limite de crédito e saldo devedor atual (compras a prazo / fiado)',
              })}
              action={renderCollapseAction(openCredit.value, openCredit.onToggle)}
              sx={{ mb: 3 }}
            />
            <Collapse in={openCredit.value}>
              <Divider />
              <Stack spacing={3} sx={{ p: 3 }}>
                <Box
                  columnGap={2}
                  rowGap={3}
                  display="grid"
                  gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
                >
                  <Field.Text
                    name="creditLimit"
                    label={t('customers.fields.creditLimit', { defaultValue: 'Limite de crédito' })}
                    placeholder="0.00"
                    type="number"
                    InputLabelProps={{ shrink: true }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Box component="span" sx={{ color: 'text.disabled' }}>
                            R$
                          </Box>
                        </InputAdornment>
                      ),
                    }}
                  />

                  <Field.Text
                    name="currentDebt"
                    label={t('customers.fields.currentDebt', { defaultValue: 'Débito atual em aberto' })}
                    placeholder="0.00"
                    type="number"
                    InputLabelProps={{ shrink: true }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Box component="span" sx={{ color: 'text.disabled' }}>
                            R$
                          </Box>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>

                <Field.Text
                  name="notes"
                  label={t('customers.fields.notes', { defaultValue: 'Observações do cliente' })}
                  multiline
                  rows={3}
                />
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
              label={t('customers.fields.active', { defaultValue: 'Ativo' })}
              slotProps={{
                wrap: { pl: 3, flexGrow: 1 },
                switch: {},
              }}
            />

            <Stack direction="row" spacing={2} alignItems="center" sx={{ ml: 'auto' }}>
              {currentCustomer && (
                <Button
                  color="error"
                  variant="soft"
                  onClick={confirmDeactivate.onTrue}
                  disabled={isSubmitting}
                >
                  {t('customers.deactivate', { defaultValue: 'Desativar' })}
                </Button>
              )}

              <LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
                {currentCustomer
                  ? t('customers.saveSubmit', { defaultValue: 'Salvar alterações' })
                  : t('customers.createSubmit', { defaultValue: 'Criar cliente' })}
              </LoadingButton>
            </Stack>
          </Stack>
        </Stack>
      </Form>

      <ConfirmDialog
        open={confirmDeactivate.value}
        onClose={confirmDeactivate.onFalse}
        title={t('customers.deactivate', { defaultValue: 'Desativar cliente' })}
        content={t('customers.deactivateConfirm', {
          defaultValue: 'Tem certeza de que deseja desativar este cliente?',
        })}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivate}>
            {t('customers.deactivate', { defaultValue: 'Desativar' })}
          </Button>
        }
      />
    </>
  );
}

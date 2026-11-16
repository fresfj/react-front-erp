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

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

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
  address: zod.string().optional().or(zod.literal('')),
  city: zod.string().optional().or(zod.literal('')),
  state: zod.string().optional().or(zod.literal('')),
  zipCode: zod.string().optional().or(zod.literal('')),
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
      address: '',
      city: '',
      state: '',
      zipCode: '',
    },
  });

  const {
    reset,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) return;

    try {
      const created = await createCustomer(enterpriseId, {
        name: data.name.trim(),
        document: data.document?.trim() || undefined,
        phone: data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
        address: data.address?.trim() || undefined,
        city: data.city?.trim() || undefined,
        state: data.state?.trim() || undefined,
        zipCode: data.zipCode?.trim() || undefined,
        currentDebt: 0,
        active: true,
      });

      toast.success(t('customers.createSuccess', { defaultValue: 'Cliente cadastrado com sucesso' }));
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

            <Field.Text
              name="address"
              label={t('customers.fields.address', { defaultValue: 'Endereço completo' })}
            />

            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(3, 1fr)' }}
            >
              <Field.Text
                name="city"
                label={t('customers.fields.city', { defaultValue: 'Cidade' })}
              />
              <Field.Text
                name="state"
                label={t('customers.fields.state', { defaultValue: 'UF' })}
              />
              <Field.Text
                name="zipCode"
                label={t('customers.fields.zipCode', { defaultValue: 'CEP' })}
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

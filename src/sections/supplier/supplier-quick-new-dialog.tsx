import type { Supplier } from 'src/api/firestore/suppliers';

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
import { getSupplier, createSupplier } from 'src/api/firestore/suppliers';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const QuickSupplierSchema = zod.object({
  name: zod.string().min(1, { message: 'Required' }),
  document: zod.string().optional().or(zod.literal('')),
  phone: zod.string().optional().or(zod.literal('')),
  email: zod.union([zod.literal(''), zod.string().email()]).optional(),
  address: zod.string().optional().or(zod.literal('')),
  city: zod.string().optional().or(zod.literal('')),
  state: zod.string().optional().or(zod.literal('')),
});

type QuickSupplierSchemaType = zod.infer<typeof QuickSupplierSchema>;

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (supplier: Supplier) => void;
};

export function SupplierQuickNewDialog({ open, onClose, onCreated }: Props) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const methods = useForm<QuickSupplierSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(QuickSupplierSchema),
    defaultValues: {
      name: '',
      document: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
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
      const id = await createSupplier(enterpriseId, {
        name: data.name.trim(),
        document: data.document?.trim() || undefined,
        phone: data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
        address: data.address?.trim() || undefined,
        city: data.city?.trim() || undefined,
        state: data.state?.trim() || undefined,
        active: true,
      });

      const created = await getSupplier(enterpriseId, id);
      toast.success(t('suppliers.createSuccess'));
      reset();
      if (created) {
        onCreated(created);
      }
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('suppliers.createError')));
    }
  });

  return (
    <Dialog fullWidth maxWidth="sm" open={open} onClose={onClose}>
      <Form methods={methods} onSubmit={onSubmit}>
        <DialogTitle>Novo fornecedor rápido</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
            >
              <Field.Text name="name" label={t('suppliers.fields.name')} />
              <Field.Text
                name="document"
                label="CNPJ / CPF (opcional)"
              />
              <Field.Phone name="phone" label={t('suppliers.fields.phone')} country="BR" />
              <Field.Text name="email" label={t('suppliers.fields.email')} />
            </Box>

            <Field.Text name="address" label="Endereço / Comunidade / Rodovia" />

            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: '2fr 1fr' }}
            >
              <Field.Text name="city" label="Cidade / Município" />
              <Field.Text name="state" label="UF" />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={onClose}>
            Cancelar
          </Button>
          <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
            Salvar e vincular fornecedor
          </LoadingButton>
        </DialogActions>
      </Form>
    </Dialog>
  );
}

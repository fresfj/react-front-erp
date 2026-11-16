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
  document: zod.string().min(1, { message: 'Required' }),
  phone: zod.string().optional().or(zod.literal('')),
  email: zod.union([zod.literal(''), zod.string().email({ message: 'Invalid email' })]).optional(),
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

  const enterpriseId = user?.enterpriseId as string | undefined;
  const canWrite = user?.role !== 'operador';

  const defaultValues = useMemo<SupplierSchemaType>(
    () => ({
      name: currentSupplier?.name || '',
      document: currentSupplier?.document || '',
      phone: currentSupplier?.phone || '',
      email: currentSupplier?.email || '',
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
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

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
        document: data.document.trim(),
        phone: data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
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
      <Iconify icon={open ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'} />
    </IconButton>
  );

  const renderDetails = (
    <Card>
      <CardHeader
        title={t('suppliers.details')}
        subheader={t('suppliers.detailsHint')}
        action={renderCollapseAction(openDetails.value, openDetails.onToggle)}
        sx={{ mb: openDetails.value ? 3 : 0 }}
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
            <Field.Text name="document" label={t('suppliers.fields.document')} />
          </Box>
          <Field.Switch name="active" label={t('suppliers.fields.active')} sx={{ m: 0 }} />
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
        sx={{ mb: openContact.value ? 3 : 0 }}
      />

      <Collapse in={openContact.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          <Box
            columnGap={2}
            rowGap={3}
            display="grid"
            gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
          >
            <Field.Phone name="phone" label={t('suppliers.fields.phone')} country="BR" />
            <Field.Text name="email" label={t('suppliers.fields.email')} />
          </Box>
        </Stack>
      </Collapse>
    </Card>
  );

  const renderActions = (
    <Stack direction="row" spacing={2} justifyContent="flex-end" alignItems="center">
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
  );

  return (
    <>
      <Form methods={methods} onSubmit={onSubmit}>
        <Stack spacing={{ xs: 3, md: 5 }} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
          {renderDetails}
          {renderContact}
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

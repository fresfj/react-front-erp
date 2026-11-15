import type { Supplier } from 'src/api/firestore/suppliers';

import { z as zod } from 'zod';
import { useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Unstable_Grid2';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useTranslate } from 'src/locales';
import { useResponsive } from 'src/hooks/use-responsive';
import { useAuthContext } from 'src/auth/hooks';
import {
  createSupplier,
  updateSupplier,
  deactivateSupplier,
} from 'src/api/firestore/suppliers';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

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
  const mdUp = useResponsive('up', 'md');

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
      toast.error(currentSupplier ? t('suppliers.updateError') : t('suppliers.createError'));
    }
  });

  const handleDeactivate = async () => {
    if (!enterpriseId || !currentSupplier || !canWrite) {
      return;
    }

    try {
      await deactivateSupplier(enterpriseId, currentSupplier.id);
      toast.success(t('suppliers.deactivateSuccess'));
      router.push(paths.dashboard.suppliers.list);
    } catch (error) {
      console.error(error);
      toast.error(t('suppliers.deactivateError'));
    }
  };

  const renderDetails = (
    <>
      {mdUp && (
        <Grid md={4}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            {t('suppliers.details')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('suppliers.detailsHint')}
          </Typography>
        </Grid>
      )}

      <Grid xs={12} md={8}>
        <Card>
          {!mdUp && <CardHeader title={t('suppliers.details')} />}

          <Stack spacing={3} sx={{ p: 3 }}>
            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{
                xs: 'repeat(1, 1fr)',
                sm: 'repeat(2, 1fr)',
              }}
            >
              <Field.Text name="name" label={t('suppliers.fields.name')} />
              <Field.Text name="document" label={t('suppliers.fields.document')} />
            </Box>

            <Field.Switch name="active" label={t('suppliers.fields.active')} sx={{ m: 0 }} />
          </Stack>
        </Card>
      </Grid>
    </>
  );

  const renderContact = (
    <>
      {mdUp && (
        <Grid md={4}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            {t('suppliers.contact')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('suppliers.contactHint')}
          </Typography>
        </Grid>
      )}

      <Grid xs={12} md={8}>
        <Card>
          {!mdUp && <CardHeader title={t('suppliers.contact')} />}

          <Stack spacing={3} sx={{ p: 3 }}>
            <Box
              rowGap={3}
              columnGap={2}
              display="grid"
              gridTemplateColumns={{
                xs: 'repeat(1, 1fr)',
                sm: 'repeat(2, 1fr)',
              }}
            >
              <Field.Text name="phone" label={t('suppliers.fields.phone')} />
              <Field.Text name="email" label={t('suppliers.fields.email')} />
            </Box>
          </Stack>
        </Card>
      </Grid>
    </>
  );

  const renderActions = (
    <>
      {mdUp && <Grid md={4} />}
      <Grid xs={12} md={8} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {canWrite && (
          <LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
            {currentSupplier ? t('suppliers.saveSubmit') : t('suppliers.createSubmit')}
          </LoadingButton>
        )}

        {canWrite && currentSupplier && (
          <Button color="error" variant="soft" onClick={handleDeactivate} disabled={isSubmitting}>
            {t('suppliers.deactivate')}
          </Button>
        )}
      </Grid>
    </>
  );

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Grid container spacing={3}>
        {renderDetails}
        {renderContact}
        {renderActions}
      </Grid>
    </Form>
  );
}

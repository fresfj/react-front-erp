import type { Enterprise } from 'src/api/firestore/platform';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

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
  adminEmail: zod.union([zod.literal(''), zod.string().email()]).optional(),
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
  const isEdit = Boolean(currentEnterprise);

  const defaultValues = useMemo<EnterpriseSchemaType>(
    () => ({
      id: currentEnterprise?.id || '',
      name: currentEnterprise?.name || '',
      adminEmail: currentEnterprise?.adminEmail || '',
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
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    if (currentEnterprise) reset(defaultValues);
  }, [currentEnterprise, defaultValues, reset]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      if (isEdit && currentEnterprise) {
        await updateEnterprise({
          id: currentEnterprise.id,
          name: data.name.trim(),
          active: data.active,
          adminEmail: data.adminEmail?.trim() || '',
        });
        toast.success(t('enterprises.updateSuccess'));
        router.push(paths.dashboard.enterprises.details(currentEnterprise.id));
      } else {
        const created = await createEnterprise({
          id: data.id.trim(),
          name: data.name.trim(),
          adminEmail: data.adminEmail?.trim() || undefined,
        });
        toast.success(t('enterprises.createSuccess'));
        router.push(paths.dashboard.enterprises.details(created.id));
      }
    } catch (error) {
      console.error(error);
      toast.error(isEdit ? t('enterprises.updateError') : t('enterprises.createError'));
    }
  });

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Stack spacing={{ xs: 3, md: 5 }} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
        <Card>
          <CardHeader
            title={t('enterprises.details')}
            subheader={t('enterprises.detailsHint')}
            action={
              <IconButton onClick={openDetails.onToggle}>
                <Iconify
                  icon={
                    openDetails.value
                      ? 'eva:arrow-ios-upward-fill'
                      : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: openDetails.value ? 3 : 0 }}
          />
          <Collapse in={openDetails.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Field.Text
                name="id"
                label={t('enterprises.fields.id')}
                disabled={isEdit}
                helperText={t('enterprises.idHint')}
              />
              <Field.Text name="name" label={t('enterprises.fields.name')} />
              <Field.Text name="adminEmail" label={t('enterprises.fields.adminEmail')} />
              {isEdit && (
                <Field.Switch name="active" label={t('enterprises.fields.active')} sx={{ m: 0 }} />
              )}
            </Stack>
          </Collapse>
        </Card>

        <Stack direction="row" justifyContent="flex-end">
          <LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
            {isEdit ? t('enterprises.saveSubmit') : t('enterprises.createSubmit')}
          </LoadingButton>
        </Stack>
      </Stack>
    </Form>
  );
}

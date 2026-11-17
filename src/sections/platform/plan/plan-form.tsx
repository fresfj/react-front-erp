import type { Plan, PlanCode } from 'src/api/firestore/plans';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import LoadingButton from '@mui/lab/LoadingButton';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { upsertPlan, deactivatePlan } from 'src/api/firestore/billing';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

// ----------------------------------------------------------------------

export const PlanSchema = zod.object({
  code: zod.enum(['free', 'pro', 'ultra']),
  name: zod.string().min(1),
  description: zod.string().optional().or(zod.literal('')),
  priceMonthly: zod.coerce.number().min(0),
  featuresText: zod.string().optional().or(zod.literal('')),
  sortOrder: zod.coerce.number().int(),
  active: zod.boolean(),
});

export type PlanSchemaType = zod.infer<typeof PlanSchema>;

type Props = {
  currentPlan?: Plan;
};

// ----------------------------------------------------------------------

export function PlanForm({ currentPlan }: Props) {
  const router = useRouter();
  const { t } = useTranslate('common');

  const defaultValues = useMemo<PlanSchemaType>(
    () => ({
      code: (currentPlan?.code as PlanCode) || 'pro',
      name: currentPlan?.name || '',
      description: currentPlan?.description || '',
      priceMonthly: currentPlan?.priceMonthly ?? 0,
      featuresText: (currentPlan?.features || []).join('\n'),
      sortOrder: currentPlan?.sortOrder ?? 0,
      active: currentPlan?.active ?? true,
    }),
    [currentPlan]
  );

  const methods = useForm<PlanSchemaType>({
    resolver: zodResolver(PlanSchema),
    defaultValues,
  });

  const {
    reset,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      const features = (data.featuresText || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await upsertPlan({
        id: currentPlan?.id,
        code: data.code,
        name: data.name,
        description: data.description || '',
        priceMonthly: data.priceMonthly,
        currency: 'BRL',
        features,
        sortOrder: data.sortOrder,
        active: data.active,
      });
      toast.success(t('billing.saveSuccess'));
      router.push(paths.dashboard.plans.list);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.saveError')));
    }
  });

  const handleDeactivate = async () => {
    if (!currentPlan?.id) return;
    try {
      await deactivatePlan(currentPlan.id);
      toast.success(t('billing.saveSuccess'));
      router.push(paths.dashboard.plans.list);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.saveError')));
    }
  };

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Card sx={{ p: 3 }}>
        <Stack spacing={3}>
          <Field.Select name="code" label={t('billing.fields.code')}>
            <MenuItem value="free">free</MenuItem>
            <MenuItem value="pro">pro</MenuItem>
            <MenuItem value="ultra">ultra</MenuItem>
          </Field.Select>
          <Field.Text name="name" label={t('billing.fields.name')} />
          <Field.Text name="description" label={t('billing.fields.description')} />
          <Field.Text
            name="priceMonthly"
            label={t('billing.fields.priceMonthly')}
            type="number"
          />
          <Field.Text
            name="featuresText"
            label={t('billing.fields.features')}
            multiline
            rows={4}
          />
          <Field.Text name="sortOrder" label={t('billing.fields.sortOrder')} type="number" />
          <Field.Switch name="active" label={t('billing.fields.active')} />
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            {currentPlan && currentPlan.code !== 'free' && (
              <Button color="error" variant="outlined" onClick={handleDeactivate}>
                {t('billing.deactivate')}
              </Button>
            )}
            <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
              {t('account.saveSubmit')}
            </LoadingButton>
          </Stack>
        </Stack>
      </Card>
    </Form>
  );
}

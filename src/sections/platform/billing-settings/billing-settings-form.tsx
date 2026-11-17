import type { PlatformBillingSettings } from 'src/api/firestore/billing';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import MenuItem from '@mui/material/MenuItem';
import LoadingButton from '@mui/lab/LoadingButton';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { saveBillingSettings } from 'src/api/firestore/billing';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

// ----------------------------------------------------------------------

const Schema = zod.object({
  graceDays: zod.coerce.number().min(0).max(90),
  asaasEnv: zod.enum(['sandbox', 'production']),
  asaasApiKey: zod.string().optional().or(zod.literal('')),
  asaasWebhookToken: zod.string().optional().or(zod.literal('')),
});

type SchemaType = zod.infer<typeof Schema>;

type Props = {
  current?: PlatformBillingSettings | null;
  onSaved?: (next: PlatformBillingSettings) => void;
};

// ----------------------------------------------------------------------

export function BillingSettingsForm({ current, onSaved }: Props) {
  const { t } = useTranslate('common');

  const defaultValues = useMemo<SchemaType>(
    () => ({
      graceDays: current?.graceDays ?? 7,
      asaasEnv: current?.asaasEnv ?? 'sandbox',
      asaasApiKey: '',
      asaasWebhookToken: '',
    }),
    [current]
  );

  const methods = useForm<SchemaType>({
    resolver: zodResolver(Schema),
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
      const next = await saveBillingSettings({
        graceDays: data.graceDays,
        asaasEnv: data.asaasEnv,
        asaasApiKey: data.asaasApiKey || undefined,
        asaasWebhookToken: data.asaasWebhookToken || undefined,
      });
      toast.success(t('billing.saveSuccess'));
      onSaved?.(next);
      reset({
        graceDays: next.graceDays,
        asaasEnv: next.asaasEnv,
        asaasApiKey: '',
        asaasWebhookToken: '',
      });
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.saveError')));
    }
  });

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Card sx={{ p: 3 }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={1}>
            <Chip
              size="small"
              color={current?.asaasApiKeyConfigured ? 'success' : 'warning'}
              label={
                current?.asaasApiKeyConfigured ? 'API Key configurada' : 'API Key pendente'
              }
            />
            <Chip
              size="small"
              color={current?.asaasWebhookTokenConfigured ? 'success' : 'warning'}
              label={
                current?.asaasWebhookTokenConfigured
                  ? 'Webhook token configurado'
                  : 'Webhook token pendente'
              }
            />
          </Stack>
          <Field.Text name="graceDays" label={t('billing.fields.graceDays')} type="number" />
          <Field.Select name="asaasEnv" label={t('billing.fields.asaasEnv')}>
            <MenuItem value="sandbox">sandbox</MenuItem>
            <MenuItem value="production">production</MenuItem>
          </Field.Select>
          <Field.Text
            name="asaasApiKey"
            label={t('billing.fields.asaasApiKey')}
            type="password"
            helperText="Deixe vazio para manter a chave atual"
          />
          <Field.Text
            name="asaasWebhookToken"
            label={t('billing.fields.asaasWebhookToken')}
            type="password"
            helperText="Deixe vazio para manter o token atual"
          />
          <Stack direction="row" justifyContent="flex-end">
            <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
              {t('account.saveSubmit')}
            </LoadingButton>
          </Stack>
        </Stack>
      </Card>
    </Form>
  );
}

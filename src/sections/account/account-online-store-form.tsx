import type { Enterprise, OnlineStoreConfig } from 'src/api/firestore/platform';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import CircularProgress from '@mui/material/CircularProgress';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { getEnterprise } from 'src/api/firestore/platform';
import { upsertOnlineStoreConfigCf } from 'src/api/firestore/online-orders';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

import { normalizeStoreSlug } from 'src/sections/online-store/online-store-domain';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const OnlineStoreSchema = zod.object({
  enabled: zod.boolean(),
  slug: zod.string().min(1),
  estimatedMinutes: zod.coerce.number().min(1),
  acceptDelivery: zod.boolean(),
  acceptPickup: zod.boolean(),
  defaultDeliveryFee: zod.coerce.number().min(0),
  whatsapp: zod.string().optional().or(zod.literal('')),
  paymentMethodsOnDelivery: zod.array(zod.string()).min(1),
  openingHours: zod.array(
    zod.object({
      day: zod.number().min(0).max(6),
      open: zod.string().min(1),
      close: zod.string().min(1),
      closed: zod.boolean(),
    })
  ),
});

type OnlineStoreSchemaType = zod.infer<typeof OnlineStoreSchema>;

function defaultHours(): OnlineStoreSchemaType['openingHours'] {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    open: '09:00',
    close: '22:00',
    closed: day === 0,
  }));
}

function mapEnterpriseToForm(enterprise: Enterprise | null): OnlineStoreSchemaType {
  const store = enterprise?.onlineStore;
  return {
    enabled: store?.enabled === true,
    slug: store?.slug || normalizeStoreSlug(enterprise?.tradeName || enterprise?.name || ''),
    estimatedMinutes: store?.estimatedMinutes ?? 40,
    acceptDelivery: store?.acceptDelivery !== false,
    acceptPickup: store?.acceptPickup !== false,
    defaultDeliveryFee: store?.defaultDeliveryFee ?? enterprise?.defaultDeliveryFee ?? 0,
    whatsapp: store?.whatsapp || '',
    paymentMethodsOnDelivery: store?.paymentMethodsOnDelivery?.length
      ? store.paymentMethodsOnDelivery
      : ['cash', 'pix', 'debit_card', 'credit_card'],
    openingHours: store?.openingHours?.length
      ? store.openingHours.map((h) => ({
          day: Number(h.day),
          open: h.open,
          close: h.close,
          closed: h.closed === true,
        }))
      : defaultHours(),
  };
}

// ----------------------------------------------------------------------

export function AccountOnlineStoreForm() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);

  const canEdit =
    Boolean(user?.platformAdmin) || user?.role === 'admin' || user?.role === 'gestor';

  const defaultValues = useMemo(() => mapEnterpriseToForm(enterprise), [enterprise]);

  const methods = useForm<OnlineStoreSchemaType>({
    resolver: zodResolver(OnlineStoreSchema),
    defaultValues,
  });

  const {
    reset,
    watch,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  useEffect(() => {
    if (!enterpriseId) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    getEnterprise(enterpriseId)
      .then((data) => {
        if (!alive) return;
        setEnterprise(data);
      })
      .catch((err) => {
        console.error(err);
        toast.error(t('onlineStore.loadError'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [enterpriseId, t]);

  const slug = watch('slug');
  const publicUrl =
    typeof window !== 'undefined' && slug
      ? `${window.location.origin}/p/${normalizeStoreSlug(slug)}`
      : `/p/${normalizeStoreSlug(slug || '')}`;

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId || !canEdit) return;
    try {
      const config: OnlineStoreConfig = {
        enabled: data.enabled,
        slug: normalizeStoreSlug(data.slug),
        estimatedMinutes: data.estimatedMinutes,
        acceptDelivery: data.acceptDelivery,
        acceptPickup: data.acceptPickup,
        defaultDeliveryFee: data.defaultDeliveryFee,
        paymentMethodsOnDelivery: data.paymentMethodsOnDelivery.filter(
          (m): m is 'cash' | 'pix' | 'debit_card' | 'credit_card' =>
            m === 'cash' || m === 'pix' || m === 'debit_card' || m === 'credit_card'
        ),
        openingHours: data.openingHours.map((h, index) => ({
          day: index as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          open: h.open,
          close: h.close,
          closed: h.closed,
        })),
        whatsapp: data.whatsapp?.trim() || undefined,
      };
      await upsertOnlineStoreConfigCf(enterpriseId, config);
      toast.success(t('onlineStore.saveSuccess'));
      const next = await getEnterprise(enterpriseId);
      setEnterprise(next);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('onlineStore.saveError')));
    }
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success(t('onlineStore.linkCopied'));
    } catch {
      toast.error(t('onlineStore.saveError'));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Stack spacing={3} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
        <Card>
          <CardHeader title={t('onlineStore.title')} subheader={t('onlineStore.hint')} />
          <Divider />
          <Stack spacing={3} sx={{ p: 3 }}>
            <Field.Switch
              name="enabled"
              label={t('onlineStore.fields.enabled')}
              disabled={!canEdit}
            />
            <Field.Text name="slug" label={t('onlineStore.fields.slug')} disabled={!canEdit} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-all' }}>
                {publicUrl}
              </Typography>
              <Button size="small" variant="outlined" onClick={handleCopy}>
                {t('onlineStore.copyLink')}
              </Button>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Field.Text
                name="estimatedMinutes"
                label={t('onlineStore.fields.estimatedMinutes')}
                type="number"
                disabled={!canEdit}
              />
              <Field.Text
                name="defaultDeliveryFee"
                label={t('onlineStore.fields.defaultDeliveryFee')}
                type="number"
                disabled={!canEdit}
              />
              <Field.Text
                name="whatsapp"
                label={t('onlineStore.fields.whatsapp')}
                disabled={!canEdit}
              />
            </Stack>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Field.Switch
                name="acceptDelivery"
                label={t('onlineStore.fields.acceptDelivery')}
                disabled={!canEdit}
              />
              <Field.Switch
                name="acceptPickup"
                label={t('onlineStore.fields.acceptPickup')}
                disabled={!canEdit}
              />
            </Stack>
            <Field.MultiSelect
              chip
              checkbox
              name="paymentMethodsOnDelivery"
              label={t('onlineStore.fields.paymentMethods')}
              options={[
                { label: 'Dinheiro', value: 'cash' },
                { label: 'PIX', value: 'pix' },
                { label: 'Débito', value: 'debit_card' },
                { label: 'Crédito', value: 'credit_card' },
              ]}
              disabled={!canEdit}
            />
            <Typography variant="subtitle2">{t('onlineStore.fields.openingHours')}</Typography>
            {DAY_LABELS.map((label, index) => (
              <Stack
                key={label}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems="center"
              >
                <Box sx={{ width: 48 }}>
                  <Typography variant="body2">{label}</Typography>
                </Box>
                <Field.Switch
                  name={`openingHours.${index}.closed`}
                  label={t('onlineStore.dayClosed')}
                  disabled={!canEdit}
                />
                <Field.Text
                  name={`openingHours.${index}.open`}
                  label={t('onlineStore.dayOpen')}
                  disabled={!canEdit}
                />
                <Field.Text
                  name={`openingHours.${index}.close`}
                  label={t('onlineStore.dayClose')}
                  disabled={!canEdit}
                />
              </Stack>
            ))}
            {canEdit && (
              <Stack direction="row" justifyContent="flex-end">
                <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
                  {t('account.saveSubmit')}
                </LoadingButton>
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Form>
  );
}

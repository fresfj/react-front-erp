import type { ReceiptModelType } from 'src/api/firestore/platform';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { getEnterprise, updateEnterpriseSettings } from 'src/api/firestore/platform';
import { uploadEnterpriseFiscalCert, saveEnterpriseFiscalSecrets } from 'src/api/firestore/nfce';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const numberOrZero = zod.preprocess(
  (val) => (val === '' || val === null || val === undefined ? 0 : Number(val)),
  zod.number().min(0).default(0)
);

export const AccountFiscalSchema = zod.object({
  taxRegime: zod.enum(['simples', 'presumido', 'real', 'mei']),
  nfceEnabled: zod.boolean(),
  fiscalIssuerProvider: zod.enum(['focus', 'sefaz-direct', 'plugnotas', 'nuvemfiscal']),
  nfceCscId: zod.string().optional().or(zod.literal('')),
  apiToken: zod.string().optional().or(zod.literal('')),
  cscToken: zod.string().optional().or(zod.literal('')),
  certPassword: zod.string().optional().or(zod.literal('')),
  nfceSeries: zod.string().min(1),
  nfceEnvironment: zod.enum(['homologation', 'production']),
  receiptDefaultModel: zod.enum(['58mm', '80mm', 'a5']),
  receiptFooterMessage: zod.string().optional().or(zod.literal('')),
  receiptBold: zod.boolean(),
  receiptShowLogo: zod.boolean(),
  defaultDeliveryFee: numberOrZero,
  passPaymentFeesToCustomer: zod.boolean().default(false),
  creditCardFeeRate: numberOrZero,
  creditCardInstallmentFeeRate: numberOrZero,
  debitCardFeeRate: numberOrZero,
  pixFeeRate: numberOrZero,
  pixFeeFixed: numberOrZero,
  creditTabFeeRate: numberOrZero,
  minInstallmentAmount: numberOrZero,
});

export type AccountFiscalSchemaType = zod.infer<typeof AccountFiscalSchema>;

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

// ----------------------------------------------------------------------

export function AccountFiscalForm() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [hasFiscalSecrets, setHasFiscalSecrets] = useState(false);
  const [savedEnvironment, setSavedEnvironment] = useState<'homologation' | 'production'>(
    'homologation'
  );
  const [savedProvider, setSavedProvider] = useState<'focus' | 'sefaz-direct' | string>('focus');
  const [a1Thumbprint, setA1Thumbprint] = useState('');
  const [a1ExpiresAt, setA1ExpiresAt] = useState('');
  const [pfxFile, setPfxFile] = useState<File | null>(null);
  const openFiscal = useBoolean(true);
  const openFees = useBoolean(true);

  const canEdit =
    Boolean(user?.platformAdmin) || user?.role === 'admin' || user?.role === 'gestor';

  const defaultValues = useMemo<AccountFiscalSchemaType>(
    () => ({
      taxRegime: 'simples',
      nfceEnabled: false,
      fiscalIssuerProvider: 'focus',
      nfceCscId: '',
      apiToken: '',
      cscToken: '',
      certPassword: '',
      nfceSeries: '1',
      nfceEnvironment: 'homologation',
      receiptDefaultModel: '58mm',
      receiptFooterMessage: 'OBRIGADO PELA PREFERÊNCIA! VOLTE SEMPRE',
      receiptBold: true,
      receiptShowLogo: true,
      defaultDeliveryFee: 0,
      passPaymentFeesToCustomer: false,
      creditCardFeeRate: 2.15,
      creditCardInstallmentFeeRate: 1.5,
      debitCardFeeRate: 1.29,
      pixFeeRate: 0,
      pixFeeFixed: 0,
      creditTabFeeRate: 0,
      minInstallmentAmount: 15,
    }),
    []
  );

  const methods = useForm<AccountFiscalSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(AccountFiscalSchema),
    defaultValues,
  });

  const {
    reset,
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const provider = watch('fiscalIssuerProvider');
  const isSefazDirect = provider === 'sefaz-direct';

  useEffect(() => {
    if (!enterpriseId) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    getEnterprise(enterpriseId)
      .then((data) => {
        if (!alive || !data) return;
        setHasFiscalSecrets(Boolean(data.hasFiscalSecrets));
        setSavedEnvironment(data.nfceEnvironment || 'homologation');
        setSavedProvider(data.fiscalIssuerProvider || 'focus');
        setA1Thumbprint(data.a1Thumbprint || '');
        setA1ExpiresAt(data.a1ExpiresAt || '');
        reset({
          taxRegime: data.taxRegime || 'simples',
          nfceEnabled: Boolean(data.nfceEnabled),
          fiscalIssuerProvider: data.fiscalIssuerProvider || 'focus',
          nfceCscId: data.nfceCscId || '',
          apiToken: '',
          cscToken: '',
          certPassword: '',
          nfceSeries: data.nfceSeries || '1',
          nfceEnvironment: data.nfceEnvironment || 'homologation',
          receiptDefaultModel: data.receiptDefaultModel || '58mm',
          receiptFooterMessage:
            data.receiptFooterMessage || 'OBRIGADO PELA PREFERÊNCIA! VOLTE SEMPRE',
          receiptBold: data.receiptBold ?? true,
          receiptShowLogo: data.receiptShowLogo ?? true,
          defaultDeliveryFee: data.defaultDeliveryFee ?? 0,
          passPaymentFeesToCustomer: data.passPaymentFeesToCustomer ?? false,
          creditCardFeeRate: data.creditCardFeeRate ?? 2.15,
          creditCardInstallmentFeeRate: data.creditCardInstallmentFeeRate ?? 1.5,
          debitCardFeeRate: data.debitCardFeeRate ?? 1.29,
          pixFeeRate: data.pixFeeRate ?? 0,
          pixFeeFixed: data.pixFeeFixed ?? 0,
          creditTabFeeRate: data.creditTabFeeRate ?? 0,
          minInstallmentAmount: data.minInstallmentAmount ?? 15,
        });
      })
      .catch((err) => {
        console.error(err);
        toast.error(t('account.fiscalLoadError'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [enterpriseId, reset, t]);

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId || !canEdit) return;

    if (
      data.nfceEnvironment === 'production' &&
      savedEnvironment !== 'production' &&
      !window.confirm(t('fiscal.homologToProdConfirm'))
    ) {
      return;
    }

    if (
      data.fiscalIssuerProvider !== savedProvider &&
      !window.confirm(t('fiscal.switchProviderConfirm'))
    ) {
      return;
    }

    if (data.nfceEnabled && (!data.nfceSeries || !data.taxRegime)) {
      toast.error(t('fiscal.missingSecrets'));
      return;
    }

    try {
      if (data.fiscalIssuerProvider === 'sefaz-direct') {
        if (pfxFile) {
          if (!data.certPassword?.trim()) {
            toast.error(t('fiscal.certPassword'));
            return;
          }
          const pfxBase64 = await fileToBase64(pfxFile);
          const uploaded = await uploadEnterpriseFiscalCert({
            enterpriseId,
            pfxBase64,
            password: data.certPassword.trim(),
            cscId: data.nfceCscId?.trim() || undefined,
            cscToken: data.cscToken?.trim() || undefined,
            provider: 'sefaz-direct',
          });
          setHasFiscalSecrets(true);
          setA1Thumbprint(uploaded.a1Thumbprint || '');
          setA1ExpiresAt(uploaded.a1ExpiresAt || '');
          setPfxFile(null);
          toast.success(t('fiscal.certUploaded'));
        } else if (data.cscToken?.trim() || data.nfceCscId?.trim()) {
          await saveEnterpriseFiscalSecrets({
            enterpriseId,
            provider: 'sefaz-direct',
            cscId: data.nfceCscId?.trim() || undefined,
            cscToken: data.cscToken?.trim() || undefined,
          });
        }
      } else if (data.apiToken?.trim() || data.cscToken?.trim() || data.nfceCscId?.trim()) {
        await saveEnterpriseFiscalSecrets({
          enterpriseId,
          provider: 'focus',
          apiToken: data.apiToken?.trim() || undefined,
          cscId: data.nfceCscId?.trim() || undefined,
          cscToken: data.cscToken?.trim() || undefined,
        });
        setHasFiscalSecrets(true);
      }

      await updateEnterpriseSettings(enterpriseId, {
        taxRegime: data.taxRegime,
        nfceEnabled: data.nfceEnabled,
        fiscalIssuerProvider: data.fiscalIssuerProvider,
        nfceCscId: data.nfceCscId || undefined,
        nfceSeries: data.nfceSeries,
        nfceEnvironment: data.nfceEnvironment,
        receiptDefaultModel: data.receiptDefaultModel as ReceiptModelType,
        receiptFooterMessage: data.receiptFooterMessage || undefined,
        receiptBold: data.receiptBold,
        receiptShowLogo: data.receiptShowLogo,
        defaultDeliveryFee: Number(data.defaultDeliveryFee ?? 0),
        passPaymentFeesToCustomer: data.passPaymentFeesToCustomer,
        creditCardFeeRate: Number(data.creditCardFeeRate ?? 0),
        creditCardInstallmentFeeRate: Number(data.creditCardInstallmentFeeRate ?? 0),
        debitCardFeeRate: Number(data.debitCardFeeRate ?? 0),
        pixFeeRate: Number(data.pixFeeRate ?? 0),
        pixFeeFixed: Number(data.pixFeeFixed ?? 0),
        creditTabFeeRate: Number(data.creditTabFeeRate ?? 0),
        minInstallmentAmount: Number(data.minInstallmentAmount ?? 15),
      });
      setSavedEnvironment(data.nfceEnvironment);
      setSavedProvider(data.fiscalIssuerProvider);
      setValue('apiToken', '');
      setValue('cscToken', '');
      setValue('certPassword', '');
      toast.success(t('account.fiscalSaveSuccess'));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('account.fiscalSaveError')));
    }
  });

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
          <CardHeader
            title={t('account.fiscalReceiptTitle')}
            subheader={t('account.fiscalReceiptHint')}
            action={
              <IconButton onClick={openFiscal.onToggle}>
                <Iconify
                  icon={
                    openFiscal.value ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: 3 }}
          />
          <Collapse in={openFiscal.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              {!hasFiscalSecrets && (
                <Alert severity="warning">{t('fiscal.missingSecrets')}</Alert>
              )}
              {isSefazDirect && (
                <Alert severity="info">{t('fiscal.ufPilotHint')}</Alert>
              )}
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(3, 1fr)' }}
              >
                <Field.Select name="taxRegime" label={t('fiscal.taxRegime')} disabled={!canEdit}>
                  <MenuItem value="simples">Simples Nacional</MenuItem>
                  <MenuItem value="presumido">Lucro Presumido</MenuItem>
                  <MenuItem value="real">Lucro Real</MenuItem>
                  <MenuItem value="mei">MEI</MenuItem>
                </Field.Select>
                <Field.Select
                  name="fiscalIssuerProvider"
                  label={t('fiscal.provider')}
                  disabled={!canEdit}
                >
                  <MenuItem value="focus">Focus NFe</MenuItem>
                  <MenuItem value="sefaz-direct">{t('fiscal.sefazDirect')}</MenuItem>
                  <MenuItem value="plugnotas" disabled>
                    PlugNotas
                  </MenuItem>
                  <MenuItem value="nuvemfiscal" disabled>
                    NuvemFiscal
                  </MenuItem>
                </Field.Select>
                <Field.Switch name="nfceEnabled" label={t('fiscal.nfceEnabled')} disabled={!canEdit} />
                <Field.Text
                  name="nfceSeries"
                  label={t('account.fields.nfceSeries')}
                  disabled={!canEdit}
                />
                <Field.Select
                  name="nfceEnvironment"
                  label={t('account.fields.nfceEnvironment')}
                  disabled={!canEdit}
                >
                  <MenuItem value="homologation">{t('account.nfceHomologation')}</MenuItem>
                  <MenuItem value="production">{t('account.nfceProduction')}</MenuItem>
                </Field.Select>
                <Field.Select
                  name="receiptDefaultModel"
                  label={t('account.fields.receiptDefaultModel')}
                  disabled={!canEdit}
                >
                  <MenuItem value="58mm">58mm</MenuItem>
                  <MenuItem value="80mm">80mm</MenuItem>
                  <MenuItem value="a5">A5</MenuItem>
                </Field.Select>
                <Field.Text name="nfceCscId" label={t('fiscal.cscId')} disabled={!canEdit} />
                {!isSefazDirect && (
                  <Field.Text
                    name="apiToken"
                    label={t('fiscal.apiToken')}
                    type="password"
                    disabled={!canEdit}
                    helperText={
                      hasFiscalSecrets
                        ? 'Token já configurado — deixe em branco para manter'
                        : undefined
                    }
                  />
                )}
                <Field.Text
                  name="cscToken"
                  label={t('fiscal.cscToken')}
                  type="password"
                  disabled={!canEdit}
                />
              </Box>

              {isSefazDirect && (
                <Stack spacing={2}>
                  {(a1Thumbprint || a1ExpiresAt) && (
                    <Alert severity="success">
                      {t('fiscal.certUploaded')}
                      {a1ExpiresAt ? ` — ${t('fiscal.certExpires')}: ${a1ExpiresAt}` : ''}
                      {a1Thumbprint
                        ? ` — ${t('fiscal.certThumbprint')}: ${a1Thumbprint.slice(0, 16)}…`
                        : ''}
                    </Alert>
                  )}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                    <Button variant="outlined" component="label" disabled={!canEdit}>
                      {t('fiscal.uploadCert')}
                      <input
                        hidden
                        type="file"
                        accept=".pfx,.p12,application/x-pkcs12"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          setPfxFile(file);
                        }}
                      />
                    </Button>
                    <Typography variant="body2" color="text.secondary">
                      {pfxFile ? pfxFile.name : '—'}
                    </Typography>
                  </Stack>
                  <Field.Text
                    name="certPassword"
                    label={t('fiscal.certPassword')}
                    type="password"
                    disabled={!canEdit}
                  />
                </Stack>
              )}

              <Field.Text
                name="receiptFooterMessage"
                label={t('account.fields.receiptFooterMessage')}
                disabled={!canEdit}
                multiline
                rows={2}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                <Field.Switch
                  name="receiptBold"
                  label={t('account.fields.receiptBold')}
                  disabled={!canEdit}
                />
                <Field.Switch
                  name="receiptShowLogo"
                  label={t('account.fields.receiptShowLogo')}
                  disabled={!canEdit}
                />
              </Stack>
            </Stack>
          </Collapse>
        </Card>

        <Card>
          <CardHeader
            title={t('account.fiscalFeesTitle')}
            subheader={t('account.fiscalFeesHint')}
            action={
              <IconButton onClick={openFees.onToggle}>
                <Iconify
                  icon={
                    openFees.value ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: 3 }}
          />
          <Collapse in={openFees.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: 'background.neutral',
                  border: (theme) => `1px dashed ${theme.vars.palette.divider}`,
                }}
              >
                <Field.Switch
                  name="passPaymentFeesToCustomer"
                  label={t('account.fields.passPaymentFeesToCustomer')}
                  disabled={!canEdit}
                />
              </Box>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{
                  xs: 'repeat(1, 1fr)',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(4, 1fr)',
                }}
              >
                <Field.Text
                  type="number"
                  name="defaultDeliveryFee"
                  label={t('account.fields.defaultDeliveryFee')}
                  disabled={!canEdit}
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">R$</InputAdornment>,
                  }}
                />
                <Field.Text
                  type="number"
                  name="creditCardFeeRate"
                  label={t('account.fields.creditCardFeeRate')}
                  disabled={!canEdit}
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
                <Field.Text
                  type="number"
                  name="creditCardInstallmentFeeRate"
                  label={t('account.fields.creditCardInstallmentFeeRate')}
                  disabled={!canEdit}
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
                <Field.Text
                  type="number"
                  name="debitCardFeeRate"
                  label={t('account.fields.debitCardFeeRate')}
                  disabled={!canEdit}
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
                <Field.Text
                  type="number"
                  name="pixFeeRate"
                  label={t('account.fields.pixFeeRate')}
                  disabled={!canEdit}
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
                <Field.Text
                  type="number"
                  name="pixFeeFixed"
                  label={t('account.fields.pixFeeFixed')}
                  disabled={!canEdit}
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">R$</InputAdornment>,
                  }}
                />
                <Field.Text
                  type="number"
                  name="creditTabFeeRate"
                  label={t('account.fields.creditTabFeeRate')}
                  disabled={!canEdit}
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
                <Field.Text
                  type="number"
                  name="minInstallmentAmount"
                  label={t('account.fields.minInstallmentAmount')}
                  disabled={!canEdit}
                  inputProps={{ min: 1, step: 'any' }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">R$</InputAdornment>,
                  }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {t('account.fiscalFeesHelp')}
              </Typography>
            </Stack>
          </Collapse>
        </Card>

        {canEdit && (
          <Stack direction="row" justifyContent="flex-end">
            <LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
              {t('account.saveSubmit')}
            </LoadingButton>
          </Stack>
        )}
      </Stack>
    </Form>
  );
}

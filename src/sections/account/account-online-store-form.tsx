import type { Enterprise, OnlineStoreConfig } from 'src/api/firestore/platform';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import ToggleButton from '@mui/material/ToggleButton';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { AvatarShape } from 'src/assets/illustrations';
import { getEnterprise } from 'src/api/firestore/platform';
import { upsertOnlineStoreConfigCf } from 'src/api/firestore/online-orders';
import { uploadStoreLogo, uploadStoreBanner } from 'src/api/firestore/storage';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

import { normalizeStoreSlug } from 'src/sections/online-store/online-store-domain';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const OnlineStoreSchema = zod.object({
  enabled: zod.boolean(),
  slug: zod.string().min(1),
  description: zod.string().max(320).optional().or(zod.literal('')),
  logoUrl: zod.any().optional(),
  bannerUrl: zod.any().optional(),
  bannerFit: zod.enum(['cover', 'contain']).default('cover'),
  bannerPositionY: zod.coerce.number().min(0).max(100).default(50),
  logoFit: zod.enum(['cover', 'contain']).default('cover'),
  minOrderAmount: zod.coerce.number().min(0).optional(),
  estimatedMinutes: zod.coerce.number().min(1),
  acceptDelivery: zod.boolean(),
  acceptPickup: zod.boolean(),
  defaultDeliveryFee: zod.coerce.number().min(0),
  whatsapp: zod.string().optional().or(zod.literal('')),
  instagramUrl: zod.string().optional().or(zod.literal('')),
  googleReviewUrl: zod.string().optional().or(zod.literal('')),
  paymentMethodsOnDelivery: zod.array(zod.string()).min(1),
  acceptOnlinePix: zod.boolean().default(true),
  pixKey: zod.string().optional().or(zod.literal('')),
  pixMerchantName: zod.string().optional().or(zod.literal('')),
  pixMerchantCity: zod.string().optional().or(zod.literal('')),
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
    description: store?.description || '',
    logoUrl: store?.logoUrl || null,
    bannerUrl: store?.bannerUrl || null,
    bannerFit: store?.bannerFit === 'contain' ? 'contain' : 'cover',
    bannerPositionY: typeof store?.bannerPositionY === 'number' ? store.bannerPositionY : 50,
    logoFit: store?.logoFit === 'contain' ? 'contain' : 'cover',
    minOrderAmount: store?.minOrderAmount ?? 0,
    estimatedMinutes: store?.estimatedMinutes ?? 40,
    acceptDelivery: store?.acceptDelivery !== false,
    acceptPickup: store?.acceptPickup !== false,
    defaultDeliveryFee: store?.defaultDeliveryFee ?? enterprise?.defaultDeliveryFee ?? 0,
    whatsapp: store?.whatsapp || '',
    instagramUrl: store?.instagramUrl || '',
    googleReviewUrl: store?.googleReviewUrl || '',
    paymentMethodsOnDelivery: store?.paymentMethodsOnDelivery?.length
      ? store.paymentMethodsOnDelivery
      : ['cash', 'pix', 'debit_card', 'credit_card'],
    acceptOnlinePix: store?.acceptOnlinePix !== false,
    pixKey: store?.pixKey || '',
    pixMerchantName: store?.pixMerchantName || enterprise?.tradeName || enterprise?.name || '',
    pixMerchantCity: store?.pixMerchantCity || enterprise?.city || '',
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
  const openBranding = useBoolean(true);
  const openSettings = useBoolean(true);

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
    setValue,
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
  const bannerValue = watch('bannerUrl');
  const logoValue = watch('logoUrl');
  const bannerFit = watch('bannerFit');
  const bannerPositionY = watch('bannerPositionY');
  const logoFit = watch('logoFit');

  const [bannerPreview, setBannerPreview] = useState<string | undefined>(undefined);
  const [logoPreview, setLogoPreview] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (bannerValue instanceof File) {
      const url = URL.createObjectURL(bannerValue);
      setBannerPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setBannerPreview(typeof bannerValue === 'string' && bannerValue ? bannerValue : undefined);
    return undefined;
  }, [bannerValue]);

  useEffect(() => {
    if (logoValue instanceof File) {
      const url = URL.createObjectURL(logoValue);
      setLogoPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setLogoPreview(typeof logoValue === 'string' && logoValue ? logoValue : undefined);
    return undefined;
  }, [logoValue]);

  const publicUrl =
    typeof window !== 'undefined' && slug
      ? `${window.location.origin}/p/${normalizeStoreSlug(slug)}`
      : `/p/${normalizeStoreSlug(slug || '')}`;

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId || !canEdit) return;
    try {
      let resolvedLogoUrl: string | undefined =
        typeof data.logoUrl === 'string' && data.logoUrl
          ? data.logoUrl
          : enterprise?.onlineStore?.logoUrl;
      if (data.logoUrl instanceof File) {
        resolvedLogoUrl = await uploadStoreLogo(enterpriseId, data.logoUrl);
      } else if (data.logoUrl === null) {
        resolvedLogoUrl = undefined;
      }

      let resolvedBannerUrl: string | undefined =
        typeof data.bannerUrl === 'string' && data.bannerUrl
          ? data.bannerUrl
          : enterprise?.onlineStore?.bannerUrl;
      if (data.bannerUrl instanceof File) {
        resolvedBannerUrl = await uploadStoreBanner(enterpriseId, data.bannerUrl);
      } else if (data.bannerUrl === null) {
        resolvedBannerUrl = undefined;
      }

      const config: OnlineStoreConfig = {
        enabled: data.enabled,
        slug: normalizeStoreSlug(data.slug),
        description: data.description?.trim() || undefined,
        logoUrl: resolvedLogoUrl,
        bannerUrl: resolvedBannerUrl,
        bannerFit: data.bannerFit,
        bannerPositionY: data.bannerPositionY,
        logoFit: data.logoFit,
        minOrderAmount: data.minOrderAmount ?? 0,
        estimatedMinutes: data.estimatedMinutes,
        acceptDelivery: data.acceptDelivery,
        acceptPickup: data.acceptPickup,
        defaultDeliveryFee: data.defaultDeliveryFee,
        paymentMethodsOnDelivery: data.paymentMethodsOnDelivery.filter(
          (m): m is 'cash' | 'pix' | 'debit_card' | 'credit_card' =>
            m === 'cash' || m === 'pix' || m === 'debit_card' || m === 'credit_card'
        ),
        acceptOnlinePix: data.acceptOnlinePix,
        pixKey: data.pixKey?.trim() || undefined,
        pixMerchantName: data.pixMerchantName?.trim() || undefined,
        pixMerchantCity: data.pixMerchantCity?.trim() || undefined,
        openingHours: data.openingHours.map((h, index) => ({
          day: index as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          open: h.open,
          close: h.close,
          closed: h.closed,
        })),
        whatsapp: data.whatsapp?.trim() || undefined,
        instagramUrl: data.instagramUrl?.trim() || undefined,
        googleReviewUrl: data.googleReviewUrl?.trim() || undefined,
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
        {/* Identidade Visual (Logo e Banner da Loja) */}
        <Card>
          <CardHeader
            title="Identidade Visual da Loja"
            subheader="Personalize a capa e o logo que aparecem no topo do cardápio online"
            action={
              <IconButton onClick={openBranding.onToggle}>
                <Iconify
                  icon={
                    openBranding.value
                      ? 'eva:arrow-ios-upward-fill'
                      : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: 3 }}
          />
          <Collapse in={openBranding.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Banner de Capa da Loja
                </Typography>
                <Field.Upload
                  name="bannerUrl"
                  maxSize={3145728}
                  onDelete={() => setValue('bannerUrl', null, { shouldValidate: true })}
                  helperText={
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', display: 'block', mt: 1 }}
                    >
                      Recomendado: 1200x400 (PNG, JPG ou WebP de até 3MB)
                    </Typography>
                  }
                  disabled={!canEdit}
                />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5, alignSelf: 'flex-start' }}>
                  Logo da Marca
                </Typography>
                <Field.UploadAvatar
                  name="logoUrl"
                  maxSize={3145728}
                  helperText={
                    <Typography
                      variant="caption"
                      sx={{
                        mt: 1.5,
                        mx: 'auto',
                        display: 'block',
                        textAlign: 'center',
                        color: 'text.secondary',
                      }}
                    >
                      Logo ou ícone (quadrado ou redondo, até 3MB)
                    </Typography>
                  }
                  disabled={!canEdit}
                />
              </Box>

              <Divider sx={{ borderStyle: 'dashed' }} />

              {/* Controles de Enquadramento e Posicionamento */}
              <Stack spacing={2.5}>
                <Typography variant="subtitle2">
                  Posicionamento e Enquadramento no Catálogo Online
                </Typography>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Exibição do Banner
                    </Typography>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      fullWidth
                      value={bannerFit}
                      disabled={!canEdit}
                      onChange={(_, val) => {
                        if (val) setValue('bannerFit', val, { shouldDirty: true });
                      }}
                    >
                      <ToggleButton value="contain">Imagem Inteira (Sem cortar)</ToggleButton>
                      <ToggleButton value="cover">Preencher (Ajustar foco)</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Exibição da Logo
                    </Typography>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      fullWidth
                      value={logoFit}
                      disabled={!canEdit}
                      onChange={(_, val) => {
                        if (val) setValue('logoFit', val, { shouldDirty: true });
                      }}
                    >
                      <ToggleButton value="cover">Preencher círculo</ToggleButton>
                      <ToggleButton value="contain">Logo inteira</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </Stack>

                {bannerFit === 'cover' && (
                  <Box>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Posição Vertical do Banner (Foco)
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {bannerPositionY}% (
                        {bannerPositionY <= 25
                          ? 'Topo'
                          : bannerPositionY >= 75
                            ? 'Base'
                            : 'Centro'}
                        )
                      </Typography>
                    </Stack>
                    <Slider
                      value={bannerPositionY}
                      min={0}
                      max={100}
                      step={5}
                      disabled={!canEdit}
                      onChange={(_, val) =>
                        setValue('bannerPositionY', Number(val), { shouldDirty: true })
                      }
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${v}%`}
                    />
                  </Box>
                )}

                {/* Prévia ao vivo exata do topo da vitrine */}
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 1 }}
                  >
                    Prévia no Catálogo Online
                  </Typography>

                  <Card
                    variant="outlined"
                    sx={{
                      maxWidth: 520,
                      mx: 'auto',
                      borderRadius: 2,
                      textAlign: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <Box sx={{ position: 'relative' }}>
                      <AvatarShape
                        sx={{
                          left: 0,
                          right: 0,
                          zIndex: 10,
                          mx: 'auto',
                          bottom: -26,
                          position: 'absolute',
                        }}
                      />

                      <Avatar
                        alt={enterprise?.tradeName || enterprise?.name || 'Loja'}
                        src={logoPreview}
                        sx={{
                          width: 68,
                          height: 68,
                          zIndex: 11,
                          left: 0,
                          right: 0,
                          bottom: -34,
                          mx: 'auto',
                          position: 'absolute',
                          bgcolor: 'background.paper',
                          color: 'primary.darker',
                          fontWeight: 800,
                          fontSize: 24,
                          boxShadow: (theme) => theme.customShadows.z8,
                          '& img': {
                            objectFit: logoFit === 'contain' ? 'contain' : 'cover',
                          },
                        }}
                      >
                        {(enterprise?.tradeName || enterprise?.name || 'L')
                          .charAt(0)
                          .toUpperCase()}
                      </Avatar>

                      {bannerPreview ? (
                        bannerFit === 'contain' ? (
                          <Box
                            component="img"
                            src={bannerPreview}
                            alt="Prévia do banner"
                            sx={{
                              width: 1,
                              height: 'auto',
                              display: 'block',
                              objectFit: 'contain',
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              position: 'relative',
                              width: 1,
                              height: { xs: 170, sm: 210 },
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              component="img"
                              src={bannerPreview}
                              alt="Prévia do banner"
                              sx={{
                                width: 1,
                                height: 1,
                                display: 'block',
                                objectFit: 'cover',
                                objectPosition: `50% ${bannerPositionY}%`,
                              }}
                            />
                            <Box
                              sx={{
                                inset: 0,
                                position: 'absolute',
                                pointerEvents: 'none',
                                background:
                                  'linear-gradient(180deg, rgba(0,0,0,0) 65%, rgba(0,0,0,0.22) 100%)',
                              }}
                            />
                          </Box>
                        )
                      ) : (
                        <Box
                          sx={{
                            height: 150,
                            background: (theme) =>
                              `linear-gradient(135deg, ${theme.vars.palette.primary.darker} 0%, ${theme.vars.palette.primary.main} 100%)`,
                          }}
                        />
                      )}
                    </Box>

                    <Box sx={{ pt: 5.5, pb: 2, px: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        {enterprise?.tradeName || enterprise?.name || 'Sua Loja'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Prévia aproximada de como o topo aparece para o cliente
                      </Typography>
                    </Box>
                  </Card>
                </Box>
              </Stack>
            </Stack>
          </Collapse>
        </Card>

        <Card>
          <CardHeader
            title={t('onlineStore.title')}
            subheader={t('onlineStore.hint')}
            action={
              <IconButton onClick={openSettings.onToggle}>
                <Iconify
                  icon={
                    openSettings.value
                      ? 'eva:arrow-ios-upward-fill'
                      : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: 3 }}
          />
          <Collapse in={openSettings.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Field.Switch
                name="enabled"
                label={t('onlineStore.fields.enabled')}
                disabled={!canEdit}
              />
              <Field.Text name="slug" label={t('onlineStore.fields.slug')} disabled={!canEdit} />
              <Field.Text
                name="description"
                label="Descrição da loja (SEO / WhatsApp / Redes Sociais)"
                placeholder="Ex: O melhor açaí artesanal da região! Peça online com entrega rápida ou retirada no balcão."
                helperText="Usada nos resultados do Google e na prévia ao compartilhar o link no WhatsApp."
                multiline
                rows={2}
                disabled={!canEdit}
              />
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
                  name="minOrderAmount"
                  label="Pedido mínimo (R$)"
                  type="number"
                  disabled={!canEdit}
                />
                <Field.Text
                  name="whatsapp"
                  label={t('onlineStore.fields.whatsapp')}
                  placeholder="(91) 98505-6600"
                  disabled={!canEdit}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Field.Text
                  name="instagramUrl"
                  label={t('onlineStore.fields.instagramUrl', {
                    defaultValue: 'Instagram (link ou @usuario)',
                  })}
                  placeholder="https://instagram.com/suaempresa ou @suaempresa"
                  disabled={!canEdit}
                />
                <Field.Text
                  name="googleReviewUrl"
                  label={t('onlineStore.fields.googleReviewUrl', {
                    defaultValue: 'Link de Avaliação (Google Meu Negócio)',
                  })}
                  placeholder="https://g.page/r/.../review"
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

              <Stack
                spacing={2}
                sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}
              >
                <Field.Switch
                  name="acceptOnlinePix"
                  label="Habilitar PIX Online no Checkout (gera QR Code e aguarda confirmação da loja)"
                  disabled={!canEdit}
                />

                <Field.Text
                  name="pixKey"
                  label="Chave PIX da loja (CPF, CNPJ, E-mail, Telefone ou Aleatória)"
                  placeholder="Ex.: 12.345.678/0001-99 ou pix@sualoja.com.br"
                  disabled={!canEdit}
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Field.Text
                    name="pixMerchantName"
                    label="Nome do recebedor (PIX)"
                    placeholder="Ex.: Acai da Praca"
                    disabled={!canEdit}
                  />
                  <Field.Text
                    name="pixMerchantCity"
                    label="Cidade do recebedor (PIX)"
                    placeholder="Ex.: Sao Paulo"
                    disabled={!canEdit}
                  />
                </Stack>
              </Stack>
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

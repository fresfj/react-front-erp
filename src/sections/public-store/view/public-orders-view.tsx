import type { PublicOrderTracking } from 'src/api/firestore/online-orders';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { formatPhoneBr, isCompletePhoneBr } from 'src/utils/br-docs';

import {
  getPublicStorefrontCf,
  listPublicOrdersByPhoneCf,
} from 'src/api/firestore/online-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Form } from 'src/components/hook-form';
import { Iconify } from 'src/components/iconify';

import { usePublicCart } from '../public-cart-context';
import { OrderCardSkeleton } from '../public-store-skeletons';
import { PAYMENT_METHOD_CONFIG } from '../public-store-helpers';
import { PublicOrdersLookupSchema } from '../public-store-validation';
import { getFulfillmentLabel, OrderProgressStepper } from '../order-progress-stepper';

import type { PublicCartLine } from '../public-cart-context';
import type { PublicOrdersLookupValues } from '../public-store-validation';

// ----------------------------------------------------------------------

const PHONE_STORAGE_KEY = (slug: string) => `onlineStore:customerPhone:${slug}`;
const IDENTITY_STORAGE_KEY = (slug: string) => `onlineStore:customerIdentity:${slug}`;

type SavedCustomerIdentity = {
  phone: string;
  firstName: string;
  fullName?: string;
};

function readSavedIdentity(slug: string): SavedCustomerIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY(slug));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedCustomerIdentity>;
      if (parsed?.phone && parsed?.firstName) {
        return {
          phone: formatPhoneBr(String(parsed.phone)),
          firstName: String(parsed.firstName).trim(),
          fullName: parsed.fullName ? String(parsed.fullName).trim() : undefined,
        };
      }
    }
  } catch {
    // ignore storage parse failure
  }
  return null;
}

function stripTablePrefix(rawName: string): string {
  return String(rawName || '')
    .replace(/^mesa\s+\S+\s*[·•-]\s*/i, '')
    .trim();
}

function normalizeFirstNameClient(rawName: string): string {
  const cleaned = stripTablePrefix(rawName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ')[0] || '';
}

function matchesCustomerFirstName(orderCustomerName: string, requestedFirstName: string): boolean {
  const target = normalizeFirstNameClient(requestedFirstName);
  const actual = normalizeFirstNameClient(orderCustomerName);
  if (!target || !actual) return false;
  return actual === target;
}

function readLegacyPhone(slug: string): string {
  try {
    const saved = localStorage.getItem(PHONE_STORAGE_KEY(slug));
    return saved ? formatPhoneBr(saved) : '';
  } catch {
    return '';
  }
}

export function PublicOrdersView() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const cart = usePublicCart();

  const initialIdentity = readSavedIdentity(slug);

  const [identifiedCustomer, setIdentifiedCustomer] = useState<SavedCustomerIdentity | null>(
    initialIdentity
  );
  const [loading, setLoading] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [orders, setOrders] = useState<PublicOrderTracking[]>([]);

  const methods = useForm<PublicOrdersLookupValues>({
    resolver: zodResolver(PublicOrdersLookupSchema),
    mode: 'onTouched',
    defaultValues: {
      phone: initialIdentity?.phone || readLegacyPhone(slug),
      firstName: initialIdentity?.firstName || '',
    },
  });

  const { control, watch, reset, handleSubmit } = methods;
  const watchedPhone = watch('phone');
  const watchedFirstName = watch('firstName');

  const handleSearch = useCallback(
    async (phoneToQuery: string, firstNameToQuery: string) => {
      if (!isCompletePhoneBr(phoneToQuery)) {
        toast.error('Informe um número de telefone válido com DDD.');
        return;
      }
      const cleanFirstName = firstNameToQuery.trim().split(/\s+/)[0] || '';
      if (cleanFirstName.length < 2) {
        toast.error('Informe seu primeiro nome para localizar seus pedidos.');
        return;
      }
      setLoading(true);
      try {
        const res = await listPublicOrdersByPhoneCf(slug, phoneToQuery, cleanFirstName);
        // Filtro defensivo também no cliente (garante correspondência exata de primeiro nome + telefone)
        const matchingOrders = (res.orders || [])
          .filter((o) => matchesCustomerFirstName(o.customerName, cleanFirstName))
          .slice(0, 5);
        setOrders(matchingOrders);
        setSearched(true);

        if (matchingOrders.length > 0) {
          const cleanMatchedFullName =
            stripTablePrefix(matchingOrders[0]?.customerName || '') || cleanFirstName;
          const identity: SavedCustomerIdentity = {
            phone: formatPhoneBr(phoneToQuery),
            firstName: cleanFirstName,
            fullName: cleanMatchedFullName,
          };
          setIdentifiedCustomer(identity);
          try {
            localStorage.setItem(PHONE_STORAGE_KEY(slug), identity.phone);
            localStorage.setItem(IDENTITY_STORAGE_KEY(slug), JSON.stringify(identity));
          } catch {
            // ignore storage failure
          }
        } else {
          setIdentifiedCustomer(null);
        }
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Não foi possível consultar os pedidos.'));
      } finally {
        setLoading(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    if (identifiedCustomer && isCompletePhoneBr(identifiedCustomer.phone) && identifiedCustomer.firstName) {
      handleSearch(identifiedCustomer.phone, identifiedCustomer.firstName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const onFormSubmit = handleSubmit((data) => {
    handleSearch(data.phone, data.firstName);
  });

  const handleSwitchCustomer = () => {
    try {
      localStorage.removeItem(IDENTITY_STORAGE_KEY(slug));
      localStorage.removeItem(PHONE_STORAGE_KEY(slug));
    } catch {
      // ignore storage error
    }
    setIdentifiedCustomer(null);
    reset({ phone: '', firstName: '' });
    setOrders([]);
    setSearched(false);
  };

  const handleReorder = async (order: PublicOrderTracking) => {
    setReorderingId(order.id);
    try {
      const store = await getPublicStorefrontCf(slug);
      const productMap = new Map(store.products.map((p) => [p.id, p]));

      const nextLines: PublicCartLine[] = [];
      const unavailableNames: string[] = [];

      order.items.forEach((item) => {
        const currentProduct = productMap.get(item.productId);
        if (!currentProduct) {
          unavailableNames.push(item.productName);
          return;
        }
        nextLines.push({
          productId: currentProduct.id,
          name: currentProduct.name,
          unitPrice: currentProduct.salePrice,
          qty: Math.max(1, Number(item.qty || 1)),
          imageUrl: currentProduct.imageUrl,
          notes: item.notes,
        });
      });

      if (nextLines.length === 0) {
        toast.error('Os itens deste pedido não estão mais disponíveis no cardápio atual.');
        return;
      }

      cart.replaceLines(nextLines);

      if (unavailableNames.length > 0) {
        toast.warning(
          `Alguns itens indisponíveis foram removidos (${unavailableNames.join(', ')}). Revise seu carrinho no checkout.`
        );
      } else {
        toast.success('Itens do pedido anterior adicionados ao carrinho!');
      }

      navigate(paths.publicStore.checkout(slug), { state: { store } });
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Não foi possível refazer este pedido.'));
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', width: '100%', bgcolor: 'background.default', pb: 8 }}>
      {/* Barra superior fixa fullscreen */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          width: '100%',
          bgcolor: 'background.paper',
          borderBottom: (theme) => `1px solid ${theme.vars.palette.divider}`,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            maxWidth: 840,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            py: 1.75,
          }}
        >
          <Button
            color="inherit"
            startIcon={<Iconify icon="eva:arrow-back-fill" />}
            onClick={() => navigate(paths.publicStore.root(slug))}
            sx={{ fontWeight: 700 }}
          >
            Voltar ao cardápio
          </Button>

          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Meus Pedidos
          </Typography>
        </Stack>
      </Box>

      {/* Conteúdo */}
      <Box sx={{ maxWidth: 840, mx: 'auto', px: { xs: 2, sm: 3 }, pt: 3 }}>
        {/* Cartão de cliente identificado (salvo no localStorage) OU formulário Telefone + 1º Nome */}
        {identifiedCustomer ? (
          <Card sx={{ p: { xs: 2.5, sm: 3 }, mb: 3, borderRadius: 2 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ sm: 'center' }}
              justifyContent="space-between"
              spacing={2}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700 }}>
                  {(identifiedCustomer.fullName || identifiedCustomer.firstName)
                    .charAt(0)
                    .toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Olá, {identifiedCustomer.fullName || identifiedCustomer.firstName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {identifiedCustomer.phone} • Exibindo até os últimos 5 pedidos
                  </Typography>
                </Box>
              </Stack>

              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={<Iconify icon="solar:user-cross-bold-duotone" />}
                onClick={handleSwitchCustomer}
                sx={{ flexShrink: 0, fontWeight: 600 }}
              >
                Entrar com outro cliente
              </Button>
            </Stack>
          </Card>
        ) : (
          <Card sx={{ p: { xs: 2.5, sm: 3 }, mb: 3, borderRadius: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              Acompanhe seus pedidos
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Informe seu WhatsApp e seu primeiro nome para localizar seus últimos 5 pedidos e
              refazer pedidos anteriores com facilidade.
            </Typography>

            <Form methods={methods} onSubmit={onFormSubmit}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 1.5,
                  alignItems: { sm: 'flex-start' },
                }}
              >
                <Controller
                  name="phone"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      fullWidth
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      label="WhatsApp / Telefone"
                      placeholder="(91) 98888-7777"
                      onChange={(e) => field.onChange(formatPhoneBr(e.target.value))}
                      error={Boolean(error)}
                      helperText={error?.message}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify
                              icon="solar:phone-calling-bold"
                              sx={{ color: 'text.disabled' }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />

                <Controller
                  name="firstName"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      fullWidth
                      required
                      autoComplete="given-name"
                      label="Primeiro nome"
                      placeholder="Ex: Francisco"
                      error={Boolean(error)}
                      helperText={error?.message}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify icon="solar:user-bold" sx={{ color: 'text.disabled' }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  startIcon={
                    loading ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <Iconify icon="eva:search-fill" />
                    )
                  }
                  sx={{ minWidth: 170, height: 56, fontWeight: 700, flexShrink: 0 }}
                >
                  Consultar
                </Button>
              </Box>
            </Form>
          </Card>
        )}

        {/* Skeleton durante o carregamento dos pedidos */}
        {loading && (
          <Stack spacing={2.5}>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </Stack>
        )}

        {/* Lista vazia */}
        {searched && !loading && orders.length === 0 && (
          <Card sx={{ p: 5, textAlign: 'center', borderRadius: 2 }}>
            <Iconify
              icon="solar:bag-cross-bold-duotone"
              width={56}
              sx={{ color: 'text.disabled', mb: 1.5 }}
            />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Nenhum pedido encontrado
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
              Não encontramos pedidos para <strong>{watchedFirstName}</strong> com o telefone{' '}
              <strong>{watchedPhone}</strong> nesta loja. Verifique se o primeiro nome e o número
              estão iguais aos usados na compra.
            </Typography>
            <Button
              variant="contained"
              component={RouterLink}
              to={paths.publicStore.root(slug)}
            >
              Fazer um pedido
            </Button>
          </Card>
        )}

        {/* Lista dos últimos 5 pedidos */}
        {!loading && orders.length > 0 && (
          <Stack spacing={2.5}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ sm: 'center' }}
              spacing={1}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Últimos {orders.length}{' '}
                {orders.length === 1 ? 'pedido realizado' : 'pedidos realizados'}
              </Typography>
              <Stack direction="row" spacing={1}>
                <LoadingButton
                  size="small"
                  variant="contained"
                  color="primary"
                  loading={reorderingId === orders[0].id}
                  startIcon={<Iconify icon="solar:restart-bold" />}
                  onClick={() => handleReorder(orders[0])}
                >
                  Refazer último pedido
                </LoadingButton>
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() =>
                    handleSearch(
                      identifiedCustomer?.phone || watchedPhone,
                      identifiedCustomer?.firstName || watchedFirstName
                    )
                  }
                  disabled={loading}
                  startIcon={<Iconify icon="solar:refresh-bold" />}
                >
                  Atualizar
                </Button>
              </Stack>
            </Stack>

            {orders.map((order) => {
              const badge = getFulfillmentLabel(order.fulfillmentStatus, order.deliveryType);
              const payCfg =
                PAYMENT_METHOD_CONFIG[order.paymentMethod] || PAYMENT_METHOD_CONFIG.cash;

              return (
                <Card key={order.id} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ sm: 'center' }}
                    spacing={1}
                    sx={{ mb: 2 }}
                  >
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          {order.code}
                        </Typography>
                        <Label variant="soft" color={badge.color}>
                          {badge.label}
                        </Label>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {order.createdAt ? fDateTime(order.createdAt) : ''} •{' '}
                        {order.deliveryType === 'delivery' ? 'Entrega' : 'Retirada na loja'} •{' '}
                        {payCfg.label}
                      </Typography>
                    </Box>

                    <Typography variant="h6" color="primary.main" sx={{ fontWeight: 800 }}>
                      {fCurrency(order.total)}
                    </Typography>
                  </Stack>

                  {/* Barra de Progresso do Pedido */}
                  <Box sx={{ my: 2.5 }}>
                    <OrderProgressStepper
                      status={order.fulfillmentStatus}
                      deliveryType={order.deliveryType}
                      rejectedReason={order.rejectedReason}
                    />
                  </Box>

                  <Divider sx={{ my: 2, borderStyle: 'dashed' }} />

                  {/* Itens do pedido */}
                  <Stack spacing={0.75} sx={{ mb: 2 }}>
                    {order.items.map((item, idx) => (
                      <Stack
                        key={`${item.productId}-${idx}`}
                        direction="row"
                        justifyContent="space-between"
                        sx={{ typography: 'body2' }}
                      >
                        <Box sx={{ color: 'text.secondary' }}>
                          <strong>{item.qty}x</strong> {item.productName}
                        </Box>
                        <Box sx={{ fontWeight: 600 }}>{fCurrency(item.lineTotal)}</Box>
                      </Stack>
                    ))}
                  </Stack>

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="flex-end"
                    spacing={1}
                  >
                    <LoadingButton
                      size="small"
                      variant="outlined"
                      color="primary"
                      loading={reorderingId === order.id}
                      startIcon={<Iconify icon="solar:restart-bold" />}
                      onClick={() => handleReorder(order)}
                    >
                      Refazer este pedido
                    </LoadingButton>

                    <Button
                      component={RouterLink}
                      to={paths.publicStore.order(slug, order.id)}
                      state={{ code: order.code, whatsapp: order.whatsapp }}
                      size="small"
                      variant="soft"
                      color="primary"
                      endIcon={<Iconify icon="eva:arrow-ios-forward-fill" />}
                    >
                      Acompanhar detalhes
                    </Button>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

import type { PublicOrderTracking } from 'src/api/firestore/online-orders';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { formatPhoneBr, isCompletePhoneBr } from 'src/utils/br-docs';

import { listPublicOrdersByPhoneCf } from 'src/api/firestore/online-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { OrderCardSkeleton } from '../public-store-skeletons';
import { PAYMENT_METHOD_CONFIG } from '../public-store-helpers';
import { getFulfillmentLabel, OrderProgressStepper } from '../order-progress-stepper';

// ----------------------------------------------------------------------

const PHONE_STORAGE_KEY = (slug: string) => `onlineStore:customerPhone:${slug}`;

export function PublicOrdersView() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();

  const [phone, setPhone] = useState(() => {
    try {
      const saved = localStorage.getItem(PHONE_STORAGE_KEY(slug));
      return saved ? formatPhoneBr(saved) : '';
    } catch {
      return '';
    }
  });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [orders, setOrders] = useState<PublicOrderTracking[]>([]);

  const handleSearch = useCallback(
    async (phoneToQuery: string) => {
      if (!isCompletePhoneBr(phoneToQuery)) {
        toast.error('Informe um número de telefone válido com DDD.');
        return;
      }
      setLoading(true);
      try {
        const res = await listPublicOrdersByPhoneCf(slug, phoneToQuery);
        setOrders(res.orders || []);
        setSearched(true);
        try {
          localStorage.setItem(PHONE_STORAGE_KEY(slug), phoneToQuery);
        } catch {
          // ignore storage failure
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
    if (isCompletePhoneBr(phone)) {
      handleSearch(phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(phone);
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
        {/* Card de busca por telefone */}
        <Card sx={{ p: { xs: 2.5, sm: 3 }, mb: 3, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            Acompanhe seus pedidos
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Informe o número do WhatsApp utilizado na compra para consultar o andamento dos seus
            pedidos em tempo real.
          </Typography>

          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1.5,
              alignItems: { sm: 'stretch' },
            }}
          >
            <TextField
              fullWidth
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              label="WhatsApp / Telefone"
              placeholder="(91) 98888-7777"
              value={phone}
              onChange={(e) => setPhone(formatPhoneBr(e.target.value))}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon="solar:phone-calling-bold" sx={{ color: 'text.disabled' }} />
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || !isCompletePhoneBr(phone)}
              startIcon={
                loading ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <Iconify icon="eva:search-fill" />
                )
              }
              sx={{ minWidth: 190, fontWeight: 700 }}
            >
              Consultar
            </Button>
          </Box>
        </Card>

        {/* Skeleton durante o carregamento dos pedidos */}
        {loading && (
          <Stack spacing={2.5}>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </Stack>
        )}

        {/* Lista de Pedidos */}
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
              Não encontramos pedidos realizados com o telefone {phone} nesta loja.
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

        {!loading && orders.length > 0 && (
          <Stack spacing={2.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {orders.length} {orders.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={() => handleSearch(phone)}
                disabled={loading}
                startIcon={<Iconify icon="solar:refresh-bold" />}
              >
                Atualizar
              </Button>
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

                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
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

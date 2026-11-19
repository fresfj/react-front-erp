import type { PublicOrderTracking } from 'src/api/firestore/online-orders';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';

import { fCurrency } from 'src/utils/format-number';

import { varAlpha } from 'src/theme/styles';
import { getPublicOrderStatusCf } from 'src/api/firestore/online-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { OrderProgressSkeleton } from '../public-store-skeletons';
import { getFulfillmentLabel, OrderProgressStepper } from '../order-progress-stepper';

// ----------------------------------------------------------------------

export function PublicOrderConfirmView() {
  const { slug = '', orderId = '' } = useParams();
  const location = useLocation();
  const state = (location.state || {}) as {
    code?: string;
    whatsapp?: string;
    googleReviewUrl?: string;
  };

  const [order, setOrder] = useState<PublicOrderTracking | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchOrder = useCallback(
    async (silent = false) => {
      if (!slug || !orderId) return;
      if (!silent) setRefreshing(true);
      try {
        const res = await getPublicOrderStatusCf(slug, orderId);
        if (res.order) setOrder(res.order);
      } catch {
        // fallback gracefully to location.state
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [slug, orderId]
  );

  useEffect(() => {
    fetchOrder(true);
    const interval = setInterval(() => {
      fetchOrder(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  const code = order?.code || state.code || '';
  const whatsapp = (order?.whatsapp || state.whatsapp || '').replace(/\D/g, '');
  const googleReviewUrl = order?.googleReviewUrl || state.googleReviewUrl || '';
  const currentStatus = order?.fulfillmentStatus || 'pending';
  const deliveryType = order?.deliveryType || 'delivery';
  const statusBadge = getFulfillmentLabel(currentStatus, deliveryType);

  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Código do pedido copiado!');
    setTimeout(() => setCopied(false), 2500);
  };

  const whatsappMessage = encodeURIComponent(
    `Olá! Gostaria de acompanhar o pedido *${code}* feito pelo cardápio online.`
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: { xs: 4, sm: 6 },
        px: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Card
        sx={{
          p: { xs: 3, sm: 4 },
          maxWidth: 580,
          width: '100%',
          textAlign: 'center',
          borderRadius: 2.5,
          boxShadow: (theme) => theme.customShadows.z16,
          border: (theme) => `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
        }}
      >
        {/* Ícone de Status */}
        <Avatar
          sx={{
            width: 72,
            height: 72,
            bgcolor: (theme) =>
              varAlpha(
                currentStatus === 'rejected' || currentStatus === 'cancelled'
                  ? theme.vars.palette.error.mainChannel
                  : theme.vars.palette.success.mainChannel,
                0.12
              ),
            color:
              currentStatus === 'rejected' || currentStatus === 'cancelled'
                ? 'error.main'
                : 'success.main',
            mx: 'auto',
            mb: 2,
          }}
        >
          <Iconify
            icon={
              currentStatus === 'rejected' || currentStatus === 'cancelled'
                ? 'solar:close-circle-bold'
                : 'solar:check-circle-bold'
            }
            width={44}
          />
        </Avatar>

        <Label variant="soft" color={statusBadge.color} sx={{ mb: 1.5, py: 0.5, px: 1.5 }}>
          {statusBadge.label}
        </Label>

        <Typography variant="h4" sx={{ mb: 0.75, fontWeight: 700 }}>
          {currentStatus === 'delivered'
            ? 'Pedido Finalizado!'
            : currentStatus === 'rejected'
              ? 'Pedido Recusado'
              : 'Pedido Recebido!'}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {currentStatus === 'pending'
            ? 'O estabelecimento já foi notificado e está analisando o seu pedido.'
            : currentStatus === 'delivered'
              ? 'Obrigado pela preferência! Esperamos vê-lo novamente em breve.'
              : 'Acompanhe o progresso do seu pedido abaixo em tempo real.'}
        </Typography>

        {/* Barra de Progresso do Pedido (com Skeleton no carregamento inicial) */}
        {loading ? (
          <Box sx={{ mb: 3 }}>
            <OrderProgressSkeleton />
          </Box>
        ) : (
          <Box sx={{ mb: 3 }}>
            <OrderProgressStepper
              status={currentStatus}
              deliveryType={deliveryType}
              rejectedReason={order?.rejectedReason}
            />
          </Box>
        )}

        {/* Caixa com o Código do Pedido e botão Atualizar */}
        {code && (
          <Box
            sx={{
              p: 2,
              mb: 2.5,
              borderRadius: 1.5,
              bgcolor: 'background.neutral',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: (theme) => `1px dashed ${theme.vars.palette.divider}`,
            }}
          >
            <Box sx={{ textAlign: 'left' }}>
              <Typography variant="caption" color="text.secondary">
                Código do seu pedido:
              </Typography>
              <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 800 }}>
                {code}
              </Typography>
            </Box>

            <Stack direction="row" spacing={0.5}>
              <IconButton
                color="inherit"
                onClick={() => fetchOrder(false)}
                disabled={refreshing}
                title="Atualizar status"
              >
                {refreshing ? (
                  <CircularProgress size={18} />
                ) : (
                  <Iconify icon="solar:refresh-bold" width={20} />
                )}
              </IconButton>
              <IconButton color="primary" onClick={handleCopyCode} title="Copiar código">
                <Iconify icon={copied ? 'solar:check-read-bold' : 'solar:copy-bold'} width={22} />
              </IconButton>
            </Stack>
          </Box>
        )}

        {/* Resumo dos itens se carregado */}
        {order && order.items.length > 0 && (
          <Box sx={{ textAlign: 'left', mb: 3 }}>
            <Divider sx={{ mb: 2, borderStyle: 'dashed' }} />
            <Stack spacing={0.75} sx={{ mb: 1.5 }}>
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
              direction="row"
              justifyContent="space-between"
              sx={{ typography: 'subtitle1', fontWeight: 800, pt: 1 }}
            >
              <span>Total</span>
              <Box component="span" sx={{ color: 'primary.main' }}>
                {fCurrency(order.total)}
              </Box>
            </Stack>
          </Box>
        )}

        {/* Ações: WhatsApp + Meus Pedidos + Voltar ao Cardápio */}
        <Stack spacing={1.5}>
          {whatsapp && (
            <Button
              fullWidth
              size="large"
              variant="contained"
              color="success"
              href={`https://wa.me/${whatsapp}?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<Iconify icon="ic:baseline-whatsapp" />}
              sx={{ py: 1.5, borderRadius: 1.5, fontWeight: 700 }}
            >
              Acompanhar no WhatsApp
            </Button>
          )}

          {googleReviewUrl && (
            <Button
              fullWidth
              size="large"
              variant="soft"
              color="warning"
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<Iconify icon="solar:star-bold" />}
              sx={{ py: 1.4, borderRadius: 1.5, fontWeight: 700 }}
            >
              Avaliar a loja no Google
            </Button>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              component={RouterLink}
              to={paths.publicStore.orders(slug)}
              variant="soft"
              color="primary"
              size="large"
              fullWidth
              startIcon={<Iconify icon="solar:clipboard-list-bold" />}
              sx={{ py: 1.25, borderRadius: 1.5, fontWeight: 700 }}
            >
              Meus Pedidos
            </Button>

            <Button
              component={RouterLink}
              to={paths.publicStore.root(slug)}
              variant="outlined"
              size="large"
              fullWidth
              sx={{ py: 1.25, borderRadius: 1.5 }}
            >
              Voltar ao Cardápio
            </Button>
          </Stack>
        </Stack>
      </Card>
    </Box>
  );
}

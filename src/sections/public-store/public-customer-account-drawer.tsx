import type { PublicOrderTracking } from 'src/api/firestore/online-orders';

import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

import { varAlpha } from 'src/theme/styles';
import { listPublicOrdersByPhoneCf } from 'src/api/firestore/online-orders';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';

import { signOutPublicCustomer } from './public-customer-phone-auth';

import type { VerifiedPublicCustomer } from './public-customer-phone-auth';

// ----------------------------------------------------------------------

const LOYALTY_STAMPS_GOAL = 10;

type Props = {
  open: boolean;
  slug: string;
  storeName: string;
  customer: VerifiedPublicCustomer | null;
  onClose: () => void;
  onOpenMyOrders: () => void;
  onSignedOut: () => void;
};

function readSavedAddress(slug: string): string {
  try {
    return window.localStorage.getItem(`onlineStore:customerAddress:${slug}`) || '';
  } catch {
    return '';
  }
}

export function PublicCustomerAccountDrawer({
  open,
  slug,
  storeName,
  customer,
  onClose,
  onOpenMyOrders,
  onSignedOut,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PublicOrderTracking[]>([]);
  const [savedAddress, setSavedAddress] = useState('');

  const loadCustomerOrders = useCallback(async () => {
    if (!customer || !slug) return;
    setLoading(true);
    setSavedAddress(readSavedAddress(slug));
    try {
      const firstName =
        customer.firstName || customer.fullName?.split(/\s+/)[0] || undefined;
      const res = await listPublicOrdersByPhoneCf(slug, customer.phoneFormatted, firstName);
      setOrders(res.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [customer, slug]);

  useEffect(() => {
    if (open && customer) {
      loadCustomerOrders();
    }
  }, [open, customer, loadCustomerOrders]);

  if (!customer) {
    return <Drawer open={false} anchor="right" onClose={onClose} />;
  }

  const validOrders = orders.filter(
    (o) => o.fulfillmentStatus !== 'rejected' && o.fulfillmentStatus !== 'cancelled'
  );
  const totalSpent = validOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);
  const stampsInCycle = validOrders.length % LOYALTY_STAMPS_GOAL;
  const completedCycles = Math.floor(validOrders.length / LOYALTY_STAMPS_GOAL);
  const loyaltyPoints = Math.floor(totalSpent / 10);
  const progressPercent = Math.min(100, Math.round((stampsInCycle / LOYALTY_STAMPS_GOAL) * 100));
  const remainingForReward = LOYALTY_STAMPS_GOAL - stampsInCycle;

  const displayAddress =
    savedAddress ||
    validOrders.find((o) => Boolean(o.customerAddress))?.customerAddress ||
    '';

  const displayName =
    customer.fullName ||
    customer.firstName ||
    validOrders[0]?.customerName ||
    'Cliente verificado';

  const handleSignOut = async () => {
    await signOutPublicCustomer(slug);
    onSignedOut();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      PaperProps={{ sx: { width: { xs: '100%', sm: 400 } } }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2.5, py: 2 }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Minha Conta
        </Typography>
        <IconButton onClick={onClose}>
          <Iconify icon="mingcute:close-line" />
        </IconButton>
      </Stack>

      <Divider sx={{ borderStyle: 'dashed' }} />

      <Scrollbar sx={{ flex: '1 1 auto' }}>
        <Stack spacing={2.5} sx={{ p: 2.5 }}>
          {/* 1. Perfil do Usuário Autenticado */}
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar
              sx={{
                width: 56,
                height: 56,
                fontWeight: 800,
                bgcolor: 'primary.main',
                color: 'common.white',
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
                {displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {customer.phoneFormatted}
              </Typography>
              <Label
                variant="soft"
                color="success"
                startIcon={<Iconify icon="solar:verified-check-bold" width={14} />}
                sx={{ mt: 0.5 }}
              >
                Celular verificado
              </Label>
            </Box>
          </Stack>

          {/* 2. Programa de Fidelidade */}
          <Card
            sx={{
              p: 2.25,
              borderRadius: 2,
              background: (theme) =>
                `linear-gradient(135deg, ${varAlpha(theme.vars.palette.primary.mainChannel, 0.14)} 0%, ${varAlpha(theme.vars.palette.warning.mainChannel, 0.1)} 100%)`,
              border: (theme) =>
                `1px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.24)}`,
              boxShadow: 'none',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Iconify icon="solar:cup-star-bold-duotone" width={24} sx={{ color: 'warning.main' }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    Programa de Fidelidade
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {storeName}
                  </Typography>
                </Box>
              </Stack>
              <Label variant="filled" color="warning">
                {loyaltyPoints} pts
              </Label>
            </Stack>

            {loading ? (
              <Stack spacing={1}>
                <Skeleton animation="wave" variant="rounded" height={42} />
                <Skeleton animation="wave" variant="text" width="75%" />
              </Stack>
            ) : (
              <>
                {/* Grade de 10 selos do Cartão Fidelidade */}
                <Box
                  display="grid"
                  gridTemplateColumns="repeat(5, 1fr)"
                  gap={1}
                  sx={{ my: 1.5 }}
                >
                  {[...Array(LOYALTY_STAMPS_GOAL)].map((_, idx) => {
                    const earned = idx < stampsInCycle;
                    return (
                      <Box
                        key={idx}
                        sx={{
                          height: 36,
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: earned ? 'primary.main' : 'background.paper',
                          color: earned ? 'common.white' : 'text.disabled',
                          border: (theme) =>
                            `1px dashed ${
                              earned
                                ? theme.vars.palette.primary.main
                                : varAlpha(theme.vars.palette.grey['500Channel'], 0.32)
                            }`,
                        }}
                      >
                        <Iconify
                          icon={earned ? 'solar:star-bold' : 'solar:star-linear'}
                          width={18}
                        />
                      </Box>
                    );
                  })}
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={progressPercent}
                  color="primary"
                  sx={{ height: 7, borderRadius: 1, mb: 1 }}
                />

                <Typography variant="caption" color="text.secondary" display="block">
                  {completedCycles > 0
                    ? `Parabéns! Você já completou ${completedCycles} cartão(ões) fidelidade. `
                    : ''}
                  Faltam <strong>{remainingForReward} pedido(s)</strong> para desbloquear sua
                  próxima recompensa (desconto ou produto grátis).
                </Typography>

                <Stack
                  direction="row"
                  justifyContent="space-between"
                  sx={{ mt: 1.5, pt: 1.25, borderTop: (t) => `1px dashed ${t.vars.palette.divider}` }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Pedidos contabilizados: <strong>{validOrders.length}</strong>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Selos no cartão: <strong>{stampsInCycle}/{LOYALTY_STAMPS_GOAL}</strong>
                  </Typography>
                </Stack>
              </>
            )}
          </Card>

          {/* 3. Informações Pessoais & Endereço Utilizado */}
          <Card
            sx={{
              p: 2,
              borderRadius: 1.5,
              boxShadow: 'none',
              border: (theme) => `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Informações Pessoais & Endereço
            </Typography>
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1.25} alignItems="flex-start">
                <Iconify
                  icon="solar:user-bold-duotone"
                  width={18}
                  sx={{ color: 'text.secondary', mt: 0.2 }}
                />
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Nome
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {displayName}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1.25} alignItems="flex-start">
                <Iconify
                  icon="solar:phone-calling-bold-duotone"
                  width={18}
                  sx={{ color: 'text.secondary', mt: 0.2 }}
                />
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    WhatsApp / Celular
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {customer.phoneFormatted}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1.25} alignItems="flex-start">
                <Iconify
                  icon="solar:map-point-bold-duotone"
                  width={18}
                  sx={{ color: 'text.secondary', mt: 0.2 }}
                />
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Último endereço utilizado
                  </Typography>
                  <Typography variant="body2" color={displayAddress ? 'text.primary' : 'text.disabled'}>
                    {displayAddress || 'Nenhum endereço salvo ainda (preenchido no próximo pedido).'}
                  </Typography>
                </Box>
              </Stack>
            </Stack>
          </Card>

          {/* 4. Atalhos */}
          <Stack spacing={1.25}>
            <Button
              fullWidth
              variant="soft"
              color="primary"
              startIcon={<Iconify icon="solar:bag-check-bold-duotone" />}
              onClick={() => {
                onClose();
                onOpenMyOrders();
              }}
            >
              Meus Pedidos ({orders.length})
            </Button>

            <Button
              fullWidth
              variant="outlined"
              color="error"
              startIcon={<Iconify icon="solar:logout-2-bold" />}
              onClick={handleSignOut}
            >
              Sair da conta
            </Button>
          </Stack>
        </Stack>
      </Scrollbar>
    </Drawer>
  );
}

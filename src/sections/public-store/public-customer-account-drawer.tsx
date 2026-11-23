import type { PublicOrderTracking, OnlineStoreLoyaltyConfig } from 'src/api/firestore/online-orders';

import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import useMediaQuery from '@mui/material/useMediaQuery';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';

import { useCepLookup } from 'src/hooks/use-cep-lookup';

import { fCurrency } from 'src/utils/format-number';
import { formatCep, digitsOnly } from 'src/utils/br-docs';

import { varAlpha } from 'src/theme/styles';
import { listPublicOrdersByPhoneCf } from 'src/api/firestore/online-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';

import {
  signOutPublicCustomer,
  saveVerifiedPublicCustomer,
} from './public-customer-phone-auth';
import {
  formatSavedAddressLine,
  loadPublicCustomerProfile,
  savePublicCustomerProfile,
} from './public-customer-profile';

import type { VerifiedPublicCustomer } from './public-customer-phone-auth';
import type { SavedCustomerAddress, PublicCustomerProfile } from './public-customer-profile';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  slug: string;
  storeName: string;
  loyalty?: OnlineStoreLoyaltyConfig;
  customer: VerifiedPublicCustomer | null;
  onClose: () => void;
  onOpenMyOrders: () => void;
  onCustomerUpdated?: (customer: VerifiedPublicCustomer) => void;
  onSignedOut: () => void;
};

function formatLoyaltyRewardSummary(loyalty: OnlineStoreLoyaltyConfig): string {
  if (loyalty.rewardDescription?.trim()) {
    return loyalty.rewardDescription.trim();
  }
  if (loyalty.rewardType === 'free_product') {
    return '1 produto ou brinde grátis';
  }
  if (loyalty.rewardType === 'discount_percent' && Number(loyalty.rewardValue || 0) > 0) {
    return `${Number(loyalty.rewardValue)}% de desconto no próximo pedido`;
  }
  if (loyalty.rewardType === 'discount_fixed' && Number(loyalty.rewardValue || 0) > 0) {
    return `${fCurrency(Number(loyalty.rewardValue))} de desconto no próximo pedido`;
  }
  return 'desconto ou produto grátis';
}

function readLegacyAddress(slug: string): string {
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
  loyalty,
  customer,
  onClose,
  onOpenMyOrders,
  onCustomerUpdated,
  onSignedOut,
}: Props) {
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PublicOrderTracking[]>([]);
  const [profile, setProfile] = useState<PublicCustomerProfile | null>(null);
  const [legacyAddress, setLegacyAddress] = useState('');

  // Modal de edição de perfil e lista de endereços
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddresses, setEditAddresses] = useState<SavedCustomerAddress[]>([]);
  const [addingAddress, setAddingAddress] = useState(false);
  const [addrLabel, setAddrLabel] = useState('Casa');
  const [addrCep, setAddrCep] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrNumber, setAddrNumber] = useState('');
  const [addrComplement, setAddrComplement] = useState('');
  const [addrNeighborhood, setAddrNeighborhood] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrState, setAddrState] = useState('');

  const { loading: cepLoading, handleBlur: handleCepBlur } = useCepLookup({
    cep: addrCep,
    onSuccess: (fields) => {
      if (fields.address) setAddrStreet(fields.address);
      if (fields.neighborhood) setAddrNeighborhood(fields.neighborhood);
      if (fields.city) setAddrCity(fields.city);
      if (fields.state) setAddrState(fields.state);
    },
    onError: () => {
      toast.error('CEP não encontrado. Preencha manualmente.');
    },
  });

  const loadCustomerOrders = useCallback(async () => {
    if (!customer || !slug) return;
    setLoading(true);
    setProfile(loadPublicCustomerProfile(slug, customer.phoneDigits));
    setLegacyAddress(readLegacyAddress(slug));
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

  const loyaltyEnabled = loyalty?.enabled === true;
  const stampsGoal = Math.min(20, Math.max(2, Math.round(Number(loyalty?.stampsGoal) || 10)));
  const reaisPerPoint = Math.max(1, Number(loyalty?.reaisPerPoint) || 10);
  const minOrderForLoyalty = Math.max(0, Number(loyalty?.minOrderValue) || 0);

  const validOrders = orders.filter(
    (o) => o.fulfillmentStatus !== 'rejected' && o.fulfillmentStatus !== 'cancelled'
  );
  const eligibleOrders =
    minOrderForLoyalty > 0
      ? validOrders.filter((o) => Number(o.total || 0) >= minOrderForLoyalty)
      : validOrders;
  const totalEligibleSpent = eligibleOrders.reduce((acc, o) => acc + Number(o.total || 0), 0);
  const stampsInCycle = eligibleOrders.length % stampsGoal;
  const completedCycles = Math.floor(eligibleOrders.length / stampsGoal);
  const loyaltyPoints = Math.floor(totalEligibleSpent / reaisPerPoint);
  const progressPercent = Math.min(100, Math.round((stampsInCycle / stampsGoal) * 100));
  const remainingForReward = stampsGoal - stampsInCycle;
  const rewardSummary = loyalty ? formatLoyaltyRewardSummary(loyalty) : 'desconto ou produto grátis';

  const defaultAddr =
    profile?.addresses.find((a) => a.isDefault) || profile?.addresses[0] || null;

  const displayAddress =
    (defaultAddr ? formatSavedAddressLine(defaultAddr) : '') ||
    legacyAddress ||
    validOrders.find((o) => Boolean(o.customerAddress))?.customerAddress ||
    '';

  const displayName =
    profile?.fullName ||
    customer.fullName ||
    customer.firstName ||
    validOrders[0]?.customerName ||
    'Cliente verificado';

  const handleOpenEditModal = () => {
    setEditName(displayName === 'Cliente verificado' ? '' : displayName);
    setEditAddresses(profile?.addresses ? [...profile.addresses] : []);
    setAddingAddress(false);
    setAddrLabel('Casa');
    setAddrCep('');
    setAddrStreet('');
    setAddrNumber('');
    setAddrComplement('');
    setAddrNeighborhood('');
    setAddrCity('');
    setAddrState('');
    setEditOpen(true);
  };

  const handleSetDefaultAddress = (addrId: string) => {
    setEditAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === addrId })));
  };

  const handleDeleteAddress = (addrId: string) => {
    setEditAddresses((prev) => {
      const next = prev.filter((a) => a.id !== addrId);
      if (next.length > 0 && !next.some((a) => a.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const handleAddNewAddressToDraft = () => {
    if (!addrStreet.trim() || !addrNumber.trim() || !addrNeighborhood.trim()) {
      toast.error('Preencha rua, número e bairro para adicionar o endereço.');
      return;
    }
    const newAddr: SavedCustomerAddress = {
      id: `addr-${Date.now()}`,
      label: addrLabel.trim() || 'Endereço',
      cep: digitsOnly(addrCep),
      street: addrStreet.trim(),
      number: addrNumber.trim(),
      complement: addrComplement.trim() || undefined,
      neighborhood: addrNeighborhood.trim(),
      city: addrCity.trim(),
      state: addrState.trim().toUpperCase(),
      isDefault: true,
    };
    setEditAddresses((prev) => [
      newAddr,
      ...prev.map((a) => ({ ...a, isDefault: false })),
    ]);
    setAddingAddress(false);
    setAddrCep('');
    setAddrStreet('');
    setAddrNumber('');
    setAddrComplement('');
    setAddrNeighborhood('');
    setAddrCity('');
    setAddrState('');
  };

  const handleSaveProfile = () => {
    if (!editName.trim()) {
      toast.error('Informe seu nome completo.');
      return;
    }
    const saved = savePublicCustomerProfile(slug, customer.phoneDigits, {
      fullName: editName.trim(),
      addresses: editAddresses,
    });
    setProfile(saved);

    const updatedCustomer: VerifiedPublicCustomer = {
      ...customer,
      fullName: editName.trim(),
      firstName: editName.trim().split(/\s+/)[0] || customer.firstName,
    };
    saveVerifiedPublicCustomer(slug, updatedCustomer);
    onCustomerUpdated?.(updatedCustomer);
    toast.success('Informações pessoais e endereços atualizados!');
    setEditOpen(false);
  };

  const handleSignOut = async () => {
    await signOutPublicCustomer(slug);
    onSignedOut();
    onClose();
  };

  return (
    <>
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

            {/* 2. Programa de Fidelidade (exibido somente quando ativado pela loja) */}
            {loyaltyEnabled && (
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
                    {/* Grade de selos do Cartão Fidelidade */}
                    <Box
                      display="grid"
                      gridTemplateColumns={`repeat(${Math.min(5, stampsGoal)}, 1fr)`}
                      gap={1}
                      sx={{ my: 1.5 }}
                    >
                      {[...Array(stampsGoal)].map((_, idx) => {
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
                      próxima recompensa: <strong>{rewardSummary}</strong>.
                    </Typography>

                    {minOrderForLoyalty > 0 && (
                      <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
                        Válido para pedidos a partir de {fCurrency(minOrderForLoyalty)}.
                      </Typography>
                    )}

                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      sx={{ mt: 1.5, pt: 1.25, borderTop: (t) => `1px dashed ${t.vars.palette.divider}` }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Pedidos contabilizados: <strong>{eligibleOrders.length}</strong>
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Selos no cartão: <strong>{stampsInCycle}/{stampsGoal}</strong>
                      </Typography>
                    </Stack>
                  </>
                )}
              </Card>
            )}

            {/* 3. Informações Pessoais & Endereço Padrão */}
            <Card
              sx={{
                p: 2,
                borderRadius: 1.5,
                boxShadow: 'none',
                border: (theme) => `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1.5 }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Informações Pessoais & Endereço
                </Typography>
                <Button
                  size="small"
                  variant="soft"
                  color="primary"
                  startIcon={<Iconify icon="solar:pen-bold" width={15} />}
                  onClick={handleOpenEditModal}
                >
                  Editar
                </Button>
              </Stack>

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
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        Endereço padrão
                      </Typography>
                      {defaultAddr?.label && (
                        <Label variant="soft" color="info" sx={{ height: 18, fontSize: 10 }}>
                          {defaultAddr.label}
                        </Label>
                      )}
                    </Stack>
                    <Typography
                      variant="body2"
                      color={displayAddress ? 'text.primary' : 'text.disabled'}
                    >
                      {displayAddress || 'Nenhum endereço salvo ainda. Clique em Editar para cadastrar.'}
                    </Typography>
                    {profile && profile.addresses.length > 1 && (
                      <Typography variant="caption" color="primary.main">
                        +{profile.addresses.length - 1} outro(s) endereço(s) salvo(s)
                      </Typography>
                    )}
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

      {/* Modal para editar Informações Pessoais & Lista de Endereços (fullScreen no celular) */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <span>Informações Pessoais & Endereços</span>
          <IconButton size="small" onClick={() => setEditOpen(false)}>
            <Iconify icon="mingcute:close-line" />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Nome completo"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Ex.: João da Silva"
            />

            <Divider sx={{ borderStyle: 'dashed' }} />

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Meus Endereços ({editAddresses.length})
              </Typography>
              <Button
                size="small"
                variant="soft"
                color="primary"
                startIcon={<Iconify icon="mingcute:add-line" width={16} />}
                onClick={() => setAddingAddress((prev) => !prev)}
              >
                {addingAddress ? 'Fechar formulário' : 'Novo endereço'}
              </Button>
            </Stack>

            {addingAddress && (
              <Stack
                spacing={1.5}
                sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}
              >
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {['Casa', 'Trabalho', 'Outro'].map((presetLabel) => (
                    <Chip
                      key={presetLabel}
                      size="small"
                      label={presetLabel}
                      color={addrLabel === presetLabel ? 'primary' : 'default'}
                      variant={addrLabel === presetLabel ? 'filled' : 'outlined'}
                      onClick={() => setAddrLabel(presetLabel)}
                    />
                  ))}
                </Stack>

                <TextField
                  fullWidth
                  label="CEP"
                  placeholder="00000-000"
                  value={addrCep}
                  onChange={(e) => setAddrCep(formatCep(e.target.value))}
                  onBlur={handleCepBlur}
                  InputProps={{
                    endAdornment: cepLoading ? (
                      <InputAdornment position="end">
                        <CircularProgress size={18} />
                      </InputAdornment>
                    ) : null,
                  }}
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    label="Rua / Logradouro"
                    value={addrStreet}
                    onChange={(e) => setAddrStreet(e.target.value)}
                  />
                  <TextField
                    label="Número"
                    value={addrNumber}
                    onChange={(e) => setAddrNumber(e.target.value)}
                    sx={{ width: { xs: '100%', sm: 130 } }}
                  />
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    label="Bairro"
                    value={addrNeighborhood}
                    onChange={(e) => setAddrNeighborhood(e.target.value)}
                  />
                  <TextField
                    fullWidth
                    label="Complemento (opcional)"
                    value={addrComplement}
                    onChange={(e) => setAddrComplement(e.target.value)}
                  />
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    label="Cidade"
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                  />
                  <TextField
                    label="UF"
                    value={addrState}
                    onChange={(e) => setAddrState(e.target.value.toUpperCase().slice(0, 2))}
                    sx={{ width: { xs: '100%', sm: 96 } }}
                  />
                </Stack>

                <Stack direction="row" justifyContent="flex-end">
                  <Button variant="contained" size="small" onClick={handleAddNewAddressToDraft}>
                    Adicionar como padrão
                  </Button>
                </Stack>
              </Stack>
            )}

            {editAddresses.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nenhum endereço salvo ainda. Clique em &ldquo;Novo endereço&rdquo; acima para
                adicionar.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {editAddresses.map((addr) => (
                  <Box
                    key={addr.id}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      border: (theme) =>
                        `1.5px solid ${
                          addr.isDefault
                            ? theme.vars.palette.primary.main
                            : varAlpha(theme.vars.palette.grey['500Channel'], 0.2)
                        }`,
                      bgcolor: (theme) =>
                        addr.isDefault
                          ? varAlpha(theme.vars.palette.primary.mainChannel, 0.06)
                          : 'transparent',
                    }}
                  >
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {addr.label}
                          </Typography>
                          {addr.isDefault && (
                            <Label variant="filled" color="primary" sx={{ height: 18, fontSize: 10 }}>
                              Padrão
                            </Label>
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {formatSavedAddressLine(addr)}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                        {!addr.isDefault && (
                          <Button
                            size="small"
                            variant="soft"
                            color="primary"
                            onClick={() => handleSetDefaultAddress(addr.id)}
                          >
                            Usar padrão
                          </Button>
                        )}
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteAddress(addr.id)}
                        >
                          <Iconify icon="solar:trash-bin-trash-bold" width={16} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button color="inherit" onClick={() => setEditOpen(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleSaveProfile}>
            Salvar alterações
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

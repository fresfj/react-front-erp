import type {
  PublicStorefront,
  OnlinePayOnDeliveryMethod,
} from 'src/api/firestore/online-orders';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';

import { useCepLookup } from 'src/hooks/use-cep-lookup';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { formatCep, digitsOnly, formatPhoneBr, isCompletePhoneBr } from 'src/utils/br-docs';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import {
  placeOnlineOrderCf,
  getPublicStorefrontCf,
  lookupPublicCustomerByPhoneCf,
} from 'src/api/firestore/online-orders';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { PaymentMethodIcon, PaymentBrandLogos } from 'src/components/payment-method-icon';

import { IncrementerButton } from 'src/sections/product/components/incrementer-button';

import { usePublicCart } from '../public-cart-context';
import { CheckoutSkeleton } from '../public-store-skeletons';
import { PAYMENT_METHOD_CONFIG } from '../public-store-helpers';

// ----------------------------------------------------------------------

type LocationState = {
  store?: PublicStorefront;
} | null;

export function PublicCheckoutView() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslate('common');
  const cart = usePublicCart();

  const stateStore = (location.state as LocationState)?.store ?? null;

  const [store, setStore] = useState<PublicStorefront | null>(stateStore);
  const [loading, setLoading] = useState(!stateStore);
  const [submitting, setSubmitting] = useState(false);

  // Formulário de Checkout
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState(() => {
    try {
      const saved = localStorage.getItem(`onlineStore:customerPhone:${slug}`);
      return saved ? formatPhoneBr(saved) : '';
    } catch {
      return '';
    }
  });
  const [lookingUpCustomer, setLookingUpCustomer] = useState(false);
  const [customerIdentified, setCustomerIdentified] = useState(false);
  const lastLookedUpDigitsRef = useRef('');

  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>(
    stateStore ? (stateStore.acceptDelivery ? 'delivery' : 'pickup') : 'delivery'
  );
  const [paymentMethod, setPaymentMethod] = useState<OnlinePayOnDeliveryMethod>(
    stateStore?.paymentMethodsOnDelivery?.[0] || 'pix'
  );
  const [cashChangeFor, setCashChangeFor] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Endereço de entrega
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const handleLookupCustomer = useCallback(
    async (phoneVal: string) => {
      const digits = digitsOnly(phoneVal);
      if (digits.length < 10 || digits === lastLookedUpDigitsRef.current) return;
      lastLookedUpDigitsRef.current = digits;
      setLookingUpCustomer(true);
      try {
        const res = await lookupPublicCustomerByPhoneCf(slug, digits);
        if (res.found && res.customer) {
          if (res.customer.name) setCustomerName(res.customer.name);
          if (res.customer.cep) setCep(formatCep(res.customer.cep));
          if (res.customer.street) setStreet(res.customer.street);
          if (res.customer.number) setNumber(res.customer.number);
          if (res.customer.complement) setComplement(res.customer.complement);
          if (res.customer.neighborhood) setNeighborhood(res.customer.neighborhood);
          if (res.customer.city) setCity(res.customer.city);
          if (res.customer.state) setState(res.customer.state);
          setCustomerIdentified(true);
          toast.success('Cliente identificado! Seus dados foram preenchidos.');
        } else {
          setCustomerIdentified(false);
        }
      } catch {
        // silent fail on lookup
      } finally {
        setLookingUpCustomer(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    if (isCompletePhoneBr(customerPhone)) {
      handleLookupCustomer(customerPhone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handlePhoneChange = (raw: string) => {
    const formatted = formatPhoneBr(raw);
    setCustomerPhone(formatted);
    setCustomerIdentified(false);
    if (digitsOnly(formatted).length === 11) {
      handleLookupCustomer(formatted);
    }
  };

  const { loading: cepLoading, handleBlur: handleCepBlur } = useCepLookup({
    cep,
    onSuccess: (fields) => {
      if (fields.address) setStreet(fields.address);
      if (fields.neighborhood) setNeighborhood(fields.neighborhood);
      if (fields.city) setCity(fields.city);
      if (fields.state) setState(fields.state);
      toast.success('Endereço preenchido pelo CEP!');
    },
    onError: () => {
      toast.error('CEP não encontrado. Preencha manualmente.');
    },
  });

  const loadStorefront = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPublicStorefrontCf(slug);
      setStore(data);
      if (data.paymentMethodsOnDelivery?.[0]) {
        setPaymentMethod(data.paymentMethodsOnDelivery[0]);
      }
      if (data.acceptDelivery) {
        setDeliveryType('delivery');
      } else if (data.acceptPickup) {
        setDeliveryType('pickup');
      }
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, t('publicStore.loadError')));
      setStore(null);
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    if (!stateStore) {
      loadStorefront();
    }
  }, [stateStore, loadStorefront]);

  const handleBackToMenu = () => {
    navigate(paths.publicStore.root(slug));
  };

  const deliveryFee = deliveryType === 'delivery' ? Number(store?.deliveryFee || 0) : 0;
  const total = Math.round((cart.subtotal + deliveryFee) * 100) / 100;
  const isBelowMinOrder = Boolean(
    store?.minOrderAmount && store.minOrderAmount > 0 && cart.subtotal < store.minOrderAmount
  );

  const handlePlaceOrder = async () => {
    if (!store?.isOpen) {
      toast.error('A loja está fechada no momento.');
      return;
    }
    if (isBelowMinOrder && store.minOrderAmount) {
      toast.error(`O valor mínimo para pedidos nesta loja é de ${fCurrency(store.minOrderAmount)}.`);
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error('Por favor, informe seu nome e WhatsApp para contato.');
      return;
    }
    if (deliveryType === 'delivery') {
      if (!street.trim() || !number.trim() || !neighborhood.trim()) {
        toast.error('Informe rua, número e bairro para a entrega.');
        return;
      }
    }

    const fullAddress =
      deliveryType === 'delivery'
        ? `${street.trim()}, nº ${number.trim()}${
            complement.trim() ? ` (${complement.trim()})` : ''
          } - ${neighborhood.trim()}${city.trim() ? `, ${city.trim()}` : ''}${
            state.trim() ? ` - ${state.trim()}` : ''
          }${cep ? ` - CEP: ${formatCep(cep)}` : ''}`
        : undefined;

    let finalNotes = orderNotes.trim();
    if (paymentMethod === 'cash' && cashChangeFor.trim()) {
      finalNotes = finalNotes
        ? `${finalNotes} | Troco para: R$ ${cashChangeFor.trim()}`
        : `Troco para: R$ ${cashChangeFor.trim()}`;
    }

    setSubmitting(true);
    try {
      const result = await placeOnlineOrderCf({
        slug,
        items: cart.lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          notes: l.notes,
        })),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: fullAddress,
        customerAddressFields:
          deliveryType === 'delivery'
            ? {
                cep: digitsOnly(cep),
                street: street.trim(),
                number: number.trim(),
                complement: complement.trim(),
                neighborhood: neighborhood.trim(),
                city: city.trim(),
                state: state.trim(),
              }
            : undefined,
        deliveryType,
        paymentMethod,
        notes: finalNotes || undefined,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      });

      try {
        localStorage.setItem(`onlineStore:customerPhone:${slug}`, customerPhone.trim());
      } catch {
        // ignore storage error
      }

      cart.clear();
      navigate(paths.publicStore.order(slug, result.orderId), {
        state: {
          code: result.code,
          whatsapp: store.whatsapp,
          googleReviewUrl: store.googleReviewUrl,
        },
      });
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, t('publicStore.placeError')));
      loadStorefront();
    } finally {
      setSubmitting(false);
    }
  };

  // --------------------------------------------------------------------
  // Estados de carregamento (Skeleton) / loja não encontrada / carrinho vazio
  // --------------------------------------------------------------------
  if (loading) {
    return <CheckoutSkeleton />;
  }

  if (!store) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          textAlign: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Iconify
          icon="solar:shop-2-bold-duotone"
          width={80}
          sx={{ color: 'text.disabled', mb: 2 }}
        />
        <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
          Loja não encontrada
        </Typography>
        <Button variant="contained" onClick={handleBackToMenu} sx={{ mt: 2 }}>
          Voltar ao cardápio
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', width: '100%', bgcolor: 'background.default', pb: 6 }}>
      {/* Barra superior fixa fullscreen com botão Voltar */}
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
            maxWidth: 1160,
            mx: 'auto',
            px: { xs: 2, sm: 3, md: 4 },
            py: 1.75,
          }}
        >
          <Button
            color="inherit"
            startIcon={<Iconify icon="eva:arrow-back-fill" />}
            onClick={handleBackToMenu}
            sx={{ fontWeight: 700 }}
          >
            Voltar ao cardápio
          </Button>

          <Stack direction="row" spacing={1.25} alignItems="center">
            <Avatar
              src={store.logoUrl}
              alt={store.storeName}
              sx={{
                width: 32,
                height: 32,
                bgcolor: 'primary.lighter',
                color: 'primary.darker',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {store.storeName.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {store.storeName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Finalizar Pedido ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'itens'})
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Box>

      {/* Conteúdo principal fullscreen */}
      <Box
        sx={{
          maxWidth: 1160,
          mx: 'auto',
          px: { xs: 2, sm: 3, md: 4 },
          pt: { xs: 2.5, md: 4 },
        }}
      >
        {cart.itemCount === 0 ? (
          <Card
            sx={{
              py: 8,
              px: 3,
              textAlign: 'center',
              maxWidth: 520,
              mx: 'auto',
              borderRadius: 2,
            }}
          >
            <Iconify
              icon="solar:bag-3-bold-duotone"
              width={64}
              sx={{ color: 'text.disabled', mb: 2 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              Sua sacola está vazia
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Adicione produtos do cardápio para finalizar o seu pedido.
            </Typography>
            <Button
              size="large"
              variant="contained"
              startIcon={<Iconify icon="eva:arrow-back-fill" />}
              onClick={handleBackToMenu}
            >
              Explorar cardápio
            </Button>
          </Card>
        ) : (
          <>
            {!store.isOpen && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                A loja está fechada no momento. Você pode revisar sua sacola, mas o envio de pedidos
                está temporariamente desativado.
              </Alert>
            )}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1.35fr 1fr' },
                gap: 3,
                alignItems: 'start',
              }}
            >
              {/* Coluna Esquerda: Modalidade, Dados do Cliente, Endereço e Pagamento */}
              <Stack spacing={3}>
                {/* 1. Modalidade: Entrega vs Retirada */}
                <Card sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                    Como deseja receber seu pedido?
                  </Typography>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    {store.acceptDelivery && (
                      <ButtonBase
                        onClick={() => setDeliveryType('delivery')}
                        sx={{
                          flex: 1,
                          p: 2,
                          borderRadius: 1.5,
                          border: (theme) =>
                            `1.5px solid ${
                              deliveryType === 'delivery'
                                ? theme.vars.palette.primary.main
                                : varAlpha(theme.vars.palette.grey['500Channel'], 0.2)
                            }`,
                          bgcolor: (theme) =>
                            deliveryType === 'delivery'
                              ? varAlpha(theme.vars.palette.primary.mainChannel, 0.08)
                              : 'background.paper',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.75,
                          alignItems: 'center',
                        }}
                      >
                        <Iconify
                          icon="solar:scooter-bold"
                          width={28}
                          sx={{
                            color: deliveryType === 'delivery' ? 'primary.main' : 'text.disabled',
                          }}
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Receber por Entrega
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {store.deliveryFee > 0 ? fCurrency(store.deliveryFee) : 'Grátis'}
                        </Typography>
                      </ButtonBase>
                    )}

                    {store.acceptPickup && (
                      <ButtonBase
                        onClick={() => setDeliveryType('pickup')}
                        sx={{
                          flex: 1,
                          p: 2,
                          borderRadius: 1.5,
                          border: (theme) =>
                            `1.5px solid ${
                              deliveryType === 'pickup'
                                ? theme.vars.palette.primary.main
                                : varAlpha(theme.vars.palette.grey['500Channel'], 0.2)
                            }`,
                          bgcolor: (theme) =>
                            deliveryType === 'pickup'
                              ? varAlpha(theme.vars.palette.primary.mainChannel, 0.08)
                              : 'background.paper',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.75,
                          alignItems: 'center',
                        }}
                      >
                        <Iconify
                          icon="solar:shop-bold"
                          width={28}
                          sx={{
                            color: deliveryType === 'pickup' ? 'primary.main' : 'text.disabled',
                          }}
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Retirar na Loja
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Grátis
                        </Typography>
                      </ButtonBase>
                    )}
                  </Stack>
                </Card>

                {/* 2. Dados do Cliente */}
                <Card sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                    Seus Dados de Contato
                  </Typography>

                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      label="WhatsApp para contato"
                      placeholder="(91) 98888-7777"
                      value={customerPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      onBlur={() => handleLookupCustomer(customerPhone)}
                      required
                      helperText="Informe seu WhatsApp — se já comprou conosco, preencheremos seus dados automaticamente"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify
                              icon="solar:phone-calling-bold"
                              sx={{ color: 'text.disabled' }}
                            />
                          </InputAdornment>
                        ),
                        endAdornment: lookingUpCustomer ? (
                          <InputAdornment position="end">
                            <CircularProgress size={20} />
                          </InputAdornment>
                        ) : customerIdentified ? (
                          <InputAdornment position="end">
                            <Iconify
                              icon="solar:check-circle-bold"
                              sx={{ color: 'success.main' }}
                            />
                          </InputAdornment>
                        ) : null,
                      }}
                    />

                    {customerIdentified && (
                      <Alert severity="success" sx={{ typography: 'caption' }}>
                        Cliente identificado pelo telefone! Nome e endereço preenchidos
                        automaticamente.
                      </Alert>
                    )}

                    <TextField
                      fullWidth
                      label="Seu nome completo"
                      placeholder="Ex: João da Silva"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      required
                    />
                  </Stack>
                </Card>

                {/* 3. Endereço de Entrega (quando Entrega selecionada) */}
                {deliveryType === 'delivery' && (
                  <Card sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                      Endereço de Entrega
                    </Typography>

                    <Stack spacing={2}>
                      <TextField
                        fullWidth
                        type="tel"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        label="CEP (opcional - busca automática)"
                        placeholder="00000-000"
                        value={cep}
                        onChange={(e) => setCep(formatCep(e.target.value))}
                        onBlur={handleCepBlur}
                        InputProps={{
                          endAdornment: cepLoading ? (
                            <InputAdornment position="end">
                              <CircularProgress size={20} />
                            </InputAdornment>
                          ) : null,
                        }}
                      />

                      <TextField
                        fullWidth
                        label="Rua / Logradouro"
                        placeholder="Ex: Rua das Flores"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        required
                      />

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                          fullWidth
                          type="tel"
                          inputMode="numeric"
                          label="Número"
                          placeholder="123"
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                          required
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          fullWidth
                          label="Complemento (apto, bloco)"
                          placeholder="Apto 101"
                          value={complement}
                          onChange={(e) => setComplement(e.target.value)}
                          sx={{ flex: 2 }}
                        />
                      </Stack>

                      <TextField
                        fullWidth
                        label="Bairro"
                        placeholder="Ex: Centro"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        required
                      />

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                          fullWidth
                          label="Cidade"
                          placeholder="Cidade"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          sx={{ flex: 3 }}
                        />
                        <TextField
                          fullWidth
                          label="UF"
                          placeholder="UF"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                    </Stack>
                  </Card>
                )}

                {/* 4. Forma de Pagamento e Observações */}
                <Card sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                    Forma de Pagamento (na {deliveryType === 'delivery' ? 'entrega' : 'retirada'})
                  </Typography>

                  <Stack spacing={1.5} sx={{ mb: 2.5 }}>
                    {store.paymentMethodsOnDelivery.map((method) => {
                      const cfg = PAYMENT_METHOD_CONFIG[method] || PAYMENT_METHOD_CONFIG.cash;
                      const isSelected = paymentMethod === method;

                      return (
                        <ButtonBase
                          key={method}
                          onClick={() => setPaymentMethod(method)}
                          sx={{
                            width: '100%',
                            p: 1.75,
                            borderRadius: 1.5,
                            textAlign: 'left',
                            justifyContent: 'flex-start',
                            border: (theme) =>
                              `1.5px solid ${
                                isSelected
                                  ? theme.vars.palette.primary.main
                                  : varAlpha(theme.vars.palette.grey['500Channel'], 0.2)
                              }`,
                            bgcolor: (theme) =>
                              isSelected
                                ? varAlpha(theme.vars.palette.primary.mainChannel, 0.06)
                                : 'background.paper',
                          }}
                        >
                          <Stack
                            direction="row"
                            spacing={1.5}
                            alignItems="center"
                            sx={{ width: '100%' }}
                          >
                            <Avatar
                              sx={{
                                width: 40,
                                height: 40,
                                bgcolor: alpha(cfg.color, 0.12),
                                color: cfg.color,
                              }}
                            >
                              <PaymentMethodIcon method={method} size={24} />
                            </Avatar>

                            <Box sx={{ flex: 1 }}>
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                  {cfg.label}
                                </Typography>
                                <PaymentBrandLogos method={method} size={20} />
                              </Stack>
                              <Typography variant="caption" color="text.secondary">
                                {cfg.desc}
                              </Typography>
                            </Box>

                            {isSelected && (
                              <Iconify
                                icon="solar:check-circle-bold"
                                width={22}
                                sx={{ color: 'primary.main' }}
                              />
                            )}
                          </Stack>
                        </ButtonBase>
                      );
                    })}
                  </Stack>

                  <Stack spacing={2}>
                    {paymentMethod === 'cash' && (
                      <TextField
                        fullWidth
                        type="number"
                        label="Precisa de troco para quanto? (opcional)"
                        placeholder="Ex: 50.00"
                        value={cashChangeFor}
                        onChange={(e) => setCashChangeFor(e.target.value)}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">R$</InputAdornment>,
                        }}
                      />
                    )}

                    <TextField
                      fullWidth
                      multiline
                      rows={2}
                      label="Observações do pedido (opcional)"
                      placeholder="Ex: Tocar a campainha, entregar na portaria..."
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                    />
                  </Stack>
                </Card>
              </Stack>

              {/* Coluna Direita: Resumo da Sacola (Sticky no desktop) */}
              <Card
                sx={{
                  p: { xs: 2.5, sm: 3 },
                  borderRadius: 2,
                  position: { md: 'sticky' },
                  top: { md: 88 },
                }}
              >
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                  Resumo da Sacola ({cart.itemCount})
                </Typography>

                <Stack spacing={1.5} sx={{ mb: 2 }}>
                  {cart.lines.map((line) => (
                    <Stack
                      key={line.productId}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{
                        p: 1.5,
                        borderRadius: 1.5,
                        bgcolor: 'background.neutral',
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                        <Typography variant="subtitle2" noWrap>
                          {line.name}
                        </Typography>
                        {line.notes && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            component="div"
                          >
                            Obs: {line.notes}
                          </Typography>
                        )}
                        <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700 }}>
                          {line.qty}x {fCurrency(line.unitPrice)} ={' '}
                          {fCurrency(line.qty * line.unitPrice)}
                        </Typography>
                      </Box>

                      <IncrementerButton
                        quantity={line.qty}
                        onDecrease={() => cart.updateQty(line.productId, line.qty - 1)}
                        onIncrease={() => cart.updateQty(line.productId, line.qty + 1)}
                        onDelete={() => cart.removeLine(line.productId)}
                      />
                    </Stack>
                  ))}
                </Stack>

                <Button
                  fullWidth
                  variant="outlined"
                  color="primary"
                  startIcon={<Iconify icon="mingcute:add-line" />}
                  onClick={handleBackToMenu}
                  sx={{
                    mb: 2.5,
                    py: 1.25,
                    borderRadius: 1.5,
                    borderStyle: 'dashed',
                    fontWeight: 600,
                  }}
                >
                  Adicionar mais produtos
                </Button>

                <Divider sx={{ mb: 2, borderStyle: 'dashed' }} />

                <Stack spacing={1.25} sx={{ mb: 2.5 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      Subtotal dos itens
                    </Typography>
                    <Typography variant="subtitle2">{fCurrency(cart.subtotal)}</Typography>
                  </Stack>

                  {deliveryType === 'delivery' && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        Taxa de entrega
                      </Typography>
                      <Typography variant="subtitle2">
                        {deliveryFee > 0 ? fCurrency(deliveryFee) : 'Grátis'}
                      </Typography>
                    </Stack>
                  )}

                  <Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Total a pagar
                    </Typography>
                    <Typography variant="h5" color="primary.main" sx={{ fontWeight: 800 }}>
                      {fCurrency(total)}
                    </Typography>
                  </Stack>
                </Stack>

                {isBelowMinOrder && store.minOrderAmount && (
                  <Alert severity="warning" sx={{ mb: 2, typography: 'caption' }}>
                    O pedido mínimo da loja é de <strong>{fCurrency(store.minOrderAmount)}</strong>.
                    Faltam <strong>{fCurrency(store.minOrderAmount - cart.subtotal)}</strong> para
                    atingir o valor mínimo.
                  </Alert>
                )}

                <Button
                  fullWidth
                  size="large"
                  variant="contained"
                  color="primary"
                  disabled={!store.isOpen || submitting || cart.itemCount === 0 || isBelowMinOrder}
                  onClick={handlePlaceOrder}
                  sx={{ py: 1.5, borderRadius: 1.5, fontSize: 16, fontWeight: 700 }}
                >
                  {submitting ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    `Confirmar Pedido • ${fCurrency(total)}`
                  )}
                </Button>
              </Card>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

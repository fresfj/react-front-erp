import type {
  PublicStorefront,
  OnlinePayOnDeliveryMethod,
} from 'src/api/firestore/online-orders';

import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useRef, useMemo, useState, useEffect, useCallback } from 'react';

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
import {
  geocodeAddressBrazil,
  resolveDeliveryQuote,
  getMaxActiveRadiusKm,
  buildAddressSearchQuery,
} from 'src/sections/online-store/delivery-area-domain';

import { usePublicCart } from '../public-cart-context';
import { CheckoutSkeleton } from '../public-store-skeletons';
import { validateCheckoutForm } from '../public-store-validation';
import { PublicPhoneVerifyDialog } from '../public-phone-verify-dialog';
import { CheckoutAddressPickerDialog } from '../checkout-address-picker-dialog';
import { PAYMENT_METHOD_CONFIG, PUBLIC_STORE_MAX_WIDTH } from '../public-store-helpers';
import {
  signOutPublicCustomer,
  isPhoneVerifiedForSlug,
  getVerifiedPublicCustomer,
  saveVerifiedPublicCustomer,
} from '../public-customer-phone-auth';
import {
  formatSavedAddressLine,
  loadPublicCustomerProfile,
  savePublicCustomerProfile,
  upsertPublicCustomerAddress,
  getDefaultPublicCustomerAddress,
} from '../public-customer-profile';

import type { SavedCustomerAddress } from '../public-customer-profile';
import type { VerifiedPublicCustomer } from '../public-customer-phone-auth';
import type { CheckoutFieldName, CheckoutFormErrors } from '../public-store-validation';

// ----------------------------------------------------------------------

type LocationState = {
  store?: PublicStorefront;
  tableCode?: string;
} | null;

export function PublicCheckoutView() {
  const { slug = '', tableCode: paramTableCode = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslate('common');
  const cart = usePublicCart();

  const stateStore = (location.state as LocationState)?.store ?? null;
  const activeTableCode = paramTableCode || (location.state as LocationState)?.tableCode || '';
  const isTableMode = Boolean(activeTableCode);

  const [store, setStore] = useState<PublicStorefront | null>(stateStore);
  const [loading, setLoading] = useState(!stateStore);
  const [submitting, setSubmitting] = useState(false);
  const [phoneVerifyOpen, setPhoneVerifyOpen] = useState(false);
  const [submitAfterVerify, setSubmitAfterVerify] = useState(false);
  const [editingVerifiedName, setEditingVerifiedName] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | undefined>();
  const [savedAddresses, setSavedAddresses] = useState<SavedCustomerAddress[]>([]);
  const [verifiedCustomer, setVerifiedCustomer] = useState<VerifiedPublicCustomer | null>(() =>
    getVerifiedPublicCustomer(slug)
  );

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
  const lastLookedUpDigitsRef = useRef('');

  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>(
    isTableMode ? 'pickup' : stateStore ? (stateStore.acceptDelivery ? 'delivery' : 'pickup') : 'delivery'
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
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const [formErrors, setFormErrors] = useState<CheckoutFormErrors>({});
  const fieldRefs = useRef<Partial<Record<CheckoutFieldName, HTMLInputElement | null>>>({});
  const lastGeocodedQueryRef = useRef('');

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
          toast.success('Dados do seu cadastro carregados automaticamente!');
        }
      } catch {
        // silent fail on lookup
      } finally {
        setLookingUpCustomer(false);
      }
    },
    [slug]
  );

  const applySavedAddressToForm = useCallback((addr: SavedCustomerAddress) => {
    setSelectedAddressId(addr.id);
    setCep(addr.cep ? formatCep(addr.cep) : '');
    setStreet(addr.street || '');
    setNumber(addr.number || '');
    setComplement(addr.complement || '');
    setNeighborhood(addr.neighborhood || '');
    setCity(addr.city || '');
    setState(addr.state || '');
    lastGeocodedQueryRef.current = '';
  }, []);

  const selectedSavedAddress = useMemo(() => {
    if (selectedAddressId) {
      const byId = savedAddresses.find((addr) => addr.id === selectedAddressId);
      if (byId) return byId;
    }
    return (
      savedAddresses.find(
        (addr) =>
          street.trim().toLowerCase() === addr.street.trim().toLowerCase() &&
          number.trim().toLowerCase() === addr.number.trim().toLowerCase()
      ) || null
    );
  }, [number, savedAddresses, selectedAddressId, street]);

  const useDeliveryAddressSummary = Boolean(
    verifiedCustomer && !isTableMode && deliveryType === 'delivery'
  );

  // Só carrega automaticamente dados salvos quando o cliente JÁ está autenticado pelo Firebase Phone Auth
  useEffect(() => {
    const verified = getVerifiedPublicCustomer(slug);
    setVerifiedCustomer(verified);
    if (verified) {
      setCustomerPhone(verified.phoneFormatted);
      const localProfile = loadPublicCustomerProfile(slug, verified.phoneDigits);
      if (localProfile) {
        if (localProfile.fullName) setCustomerName(localProfile.fullName);
        setSavedAddresses(localProfile.addresses);
        const defAddr = getDefaultPublicCustomerAddress(slug, verified.phoneDigits);
        if (defAddr) {
          applySavedAddressToForm(defAddr);
        }
      }
      if (!localProfile?.fullName && (verified.fullName || verified.firstName)) {
        setCustomerName((prev) => prev || verified.fullName || verified.firstName || '');
      }
      if (!localProfile?.addresses.length) {
        handleLookupCustomer(verified.phoneDigits);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handlePhoneChange = (raw: string) => {
    const formatted = formatPhoneBr(raw);
    setCustomerPhone(formatted);
  };

  const handleStartPhoneAuth = () => {
    if (!isCompletePhoneBr(customerPhone)) {
      setFormErrors((prev) => ({
        ...prev,
        customerPhone: 'Informe um número de celular válido com DDD.',
      }));
      toast.error('Informe um número de celular válido com DDD.');
      return;
    }
    setSubmitAfterVerify(false);
    setPhoneVerifyOpen(true);
  };

  const handleSwitchVerifiedAccount = async () => {
    await signOutPublicCustomer(slug);
    setVerifiedCustomer(null);
    setEditingVerifiedName(false);
    setSavedAddresses([]);
    setSelectedAddressId('');
    lastLookedUpDigitsRef.current = '';
    setCustomerPhone('');
    setCustomerName('');
    setCep('');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setState('');
  };

  const handleToggleEditVerifiedName = () => {
    if (editingVerifiedName && verifiedCustomer) {
      const trimmed = customerName.trim();
      if (!trimmed) {
        setFormErrors((prev) => ({ ...prev, customerName: 'Informe seu nome completo.' }));
        toast.error('Informe seu nome completo.');
        return;
      }
      const nextVerified: VerifiedPublicCustomer = {
        ...verifiedCustomer,
        fullName: trimmed,
        firstName: trimmed.split(/\s+/)[0] || verifiedCustomer.firstName,
      };
      saveVerifiedPublicCustomer(slug, nextVerified);
      setVerifiedCustomer(nextVerified);
      savePublicCustomerProfile(slug, verifiedCustomer.phoneDigits, {
        fullName: trimmed,
        addresses: savedAddresses,
      });
      toast.success('Nome atualizado!');
    }
    setEditingVerifiedName((prev) => !prev);
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

  const deliveryAreaMode = store?.deliveryArea?.mode || 'fixed';

  // Geocodifica automaticamente no modo raio quando o endereço mínimo estiver preenchido
  useEffect(() => {
    if (isTableMode || deliveryType !== 'delivery' || deliveryAreaMode !== 'radius') {
      return undefined;
    }
    const cleanStreet = street.trim();
    const cleanCity = city.trim();
    const cleanNb = neighborhood.trim();
    if (cleanStreet.length < 3 || (!cleanCity && !cleanNb)) {
      return undefined;
    }
    const query = buildAddressSearchQuery({
      street: cleanStreet,
      number: number.trim(),
      neighborhood: cleanNb,
      city: cleanCity,
      state: state.trim(),
      cep: digitsOnly(cep),
    });
    if (!query || query === lastGeocodedQueryRef.current) {
      return undefined;
    }
    const timer = setTimeout(async () => {
      lastGeocodedQueryRef.current = query;
      setGeocodingAddress(true);
      try {
        const res = await geocodeAddressBrazil(query);
        if (res) {
          setAddressCoords({ lat: res.lat, lng: res.lng });
        } else {
          setAddressCoords(null);
        }
      } finally {
        setGeocodingAddress(false);
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [isTableMode, deliveryType, deliveryAreaMode, street, number, neighborhood, city, state, cep]);

  const deliveryQuote = useMemo(() => {
    if (isTableMode || deliveryType !== 'delivery') {
      return {
        deliverable: true,
        fee: 0,
        estimatedMinutes: store?.estimatedMinutes || 40,
      };
    }
    return resolveDeliveryQuote(
      store?.deliveryArea,
      Number(store?.deliveryFee || 0),
      Number(store?.estimatedMinutes || 40),
      {
        lat: addressCoords?.lat,
        lng: addressCoords?.lng,
        neighborhood,
        city,
      }
    );
  }, [
    isTableMode,
    deliveryType,
    store?.deliveryArea,
    store?.deliveryFee,
    store?.estimatedMinutes,
    addressCoords,
    neighborhood,
    city,
  ]);

  const deliveryFee = deliveryType === 'delivery' ? Number(deliveryQuote.fee || 0) : 0;
  const total = Math.round((cart.subtotal + deliveryFee) * 100) / 100;
  const isBelowMinOrder = Boolean(
    store?.minOrderAmount && store.minOrderAmount > 0 && cart.subtotal < store.minOrderAmount
  );

  const clearFieldError = (field: CheckoutFieldName) => {
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateSingleField = (
    field: CheckoutFieldName,
    override?: Partial<Record<CheckoutFieldName, string>>
  ) => {
    const check = validateCheckoutForm({
      isTableMode,
      deliveryType,
      customerPhone: override?.customerPhone ?? customerPhone,
      customerName: override?.customerName ?? customerName,
      cep: override?.cep ?? cep,
      street: override?.street ?? street,
      number: override?.number ?? number,
      neighborhood: override?.neighborhood ?? neighborhood,
      city: override?.city ?? city,
      state: override?.state ?? state,
    });
    setFormErrors((prev) => ({ ...prev, [field]: check.errors[field] }));
  };

  const handlePlaceOrder = async () => {
    if (!store?.isOpen) {
      toast.error('A loja está fechada no momento.');
      return;
    }
    if (isBelowMinOrder && store.minOrderAmount) {
      toast.error(`O valor mínimo para pedidos nesta loja é de ${fCurrency(store.minOrderAmount)}.`);
      return;
    }

    const validation = validateCheckoutForm({
      isTableMode,
      deliveryType,
      customerPhone,
      customerName,
      cep,
      street,
      number,
      neighborhood,
      city,
      state,
    });

    if (!validation.valid) {
      setFormErrors(validation.errors);
      toast.error('Preencha corretamente os campos obrigatórios destacados em vermelho.');
      if (validation.firstErrorField) {
        const el = fieldRefs.current[validation.firstErrorField];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      }
      return;
    }

    setFormErrors({});

    if (!isTableMode && deliveryType === 'delivery') {
      if (geocodingAddress) {
        toast.info('Aguarde a validação da área de entrega...');
        return;
      }
      if (!deliveryQuote.deliverable) {
        toast.error(
          deliveryQuote.reason === 'address_coords_missing'
            ? 'Não conseguimos localizar o endereço no mapa. Verifique rua, número e cidade.'
            : 'Este endereço está fora da área de entrega desta loja.'
        );
        return;
      }
    }

    // Identificação e registro seguro via Firebase Phone Auth (apenas para pedidos online — nunca no modo Mesa)
    if (!isTableMode && !isPhoneVerifiedForSlug(slug, customerPhone)) {
      setSubmitAfterVerify(true);
      setPhoneVerifyOpen(true);
      return;
    }

    await submitOrderAfterVerification();
  };

  const submitOrderAfterVerification = async () => {
    if (!store) return;

    const fullAddress =
      !isTableMode && deliveryType === 'delivery'
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
                state: state.trim().toUpperCase(),
                lat: addressCoords?.lat,
                lng: addressCoords?.lng,
              }
            : undefined,
        deliveryType: isTableMode ? 'table' : deliveryType,
        tableCode: isTableMode ? activeTableCode : undefined,
        paymentMethod,
        paymentChannel: !isTableMode && paymentMethod === 'pix' ? 'online' : 'on_delivery',
        notes: finalNotes || undefined,
        origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      });

      try {
        localStorage.setItem(`onlineStore:customerPhone:${slug}`, customerPhone.trim());
        if (fullAddress) {
          localStorage.setItem(`onlineStore:customerAddress:${slug}`, fullAddress);
        }
        const firstName = customerName.trim().split(/\s+/)[0] || '';
        if (firstName && customerPhone.trim()) {
          localStorage.setItem(
            `onlineStore:customerIdentity:${slug}`,
            JSON.stringify({
              phone: customerPhone.trim(),
              firstName,
              fullName: customerName.trim(),
            })
          );
        }
        // Atualiza perfil do cliente autenticado (nome e novo endereço como padrão para a próxima compra)
        const activeVerified = getVerifiedPublicCustomer(slug);
        if (activeVerified) {
          saveVerifiedPublicCustomer(slug, {
            ...activeVerified,
            firstName: firstName || activeVerified.firstName,
            fullName: customerName.trim() || activeVerified.fullName,
          });
        }
        if (!isTableMode && deliveryType === 'delivery' && street.trim() && number.trim()) {
          upsertPublicCustomerAddress(slug, customerPhone.trim(), {
            fullName: customerName.trim(),
            address: {
              label: selectedSavedAddress?.label || 'Casa',
              cep: digitsOnly(cep),
              street: street.trim(),
              number: number.trim(),
              complement: complement.trim() || undefined,
              neighborhood: neighborhood.trim(),
              city: city.trim(),
              state: state.trim().toUpperCase(),
            },
            setAsDefault: true,
          });
        }
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

  // Faixa de valor de entrega (min - max) antes de obter o endereço + valor exato depois
  const deliveryFeeSummaryLabel = useMemo(() => {
    const hasCalculatedAddress =
      deliveryType === 'delivery' &&
      !geocodingAddress &&
      deliveryQuote.deliverable &&
      Boolean(addressCoords || deliveryQuote.matchedLabel);

    if (hasCalculatedAddress) {
      const feeText = deliveryQuote.fee > 0 ? fCurrency(deliveryQuote.fee) : 'Grátis';
      return `${feeText} • ~${deliveryQuote.estimatedMinutes} min`;
    }

    const fees: number[] = [];
    const area = store?.deliveryArea;
    if (area?.mode === 'radius' && Array.isArray(area.radiusTiers)) {
      area.radiusTiers.forEach((tier) => {
        if (tier.active !== false && Number.isFinite(tier.fee)) fees.push(Number(tier.fee));
      });
    } else if (area?.mode === 'neighborhood' && Array.isArray(area.neighborhoods)) {
      area.neighborhoods.forEach((n) => {
        if (n.active !== false && Number.isFinite(n.fee)) fees.push(Number(n.fee));
      });
    }
    if (fees.length === 0 && store) {
      fees.push(Number(store.deliveryFee || 0));
    }

    const minFee = Math.min(...fees);
    const maxFee = Math.max(...fees);
    if (maxFee <= 0) return 'Grátis';
    if (minFee === maxFee) return fCurrency(minFee);
    return `De ${fCurrency(minFee)} a ${fCurrency(maxFee)}`;
  }, [
    addressCoords,
    deliveryQuote.deliverable,
    deliveryQuote.estimatedMinutes,
    deliveryQuote.fee,
    deliveryQuote.matchedLabel,
    deliveryType,
    geocodingAddress,
    store,
  ]);

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
            maxWidth: PUBLIC_STORE_MAX_WIDTH,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
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
          maxWidth: PUBLIC_STORE_MAX_WIDTH,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
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
                <Card sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 700 }}>
                    Como deseja receber seu pedido?
                  </Typography>

                  <Box
                    display="grid"
                    gridTemplateColumns={
                      store.acceptDelivery && store.acceptPickup
                        ? 'repeat(2, minmax(0, 1fr))'
                        : '1fr'
                    }
                    gap={1.25}
                  >
                    {store.acceptDelivery && (
                      <ButtonBase
                        onClick={() => setDeliveryType('delivery')}
                        sx={{
                          py: 1.25,
                          px: 1.5,
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
                          gap: 0.35,
                          alignItems: 'center',
                          textAlign: 'center',
                          minWidth: 0,
                        }}
                      >
                        <Iconify
                          icon="mdi:moped"
                          width={24}
                          sx={{
                            color: deliveryType === 'delivery' ? 'primary.main' : 'text.disabled',
                          }}
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                          Receber em casa
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: 11, lineHeight: 1.2 }}
                          noWrap
                        >
                          {deliveryFeeSummaryLabel}
                        </Typography>
                      </ButtonBase>
                    )}

                    {store.acceptPickup && (
                      <ButtonBase
                        onClick={() => setDeliveryType('pickup')}
                        sx={{
                          py: 1.25,
                          px: 1.5,
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
                          gap: 0.35,
                          alignItems: 'center',
                          textAlign: 'center',
                          minWidth: 0,
                        }}
                      >
                        <Iconify
                          icon="solar:shop-bold"
                          width={22}
                          sx={{
                            color: deliveryType === 'pickup' ? 'primary.main' : 'text.disabled',
                          }}
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                          Retirar na Loja
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: 11, lineHeight: 1.2 }}
                          noWrap
                        >
                          Grátis
                        </Typography>
                      </ButtonBase>
                    )}
                  </Box>
                </Card>

                {/* 2. Dados do Cliente (Autenticado por SMS ou Validação de Celular) */}
                <Card sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1}
                    sx={{ mb: 2 }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Seus Dados
                    </Typography>
                    {!isTableMode && verifiedCustomer && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Button
                          size="small"
                          color="primary"
                          onClick={handleToggleEditVerifiedName}
                          startIcon={<Iconify icon="solar:pen-bold" width={15} />}
                        >
                          {editingVerifiedName ? 'Salvar' : 'Editar'}
                        </Button>
                        <Button
                          size="small"
                          color="inherit"
                          onClick={handleSwitchVerifiedAccount}
                          startIcon={<Iconify icon="solar:logout-2-bold" width={16} />}
                        >
                          Trocar
                        </Button>
                      </Stack>
                    )}
                  </Stack>

                  {!isTableMode && verifiedCustomer ? (
                    <Stack spacing={2}>
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1.5,
                          bgcolor: (theme) =>
                            varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
                          border: (theme) =>
                            `1.5px solid ${theme.vars.palette.primary.main}`,
                        }}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: 1.25,
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: (theme) =>
                                varAlpha(theme.vars.palette.primary.mainChannel, 0.14),
                              color: 'primary.main',
                            }}
                          >
                            <Iconify icon="solar:verified-check-bold" width={22} />
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                              {customerName.trim() || verifiedCustomer.fullName || 'Cliente verificado'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {verifiedCustomer.phoneFormatted} • Celular autenticado
                            </Typography>
                          </Box>
                        </Stack>
                        {lookingUpCustomer ? (
                          <CircularProgress size={18} />
                        ) : (
                          <Iconify
                            icon="solar:check-circle-bold"
                            width={22}
                            sx={{ color: 'primary.main', flexShrink: 0 }}
                          />
                        )}
                      </Box>

                      {(!customerName.trim() || editingVerifiedName) && (
                        <TextField
                          fullWidth
                          inputRef={(el) => {
                            fieldRefs.current.customerName = el;
                          }}
                          label={isTableMode ? 'Seu nome (identificação na mesa)' : 'Seu nome completo'}
                          placeholder="Ex: João da Silva"
                          value={customerName}
                          onChange={(e) => {
                            setCustomerName(e.target.value);
                            clearFieldError('customerName');
                          }}
                          onBlur={() => validateSingleField('customerName')}
                          error={Boolean(formErrors.customerName)}
                          helperText={formErrors.customerName}
                          required
                        />
                      )}
                    </Stack>
                  ) : (
                    <Stack spacing={2}>
                      <TextField
                        fullWidth
                        inputRef={(el) => {
                          fieldRefs.current.customerPhone = el;
                        }}
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        label="Celular / WhatsApp"
                        placeholder="(41) 99999-8888"
                        value={customerPhone}
                        onChange={(e) => {
                          handlePhoneChange(e.target.value);
                          clearFieldError('customerPhone');
                        }}
                        onBlur={() => validateSingleField('customerPhone')}
                        required={!isTableMode}
                        error={Boolean(formErrors.customerPhone)}
                        helperText={
                          formErrors.customerPhone ||
                          'Informe seu celular para validar o acesso por SMS e preencher seus dados com segurança'
                        }
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Iconify
                                icon="solar:smartphone-2-bold"
                                sx={{ color: 'text.disabled' }}
                              />
                            </InputAdornment>
                          ),
                        }}
                      />

                      {!isTableMode && (
                        <Button
                          fullWidth
                          variant="soft"
                          color="primary"
                          size="large"
                          disabled={!isCompletePhoneBr(customerPhone)}
                          onClick={handleStartPhoneAuth}
                          startIcon={<Iconify icon="solar:shield-check-bold" />}
                        >
                          Validar celular por SMS e liberar meus dados
                        </Button>
                      )}

                      <TextField
                        fullWidth
                        inputRef={(el) => {
                          fieldRefs.current.customerName = el;
                        }}
                        label={isTableMode ? 'Seu nome (identificação na mesa)' : 'Seu nome completo'}
                        placeholder="Ex: João da Silva"
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          clearFieldError('customerName');
                        }}
                        onBlur={() => validateSingleField('customerName')}
                        error={Boolean(formErrors.customerName)}
                        helperText={formErrors.customerName}
                        required
                      />
                    </Stack>
                  )}
                </Card>

                {/* 3. Endereço de Entrega (quando Entrega selecionada) */}
                {deliveryType === 'delivery' && (
                  <Card sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1}
                      sx={{ mb: 2 }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Endereço de Entrega
                      </Typography>
                      {useDeliveryAddressSummary && (
                        <Button
                          size="small"
                          color="primary"
                          onClick={() => setAddressModalOpen(true)}
                          startIcon={<Iconify icon="solar:pen-bold" width={15} />}
                        >
                          Alterar
                        </Button>
                      )}
                    </Stack>

                    {useDeliveryAddressSummary ? (
                      <Stack spacing={2}>
                        {selectedSavedAddress || (street.trim() && number.trim()) ? (
                          <Box
                            sx={{
                              p: 2,
                              borderRadius: 1.5,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 1.5,
                              bgcolor: (theme) =>
                                varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
                              border: (theme) =>
                                `1.5px solid ${theme.vars.palette.primary.main}`,
                            }}
                          >
                            <Stack
                              direction="row"
                              spacing={1.5}
                              alignItems="center"
                              sx={{ minWidth: 0 }}
                            >
                              <Box
                                sx={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 1.25,
                                  flexShrink: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  bgcolor: (theme) =>
                                    varAlpha(theme.vars.palette.primary.mainChannel, 0.14),
                                  color: 'primary.main',
                                }}
                              >
                                <Iconify icon="solar:map-point-bold" width={22} />
                              </Box>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                                  {selectedSavedAddress?.label || 'Endereço selecionado'}
                                  {selectedSavedAddress?.isDefault ? ' · Padrão' : ''}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  display="block"
                                  sx={{ whiteSpace: 'normal' }}
                                >
                                  {selectedSavedAddress
                                    ? formatSavedAddressLine(selectedSavedAddress)
                                    : `${street}, nº ${number}${
                                        complement ? ` (${complement})` : ''
                                      } — ${neighborhood}, ${city}-${state}`}
                                </Typography>
                              </Box>
                            </Stack>
                            <Iconify
                              icon="solar:check-circle-bold"
                              width={22}
                              sx={{ color: 'primary.main', flexShrink: 0 }}
                            />
                          </Box>
                        ) : (
                          <Alert
                            severity="warning"
                            action={
                              <Button
                                color="inherit"
                                size="small"
                                onClick={() => setAddressModalOpen(true)}
                              >
                                Adicionar
                              </Button>
                            }
                          >
                            Selecione ou adicione um endereço de entrega.
                          </Alert>
                        )}
                      </Stack>
                    ) : (
                    <Stack spacing={2}>
                      {!verifiedCustomer && savedAddresses.length > 0 && (
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 0 }}>
                        {savedAddresses.map((addr) => {
                          const isSelected =
                            street.trim().toLowerCase() === addr.street.trim().toLowerCase() &&
                            number.trim().toLowerCase() === addr.number.trim().toLowerCase();
                          return (
                            <Button
                              key={addr.id}
                              size="small"
                              variant={isSelected ? 'contained' : 'outlined'}
                              color={isSelected ? 'primary' : 'inherit'}
                              onClick={() => applySavedAddressToForm(addr)}
                              startIcon={
                                <Iconify
                                  icon={addr.isDefault ? 'solar:star-bold' : 'solar:map-point-bold'}
                                  width={15}
                                />
                              }
                            >
                              {addr.label}: {addr.street}, {addr.number}
                            </Button>
                          );
                        })}
                      </Stack>
                      )}

                      <TextField
                        fullWidth
                        inputRef={(el) => {
                          fieldRefs.current.cep = el;
                        }}
                        type="tel"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        label="CEP (busca automática de endereço)"
                        placeholder="00000-000"
                        value={cep}
                        onChange={(e) => {
                          setCep(formatCep(e.target.value));
                          clearFieldError('cep');
                        }}
                        onBlur={() => {
                          handleCepBlur();
                          validateSingleField('cep');
                        }}
                        error={Boolean(formErrors.cep)}
                        helperText={formErrors.cep}
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
                        inputRef={(el) => {
                          fieldRefs.current.street = el;
                        }}
                        label="Rua / Logradouro"
                        placeholder="Ex: Rua das Flores"
                        value={street}
                        onChange={(e) => {
                          setStreet(e.target.value);
                          clearFieldError('street');
                        }}
                        onBlur={() => validateSingleField('street')}
                        error={Boolean(formErrors.street)}
                        helperText={formErrors.street}
                        required
                      />

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                          fullWidth
                          inputRef={(el) => {
                            fieldRefs.current.number = el;
                          }}
                          label="Número"
                          placeholder="123 ou S/N"
                          value={number}
                          onChange={(e) => {
                            setNumber(e.target.value);
                            clearFieldError('number');
                          }}
                          onBlur={() => validateSingleField('number')}
                          error={Boolean(formErrors.number)}
                          helperText={formErrors.number}
                          required
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          fullWidth
                          label="Complemento (apto, bloco, ref.)"
                          placeholder="Apto 101"
                          value={complement}
                          onChange={(e) => setComplement(e.target.value)}
                          sx={{ flex: 2 }}
                        />
                      </Stack>

                      <TextField
                        fullWidth
                        inputRef={(el) => {
                          fieldRefs.current.neighborhood = el;
                        }}
                        label="Bairro"
                        placeholder="Ex: Centro"
                        value={neighborhood}
                        onChange={(e) => {
                          setNeighborhood(e.target.value);
                          clearFieldError('neighborhood');
                        }}
                        onBlur={() => validateSingleField('neighborhood')}
                        error={Boolean(formErrors.neighborhood)}
                        helperText={formErrors.neighborhood}
                        required
                      />

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                          fullWidth
                          inputRef={(el) => {
                            fieldRefs.current.city = el;
                          }}
                          label="Cidade"
                          placeholder="Cidade"
                          value={city}
                          onChange={(e) => {
                            setCity(e.target.value);
                            clearFieldError('city');
                          }}
                          onBlur={() => validateSingleField('city')}
                          error={Boolean(formErrors.city)}
                          helperText={formErrors.city}
                          required
                          sx={{ flex: 3 }}
                        />
                        <TextField
                          fullWidth
                          inputRef={(el) => {
                            fieldRefs.current.state = el;
                          }}
                          label="UF"
                          placeholder="PA"
                          inputProps={{ maxLength: 2 }}
                          value={state}
                          onChange={(e) => {
                            setState(e.target.value.toUpperCase());
                            clearFieldError('state');
                          }}
                          onBlur={() => validateSingleField('state')}
                          error={Boolean(formErrors.state)}
                          helperText={formErrors.state}
                          required
                          sx={{ flex: 1 }}
                        />
                      </Stack>
                    </Stack>
                    )}

                    <Stack spacing={2} sx={{ mt: useDeliveryAddressSummary ? 2 : 0 }}>
                      {/* Feedback em tempo real da área de entrega */}
                      {deliveryAreaMode !== 'fixed' && (
                        <>
                          {geocodingAddress && (
                            <Alert severity="info" icon={<CircularProgress size={18} />}>
                              Calculando distância e taxa de entrega para o seu endereço...
                            </Alert>
                          )}
                          {!geocodingAddress &&
                            !deliveryQuote.deliverable &&
                            (street.trim().length >= 3 || neighborhood.trim().length >= 2) && (
                              <Alert
                                severity="error"
                                action={
                                  store.acceptPickup ? (
                                    <Button
                                      color="inherit"
                                      size="small"
                                      onClick={() => setDeliveryType('pickup')}
                                    >
                                      Retirar no local
                                    </Button>
                                  ) : undefined
                                }
                              >
                                {deliveryQuote.reason === 'outside_radius'
                                  ? `Endereço a ~${deliveryQuote.distanceKm?.toFixed(1)} km — fora do raio máximo de entrega (${getMaxActiveRadiusKm(store.deliveryArea)} km).`
                                  : deliveryQuote.reason === 'neighborhood_not_served'
                                    ? 'O bairro informado está fora da área de entrega desta loja.'
                                    : 'Informe rua, número e cidade válidos para confirmarmos a área de entrega.'}
                              </Alert>
                            )}
                        </>
                      )}
                    </Stack>
                  </Card>
                )}

                {/* 3.5. Card Dedicado de Entrega (Motoboy + Valor Selecionado + Tempo Estimado) */}
                {!isTableMode &&
                  deliveryType === 'delivery' &&
                  !geocodingAddress &&
                  deliveryQuote.deliverable &&
                  (street.trim().length >= 3 || neighborhood.trim().length >= 2 || Boolean(addressCoords)) && (
                    <Card sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
                      <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                        Entrega
                      </Typography>

                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 2,
                          border: (theme) => `1.5px solid ${theme.vars.palette.primary.main}`,
                          bgcolor: (theme) =>
                            varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
                        }}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: 1.25,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              bgcolor: (theme) =>
                                varAlpha(theme.vars.palette.primary.mainChannel, 0.14),
                              color: 'primary.main',
                            }}
                          >
                            <Iconify icon="mdi:moped" width={22} />
                          </Box>

                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              Motoboy
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Tempo estimado: <strong>{deliveryQuote.estimatedMinutes} min</strong>
                              {deliveryQuote.distanceKm != null
                                ? ` • ~${deliveryQuote.distanceKm.toFixed(1)} km`
                                : ''}
                              {deliveryQuote.matchedLabel ? ` • ${deliveryQuote.matchedLabel}` : ''}
                            </Typography>
                          </Box>
                        </Stack>

                        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 800 }}>
                              {deliveryQuote.fee === 0 ? 'Grátis' : fCurrency(deliveryQuote.fee)}
                            </Typography>
                            <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
                              Selecionado
                            </Typography>
                          </Box>
                          <Iconify
                            icon="solar:check-circle-bold"
                            width={22}
                            sx={{ color: 'primary.main', flexShrink: 0 }}
                          />
                        </Stack>
                      </Box>
                    </Card>
                  )}

                {/* 4. Forma de Pagamento (Online vs. Na Entrega) e Observações */}
                <Card sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2 }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                    Forma de Pagamento
                  </Typography>

                  {(() => {
                    const hasOnlinePix =
                      store.acceptOnlinePix !== false &&
                      store.paymentMethodsOnDelivery.includes('pix');
                    const onDeliveryMethods = store.paymentMethodsOnDelivery.filter(
                      (m) => m !== 'pix'
                    );

                    const renderOptionButton = (
                      method: OnlinePayOnDeliveryMethod,
                      subtitleOverride?: string,
                      badgeText?: string
                    ) => {
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
                                {badgeText && (
                                  <Box
                                    component="span"
                                    sx={{
                                      px: 0.75,
                                      py: 0.2,
                                      borderRadius: 0.75,
                                      bgcolor: (theme) =>
                                        varAlpha(theme.vars.palette.success.mainChannel, 0.14),
                                      color: 'success.dark',
                                      typography: 'caption',
                                      fontWeight: 700,
                                      fontSize: 10.5,
                                    }}
                                  >
                                    {badgeText}
                                  </Box>
                                )}
                                <PaymentBrandLogos method={method} size={20} />
                              </Stack>
                              <Typography variant="caption" color="text.secondary">
                                {subtitleOverride || cfg.desc}
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
                    };

                    return (
                      <Stack spacing={2.5} sx={{ mb: 2.5 }}>
                        {hasOnlinePix && (
                          <Stack spacing={1.25}>
                            <Typography
                              variant="overline"
                              color="text.secondary"
                              sx={{ fontWeight: 700 }}
                            >
                              Pagamento Online
                            </Typography>
                            {renderOptionButton(
                              'pix',
                              'Gera QR Code e Copia e Cola agora — aguarda confirmação da loja',
                              'Online'
                            )}
                          </Stack>
                        )}

                        {onDeliveryMethods.length > 0 && (
                          <Stack spacing={1.25}>
                            <Typography
                              variant="overline"
                              color="text.secondary"
                              sx={{ fontWeight: 700 }}
                            >
                              Pagar na {deliveryType === 'delivery' ? 'Entrega' : 'Retirada'}
                            </Typography>
                            {onDeliveryMethods.map((method) => renderOptionButton(method))}
                          </Stack>
                        )}
                      </Stack>
                    );
                  })()}

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

      <PublicPhoneVerifyDialog
        open={phoneVerifyOpen}
        slug={slug}
        phone={customerPhone}
        customerName={customerName}
        title={submitAfterVerify ? 'Confirme seu celular para finalizar' : 'Autentique seu celular'}
        subtitle={
          submitAfterVerify
            ? `Enviamos um código SMS de 6 dígitos para ${customerPhone}. Após digitar os números, seu pedido será confirmado automaticamente.`
            : `Enviamos um código SMS de 6 dígitos para ${customerPhone}. Após validar, liberaremos seus dados cadastrados.`
        }
        onClose={() => {
          setPhoneVerifyOpen(false);
          setSubmitAfterVerify(false);
        }}
        onVerified={async (verified) => {
          setPhoneVerifyOpen(false);
          setVerifiedCustomer(verified);
          setCustomerPhone(verified.phoneFormatted);
          await handleLookupCustomer(verified.phoneDigits);
          if (submitAfterVerify) {
            setSubmitAfterVerify(false);
            submitOrderAfterVerification();
          }
        }}
      />

      <CheckoutAddressPickerDialog
        open={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        addresses={savedAddresses}
        selectedId={selectedSavedAddress?.id}
        onSelect={(addr) => applySavedAddressToForm(addr)}
        onCreate={(draft) => {
          const profile = upsertPublicCustomerAddress(slug, customerPhone.trim(), {
            fullName: customerName.trim(),
            address: {
              label: draft.label,
              cep: digitsOnly(draft.cep),
              street: draft.street.trim(),
              number: draft.number.trim(),
              complement: draft.complement?.trim() || undefined,
              neighborhood: draft.neighborhood.trim(),
              city: draft.city.trim(),
              state: draft.state.trim().toUpperCase(),
            },
            setAsDefault: savedAddresses.length === 0,
          });
          setSavedAddresses(profile.addresses);
          const created =
            profile.addresses.find(
              (addr) =>
                addr.street.trim().toLowerCase() === draft.street.trim().toLowerCase() &&
                addr.number.trim().toLowerCase() === draft.number.trim().toLowerCase()
            ) || profile.addresses[profile.addresses.length - 1];
          if (created) applySavedAddressToForm(created);
          toast.success('Endereço salvo');
        }}
      />
    </Box>
  );
}

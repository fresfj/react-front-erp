import type {
  PublicStorefront,
  PublicStorefrontProduct,
  PublicTableSessionStatus,
} from 'src/api/firestore/online-orders';

import { useParams, useNavigate } from 'react-router-dom';
import { useRef, useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Drawer from '@mui/material/Drawer';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ButtonBase from '@mui/material/ButtonBase';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import InputAdornment from '@mui/material/InputAdornment';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';

import { paths } from 'src/routes/paths';

import { formatCep } from 'src/utils/br-docs';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { getEffectiveProductPrice } from 'src/utils/product-pricing';

import { useTranslate } from 'src/locales';
import { varAlpha } from 'src/theme/styles';
import { AvatarShape } from 'src/assets/illustrations';
import {
  placeOnlineOrderCf,
  getPublicStorefrontCf,
  getPublicTableSessionStatusCf,
} from 'src/api/firestore/online-orders';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { usePopover, CustomPopover } from 'src/components/custom-popover';
import { ProductImageBadges } from 'src/components/product-badges/product-image-badges';
import { PaymentMethodIcon, PaymentBrandLogos } from 'src/components/payment-method-icon';

import { IncrementerButton } from 'src/sections/product/components/incrementer-button';

import { usePublicCart } from '../public-cart-context';
import { StorefrontSkeleton } from '../public-store-skeletons';
import { PublicTableOrderDialog } from '../public-table-order-dialog';
import { PublicTableTrackerDrawer } from '../public-table-tracker-drawer';
import { PublicStoreSeoHead, buildStoreSharePayload } from '../public-store-seo-head';
import {
  CLOSED_REASON_KEY,
  getStoreOpenStatus,
  PAYMENT_METHOD_CONFIG,
} from '../public-store-helpers';

// ----------------------------------------------------------------------

export function PublicStorefrontView() {
  const { slug = '', tableCode = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslate('common');
  const cart = usePublicCart();

  const [store, setStore] = useState<PublicStorefront | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // Perfil da Loja Drawer & Popover de Compartilhamento
  const [profileOpen, setProfileOpen] = useState(false);
  const sharePopover = usePopover();

  // Modo Mesa (QR Code exclusivo — sem checkout, envia direto para Em Preparo no Kanban)
  const isTableMode = Boolean(tableCode);
  const tableDisplayNumber = tableCode.replace(/^mesa-/i, '') || tableCode;
  const [tableStatus, setTableStatus] = useState<PublicTableSessionStatus | null>(null);
  const [tableRefreshing, setTableRefreshing] = useState(false);
  const [tableOrderDialogOpen, setTableOrderDialogOpen] = useState(false);
  const [tableTrackerOpen, setTableTrackerOpen] = useState(false);
  const [tableSubmitting, setTableSubmitting] = useState(false);

  const tableRequesterStorageKey = `erp.publicTableRequester.${slug}.${tableCode}`;
  const [savedTableRequester, setSavedTableRequester] = useState<{
    firstName: string;
    phone: string;
  }>(() => {
    try {
      const raw = window.localStorage.getItem(`erp.publicTableRequester.${slug}.${tableCode}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { firstName: String(parsed.firstName || ''), phone: String(parsed.phone || '') };
      }
    } catch {
      // ignore storage errors
    }
    return { firstName: '', phone: '' };
  });

  const loadTableStatus = useCallback(
    async (silent = false, phoneOverride?: string) => {
      if (!slug || !tableCode) return;
      if (!silent) setTableRefreshing(true);
      try {
        const phoneToUse = phoneOverride ?? savedTableRequester.phone;
        const res = await getPublicTableSessionStatusCf(
          slug,
          tableCode,
          phoneToUse || undefined
        );
        setTableStatus(res);
      } catch {
        // table may not exist yet or function not deployed
      } finally {
        setTableRefreshing(false);
      }
    },
    [slug, tableCode, savedTableRequester.phone]
  );

  useEffect(() => {
    if (!isTableMode) return undefined;
    loadTableStatus(true);
    const interval = window.setInterval(() => {
      loadTableStatus(true);
    }, 12000);
    return () => window.clearInterval(interval);
  }, [isTableMode, loadTableStatus]);

  // Modal de detalhe / personalização de produto
  const [selectedProduct, setSelectedProduct] = useState<PublicStorefrontProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [itemNotes, setItemNotes] = useState('');

  // Refs para Scrollspy e IntersectionObserver
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isClickingRef = useRef(false);

  // Carrega dados da loja pública
  const loadStorefront = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPublicStorefrontCf(slug);
      setStore(data);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, t('publicStore.loadError')));
      setStore(null);
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

  // Lista de categorias distintas disponíveis
  const allCategories = useMemo(() => {
    if (!store?.products) return [];
    const set = new Set<string>();
    store.products.forEach((p) => {
      set.add(p.category || 'Outros');
    });
    return Array.from(set);
  }, [store?.products]);

  // Scrollspy com IntersectionObserver nativo
  useEffect(() => {
    if (!allCategories.length || searchQuery) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickingRef.current) return;
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          intersecting.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          const topCat = intersecting[0].target.getAttribute('data-category');
          if (topCat) {
            setActiveCategory(topCat);
            chipRefs.current[topCat]?.scrollIntoView({
              behavior: 'smooth',
              inline: 'center',
              block: 'nearest',
            });
          }
        }
      },
      {
        root: null,
        rootMargin: '-120px 0px -60% 0px',
        threshold: [0, 0.2, 0.5],
      }
    );

    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [allCategories, searchQuery]);

  // Clique na aba de categoria para rolagem suave
  const handleCategoryClick = (cat: string) => {
    setActiveCategory(cat);
    isClickingRef.current = true;
    if (cat === 'all') {
      window.scrollTo({ top: 320, behavior: 'smooth' });
    } else {
      const el = sectionRefs.current[cat];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    chipRefs.current[cat]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
    setTimeout(() => {
      isClickingRef.current = false;
    }, 800);
  };

  // Filtragem de produtos por busca
  const filteredProducts = useMemo(() => {
    if (!store?.products) return [];
    if (!searchQuery.trim()) return store.products;
    const q = searchQuery.toLowerCase();
    return store.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
  }, [store?.products, searchQuery]);

  // Agrupamento por categorias para exibição
  const groupedCategories = useMemo(() => {
    const map = new Map<string, PublicStorefrontProduct[]>();
    filteredProducts.forEach((p) => {
      const cat = p.category || 'Outros';
      const list = map.get(cat) || [];
      list.push(p);
      map.set(cat, list);
    });
    return Array.from(map.entries());
  }, [filteredProducts]);

  const storeStatus = useMemo(() => getStoreOpenStatus(store), [store]);

  // Adicionar produto selecionado ao carrinho
  const handleOpenProduct = (product: PublicStorefrontProduct) => {
    setSelectedProduct(product);
    setQty(1);
    setItemNotes('');
  };

  const handleConfirmAddProduct = () => {
    if (!selectedProduct) return;
    cart.addLine(selectedProduct, qty, itemNotes.trim() || undefined);
    toast.success(`${selectedProduct.name} adicionado à sacola!`);
    setSelectedProduct(null);
    setQty(1);
    setItemNotes('');
  };

  const isTableBlocked =
    isTableMode &&
    (!store?.isOpen ||
      store?.acceptTableOrders === false ||
      tableStatus?.table?.acceptTableOrders === false ||
      tableStatus?.table?.acceptingOrders === false);

  const handleGoToCheckout = () => {
    if (isTableMode) {
      if (isTableBlocked) {
        toast.warning('Esta mesa não está recebendo pedidos neste momento.');
        return;
      }
      setTableOrderDialogOpen(true);
      return;
    }
    navigate(paths.publicStore.checkout(slug), { state: { store } });
  };

  const handleConfirmTableOrder = async (data: {
    firstName: string;
    phone: string;
    notes?: string;
  }) => {
    if (!store?.isOpen) {
      toast.error('A loja está fechada no momento.');
      return;
    }
    setTableSubmitting(true);
    try {
      const result = await placeOnlineOrderCf({
        slug,
        items: cart.lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          notes: l.notes,
        })),
        customerName: data.firstName,
        customerPhone: data.phone,
        deliveryType: 'table',
        tableCode,
        paymentMethod: 'cash',
        paymentChannel: 'on_delivery',
        notes: data.notes,
        origin: window.location.origin,
      });

      try {
        window.localStorage.setItem(
          tableRequesterStorageKey,
          JSON.stringify({ firstName: data.firstName, phone: data.phone })
        );
      } catch {
        // ignore storage errors
      }
      setSavedTableRequester({ firstName: data.firstName, phone: data.phone });

      cart.clear();
      setTableOrderDialogOpen(false);
      toast.success(
        `Pedido ${result.code} enviado para a cozinha (Em Preparo)! Sua comanda individual segue aberta.`
      );
      await loadTableStatus(true, data.phone);
      setTableTrackerOpen(true);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao enviar pedido da mesa'));
    } finally {
      setTableSubmitting(false);
    }
  };

  const sharePayload = useMemo(
    () => (store ? buildStoreSharePayload(store, slug) : null),
    [store, slug]
  );

  const handleNativeShare = async () => {
    sharePopover.onClose();
    if (!sharePayload) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: sharePayload.title,
          text: sharePayload.description,
          url: sharePayload.storeUrl,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(sharePayload.whatsappText);
      toast.success('Link e descrição copiados! Agora é só colar e enviar.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  const handleCopyShareText = async () => {
    sharePopover.onClose();
    if (!sharePayload) return;
    try {
      await navigator.clipboard.writeText(sharePayload.whatsappText);
      toast.success('Descrição e link da loja copiados!');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  const handleCopyLinkOnly = async () => {
    sharePopover.onClose();
    if (!sharePayload) return;
    try {
      await navigator.clipboard.writeText(sharePayload.storeUrl);
      toast.success('Link da loja copiado!');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  // --------------------------------------------------------------------
  // Estados de Carregamento (Skeleton) e Loja Não Encontrada
  // --------------------------------------------------------------------
  if (loading) {
    return <StorefrontSkeleton />;
  }

  if (!store) {
    return (
      <Box
        sx={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          textAlign: 'center',
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
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440 }}>
          Não encontramos nenhuma loja associada ao endereço informado. Verifique o link e tente
          novamente.
        </Typography>
      </Box>
    );
  }

  // --------------------------------------------------------------------
  // Render Principal do Cardápio
  // --------------------------------------------------------------------
  return (
    <Box
      component="main"
      sx={{ pb: 14, pt: { xs: 2, sm: 3 }, minHeight: '100vh', bgcolor: 'background.default' }}
    >
      {/* SEO Completo: Meta Tags Open Graph (WhatsApp/Banner), Twitter Card e JSON-LD de Produtos */}
      <PublicStoreSeoHead store={store} slug={slug} />

      <Box sx={{ maxWidth: 640, mx: 'auto', px: 2 }}>
        {/* 1. Card de Identificação da Loja no estilo /dashboard/user/cards (AvatarShape + Cover + Avatar) */}
        <Card
          sx={{
            mb: 2.5,
            borderRadius: 2,
            textAlign: 'center',
            overflow: 'hidden',
            boxShadow: (theme) => theme.customShadows.z8,
            border: (theme) => `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
          }}
        >
          <Box sx={{ position: 'relative' }}>
            {/* Ações flutuantes sobre o banner: WhatsApp, Instagram e Compartilhar */}
            <Stack
              direction="row"
              spacing={1}
              sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 12,
              }}
            >
              {store.whatsapp && (
                <Tooltip title="Falar no WhatsApp">
                  <IconButton
                    component="a"
                    href={`https://wa.me/${store.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="small"
                    sx={{
                      width: 36,
                      height: 36,
                      color: '#fff',
                      bgcolor: 'rgba(18, 25, 38, 0.56)',
                      backdropFilter: 'blur(8px)',
                      '&:hover': { bgcolor: '#25D366' },
                    }}
                  >
                    <Iconify icon="ic:baseline-whatsapp" width={20} />
                  </IconButton>
                </Tooltip>
              )}

              {store.instagramUrl && (
                <Tooltip title="Instagram">
                  <IconButton
                    component="a"
                    href={
                      store.instagramUrl.startsWith('http')
                        ? store.instagramUrl
                        : `https://instagram.com/${store.instagramUrl.replace(/^@/, '')}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    size="small"
                    sx={{
                      width: 36,
                      height: 36,
                      color: '#fff',
                      bgcolor: 'rgba(18, 25, 38, 0.56)',
                      backdropFilter: 'blur(8px)',
                      '&:hover': { bgcolor: '#E1306C' },
                    }}
                  >
                    <Iconify icon="mdi:instagram" width={20} />
                  </IconButton>
                </Tooltip>
              )}

              <Tooltip title="Compartilhar loja">
                <IconButton
                  onClick={sharePopover.onOpen}
                  aria-label="Compartilhar loja"
                  size="small"
                  sx={{
                    width: 36,
                    height: 36,
                    color: '#fff',
                    bgcolor: 'rgba(18, 25, 38, 0.56)',
                    backdropFilter: 'blur(8px)',
                    '&:hover': { bgcolor: 'primary.main' },
                  }}
                >
                  <Iconify icon="solar:share-bold" width={18} />
                </IconButton>
              </Tooltip>
            </Stack>

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
              alt={store.storeName}
              src={store.logoUrl}
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
                  objectFit: store.logoFit === 'contain' ? 'contain' : 'cover',
                },
              }}
            >
              {store.storeName.charAt(0).toUpperCase()}
            </Avatar>

            {store.bannerUrl ? (
              store.bannerFit === 'contain' ? (
                <Box
                  component="img"
                  src={store.bannerUrl}
                  alt={store.storeName}
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
                    height: { xs: 190, sm: 240 },
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    component="img"
                    src={store.bannerUrl}
                    alt={store.storeName}
                    sx={{
                      width: 1,
                      height: 1,
                      display: 'block',
                      objectFit: 'cover',
                      objectPosition: `50% ${store.bannerPositionY ?? 50}%`,
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
                  height: { xs: 150, sm: 190 },
                  background: (theme) =>
                    `linear-gradient(135deg, ${theme.vars.palette.primary.darker} 0%, ${theme.vars.palette.primary.main} 100%)`,
                }}
              />
            )}
          </Box>

          <Box sx={{ pt: 6, px: 2.5, pb: 2.5 }}>
            {/* Nome da Loja (H1 semântico para SEO) */}
            <Typography component="h1" variant="h6" sx={{ fontWeight: 800, lineHeight: 1.3 }}>
              {store.storeName}
            </Typography>

            {store.description && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.75, maxWidth: 480, mx: 'auto' }}
              >
                {store.description}
              </Typography>
            )}

            {/* Banner Exclusivo da Mesa (QR Code) */}
            {isTableMode && (
              <Box
                sx={{
                  mt: 2,
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: (theme) => varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
                  border: (theme) =>
                    `1.5px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.32)}`,
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.25}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <Iconify
                      icon="solar:plate-bold-duotone"
                      width={26}
                      sx={{ color: 'primary.main', flexShrink: 0 }}
                    />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                        Você está na Mesa {tableStatus?.table?.number || tableDisplayNumber}
                        {isTableBlocked
                          ? ' · Pedidos Pausados'
                          : tableStatus?.session
                            ? ' · Comanda Aberta'
                            : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {isTableBlocked
                          ? 'Esta mesa não está recebendo pedidos neste momento. Procure o garçom ou aguarde o horário de funcionamento.'
                          : tableStatus?.session?.customerName
                            ? `Solicitante: ${tableStatus.session.customerName} · Parcial: ${fCurrency(tableStatus.session.total)}`
                            : 'Seus pedidos vão direto para a cozinha (Em Preparo) e a mesa permanece aberta.'}
                      </Typography>
                    </Box>
                  </Stack>

                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    onClick={() => {
                      loadTableStatus(false);
                      setTableTrackerOpen(true);
                    }}
                    startIcon={<Iconify icon="solar:clipboard-list-bold" width={16} />}
                    sx={{ flexShrink: 0 }}
                  >
                    Acompanhar Mesa
                    {tableStatus?.orders?.length ? ` (${tableStatus.orders.length})` : ''}
                  </Button>
                </Stack>
              </Box>
            )}

            {/* Linha de Status: Aberto até 23h59 • Pedido mín. R$ ... • Mais informações */}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="center"
              flexWrap="wrap"
              sx={{
                mt: 1,
                rowGap: 0.5,
                columnGap: 1,
                typography: 'caption',
                color: 'text.secondary',
              }}
            >
              {/* Status aberto com ponto centralizado */}
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: storeStatus.isOpen ? 'success.main' : 'warning.main',
                    boxShadow: storeStatus.isOpen
                      ? (theme) =>
                          `0 0 0 2px ${varAlpha(theme.vars.palette.success.mainChannel, 0.24)}`
                      : undefined,
                  }}
                />
                <Typography
                  component="span"
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: storeStatus.isOpen ? 'success.main' : 'warning.main',
                  }}
                >
                  {storeStatus.text}
                </Typography>
              </Stack>

              {!isTableMode && (
                <>
                  <Box component="span" sx={{ color: 'text.disabled' }}>
                    •
                  </Box>

                  {/* Pedido mínimo (apenas para catálogo online / delivery) */}
                  <Typography component="span" variant="caption">
                    {store.minOrderAmount && store.minOrderAmount > 0
                      ? `Pedido mín. ${fCurrency(store.minOrderAmount)}`
                      : 'Sem pedido mín.'}
                  </Typography>
                </>
              )}

              <Box component="span" sx={{ color: 'text.disabled' }}>
                •
              </Box>

              {/* Link para Mais Informações (Perfil da Loja) */}
              <ButtonBase
                onClick={() => setProfileOpen(true)}
                sx={{
                  typography: 'caption',
                  fontWeight: 700,
                  color: 'primary.main',
                  textDecoration: 'underline',
                  '&:hover': { color: 'primary.dark' },
                }}
              >
                Mais informações
              </ButtonBase>
            </Stack>

            {/* Faixa de Informações Rápidas (Tempo, Entrega, Retirada, WhatsApp) */}
            <Divider sx={{ my: 1.75, borderStyle: 'dashed' }} />

            <Stack
              direction="row"
              alignItems="center"
              justifyContent={isTableMode ? 'center' : 'space-between'}
              flexWrap="wrap"
              sx={{ gap: isTableMode ? 2 : 1, typography: 'caption', color: 'text.secondary' }}
            >
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Iconify icon="solar:clock-circle-bold" width={16} sx={{ color: 'info.main' }} />
                <span>~{store.estimatedMinutes} min</span>
              </Stack>

              {isTableMode ? (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Iconify icon="solar:plate-bold" width={16} sx={{ color: 'primary.main' }} />
                  <span>Consumo na mesa · Sem taxa de entrega</span>
                </Stack>
              ) : (
                <>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Iconify icon="solar:scooter-bold" width={16} sx={{ color: 'primary.main' }} />
                    <span>
                      Entrega:{' '}
                      <strong>
                        {store.deliveryFee > 0 ? fCurrency(store.deliveryFee) : 'Grátis'}
                      </strong>
                    </span>
                  </Stack>

                  {store.acceptPickup && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Iconify icon="solar:shop-bold" width={16} sx={{ color: 'success.main' }} />
                      <span>Retirada no balcão</span>
                    </Stack>
                  )}
                </>
              )}
            </Stack>

            {/* Alerta de motivo de fechamento caso a loja esteja fechada */}
            {!store.isOpen && store.closedReason && (
              <Alert severity="warning" sx={{ mt: 2, typography: 'caption', textAlign: 'left' }}>
                {t(CLOSED_REASON_KEY[store.closedReason] || 'publicStore.closedLabel')}
              </Alert>
            )}
          </Box>
        </Card>

        {/* 2. Barra de Busca (tamanho normal) e Menu de Abas (Scrollspy) Sticky sem scrollbar */}
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 1100,
            bgcolor: 'background.default',
            pt: 1,
            pb: 1.5,
          }}
        >
          {/* Campo de Busca Rápida (tamanho normal, sem small) */}
          <TextField
            fullWidth
            placeholder="Buscar produtos no cardápio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <Iconify icon="eva:close-fill" width={16} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{
              bgcolor: 'background.paper',
              borderRadius: 1.5,
              '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
            }}
          />

          {/* Abas Scrollspy com rolagem horizontal invisível (sem scrollbar) */}
          <Box
            sx={{
              mt: 1.5,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            <Stack direction="row" spacing={1} sx={{ pb: 0.5, flexWrap: 'nowrap' }}>
              <Chip
                label="Todos"
                color={activeCategory === 'all' ? 'primary' : 'default'}
                variant={activeCategory === 'all' ? 'filled' : 'soft'}
                onClick={() => handleCategoryClick('all')}
                clickable
                sx={{ fontWeight: activeCategory === 'all' ? 700 : 500, flexShrink: 0 }}
              />
              {allCategories.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <Chip
                    key={cat}
                    ref={(el) => {
                      chipRefs.current[cat] = el as HTMLDivElement | null;
                    }}
                    label={cat}
                    color={isActive ? 'primary' : 'default'}
                    variant={isActive ? 'filled' : 'soft'}
                    onClick={() => handleCategoryClick(cat)}
                    clickable
                    sx={{
                      fontWeight: isActive ? 700 : 500,
                      flexShrink: 0,
                      transition: 'all 0.2s',
                    }}
                  />
                );
              })}
            </Stack>
          </Box>
        </Box>

        {/* 3. Lista do Cardápio por Seções com Scrollspy */}
        {groupedCategories.length === 0 ? (
          <Box
            sx={{
              py: 8,
              textAlign: 'center',
              bgcolor: 'background.paper',
              borderRadius: 2,
              border: (theme) => `1px dashed ${theme.vars.palette.divider}`,
              px: 3,
            }}
          >
            <Iconify
              icon="solar:box-minimalistic-bold-duotone"
              width={56}
              sx={{ color: 'text.disabled', mb: 1.5 }}
            />
            <Typography variant="subtitle1">
              {searchQuery ? 'Nenhum produto encontrado' : 'Nenhum item disponível'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {searchQuery
                ? `Não encontramos itens correspondentes a "${searchQuery}".`
                : 'Esta loja ainda não possui produtos ativos na vitrine online.'}
            </Typography>
          </Box>
        ) : (
          <Stack spacing={3.5} sx={{ mt: 1 }}>
            {groupedCategories.map(([categoryName, products]) => (
              <Box
                key={categoryName}
                id={`category-section-${categoryName}`}
                data-category={categoryName}
                ref={(el) => {
                  sectionRefs.current[categoryName] = el as HTMLDivElement | null;
                }}
                sx={{ scrollMarginTop: 148 }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{
                    mb: 1.5,
                    fontWeight: 700,
                  }}
                >
                  {categoryName}
                </Typography>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 1.5,
                  }}
                >
                  {products.map((product) => {
                    const lineInCart = cart.lines.find((l) => l.productId === product.id);

                    return (
                      <Card
                        key={product.id}
                        sx={{
                          p: 1.5,
                          borderRadius: 1.5,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          border: (theme) =>
                            `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
                          boxShadow: 'none',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                          '&:hover': {
                            boxShadow: (theme) => theme.customShadows.z4,
                            borderColor: 'primary.main',
                          },
                        }}
                      >
                        <Stack direction="row" spacing={1.5} sx={{ flex: 1 }}>
                          {/* Foto do Produto com Badges Flutuantes (Gelado/Quente + Desconto) */}
                          <Box
                            sx={{
                              position: 'relative',
                              width: 92,
                              height: 92,
                              borderRadius: 1.25,
                              overflow: 'hidden',
                              flexShrink: 0,
                              bgcolor: 'background.neutral',
                            }}
                          >
                            {product.imageUrl ? (
                              <Box
                                component="img"
                                src={product.imageUrl}
                                alt={product.name}
                                loading="lazy"
                                decoding="async"
                                sx={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                }}
                              />
                            ) : (
                              <Box
                                sx={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Iconify
                                  icon="solar:cup-paper-bold-duotone"
                                  width={36}
                                  sx={{ color: 'text.disabled' }}
                                />
                              </Box>
                            )}

                            <ProductImageBadges
                              compact
                              servingTemperature={product.servingTemperature}
                              discountBadge={
                                getEffectiveProductPrice({
                                  salePrice: product.originalPrice ?? product.salePrice,
                                  promoActive: product.promoActive,
                                  discountType: product.discountType,
                                  discountValue: product.discountValue,
                                }).discountBadge
                              }
                            />
                          </Box>

                          {/* Detalhes do Produto */}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                              {product.isCombo && (
                                <Chip
                                  size="small"
                                  color="primary"
                                  label="Combo"
                                  sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                                />
                              )}
                              {product.featured && (
                                <Chip
                                  size="small"
                                  color="warning"
                                  label="Mais pedido"
                                  sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                                />
                              )}
                            </Stack>

                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontWeight: 700,
                                mt: product.isCombo || product.featured ? 0.5 : 0,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {product.name}
                            </Typography>

                            {product.description && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  mt: 0.5,
                                }}
                              >
                                {product.description}
                              </Typography>
                            )}

                            {product.servesCount && product.servesCount > 0 && (
                              <Typography
                                variant="caption"
                                color="text.disabled"
                                sx={{ display: 'block', mt: 0.25 }}
                              >
                                Serve {product.servesCount}{' '}
                                {product.servesCount === 1 ? 'pessoa' : 'pessoas'}
                              </Typography>
                            )}

                            <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mt: 1 }}>
                              <Typography
                                variant="subtitle2"
                                color={
                                  product.promoActive &&
                                  product.originalPrice &&
                                  product.originalPrice > product.salePrice
                                    ? 'success.main'
                                    : 'primary.main'
                                }
                                sx={{ fontWeight: 800 }}
                              >
                                {fCurrency(product.salePrice)}
                              </Typography>
                              {product.promoActive &&
                                product.originalPrice &&
                                product.originalPrice > product.salePrice && (
                                  <Typography
                                    variant="caption"
                                    sx={{ textDecoration: 'line-through', color: 'text.disabled' }}
                                  >
                                    {fCurrency(product.originalPrice)}
                                  </Typography>
                                )}
                            </Stack>
                          </Box>
                        </Stack>

                        {/* Botão de Adição / Quantidade */}
                        <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                          {lineInCart ? (
                            <Stack direction="row" spacing={1} alignItems="center">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => cart.updateQty(product.id, lineInCart.qty - 1)}
                              >
                                <Iconify icon="solar:trash-bin-trash-bold" width={16} />
                              </IconButton>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, px: 0.5 }}>
                                {lineInCart.qty}
                              </Typography>
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => cart.updateQty(product.id, lineInCart.qty + 1)}
                              >
                                <Iconify icon="mingcute:add-line" width={16} />
                              </IconButton>
                            </Stack>
                          ) : (
                            <Button
                              size="small"
                              variant="soft"
                              color="primary"
                              disabled={!store.isOpen || isTableBlocked}
                              onClick={() => handleOpenProduct(product)}
                              startIcon={<Iconify icon="mingcute:add-line" />}
                              sx={{ borderRadius: 1, fontWeight: 700 }}
                            >
                              Adicionar
                            </Button>
                          )}
                        </Box>
                      </Card>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {/* 4. Rodapé estilo App (Bottom Navigation: Início, Meus Pedidos e Carrinho) */}
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          borderTop: (theme) => `1px solid ${theme.vars.palette.divider}`,
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ maxWidth: 640, mx: 'auto' }}>
          <BottomNavigation
            showLabels
            value="home"
            onChange={(_, newValue) => {
              if (newValue === 'home') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else if (newValue === 'orders') {
                if (isTableMode) {
                  loadTableStatus(false);
                  setTableTrackerOpen(true);
                } else {
                  navigate(paths.publicStore.orders(slug));
                }
              } else if (newValue === 'cart') {
                if (cart.itemCount > 0) {
                  handleGoToCheckout();
                } else {
                  toast.info(
                    isTableMode
                      ? 'Adicione itens do cardápio para enviar à cozinha.'
                      : 'Seu carrinho está vazio. Adicione itens para finalizar.'
                  );
                }
              }
            }}
            sx={{ height: 64, bgcolor: 'transparent' }}
          >
            <BottomNavigationAction
              value="home"
              label="Início"
              icon={<Iconify icon="solar:home-2-bold" width={22} />}
            />
            <BottomNavigationAction
              value="orders"
              label={isTableMode ? 'Comanda Mesa' : 'Meus Pedidos'}
              icon={
                isTableMode && tableStatus?.orders?.length ? (
                  <Badge badgeContent={tableStatus.orders.length} color="primary">
                    <Iconify icon="solar:clipboard-list-bold" width={22} />
                  </Badge>
                ) : (
                  <Iconify icon="solar:clipboard-list-bold" width={22} />
                )
              }
            />
            <BottomNavigationAction
              value="cart"
              label={
                cart.itemCount > 0
                  ? isTableMode
                    ? `Enviar • ${fCurrency(cart.subtotal)}`
                    : fCurrency(cart.subtotal)
                  : isTableMode
                    ? 'Enviar Pedido'
                    : 'Carrinho'
              }
              icon={
                <Badge badgeContent={cart.itemCount} color="error">
                  <Iconify icon="solar:bag-3-bold" width={22} />
                </Badge>
              }
              sx={{
                ...(cart.itemCount > 0 && {
                  color: 'primary.main',
                  fontWeight: 700,
                }),
              }}
            />
          </BottomNavigation>
        </Box>
      </Paper>

      {/* Modal de Envio Direto na Mesa (sem checkout) */}
      {isTableMode && (
        <PublicTableOrderDialog
          open={tableOrderDialogOpen}
          tableNumber={tableStatus?.table?.number || tableDisplayNumber}
          linkedCustomerName={tableStatus?.session?.customerName}
          linkedCustomerPhone={tableStatus?.session?.customerPhone}
          initialName={savedTableRequester.firstName}
          initialPhone={savedTableRequester.phone}
          lines={cart.lines}
          subtotal={cart.subtotal}
          submitting={tableSubmitting}
          onClose={() => setTableOrderDialogOpen(false)}
          onConfirm={handleConfirmTableOrder}
        />
      )}

      {/* Drawer de Acompanhamento da Comanda da Mesa */}
      {isTableMode && (
        <PublicTableTrackerDrawer
          open={tableTrackerOpen}
          tableStatus={tableStatus}
          fallbackTableNumber={tableDisplayNumber}
          refreshing={tableRefreshing}
          onRefresh={() => loadTableStatus(false)}
          onClose={() => setTableTrackerOpen(false)}
        />
      )}

      {/* 5. Modal de Personalização e Quantidade do Item */}
      <Dialog
        open={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ pb: 1 }}>{selectedProduct?.name}</DialogTitle>

        <DialogContent>
          {selectedProduct?.imageUrl && (
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                height: 200,
                borderRadius: 1.5,
                overflow: 'hidden',
                mb: 2,
              }}
            >
              <Box
                component="img"
                src={selectedProduct.imageUrl}
                alt={selectedProduct.name}
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <ProductImageBadges
                servingTemperature={selectedProduct.servingTemperature}
                isCombo={selectedProduct.isCombo}
                discountBadge={
                  getEffectiveProductPrice({
                    salePrice: selectedProduct.originalPrice ?? selectedProduct.salePrice,
                    promoActive: selectedProduct.promoActive,
                    discountType: selectedProduct.discountType,
                    discountValue: selectedProduct.discountValue,
                  }).discountBadge
                }
              />
            </Box>
          )}

          {selectedProduct?.servesCount && selectedProduct.servesCount > 0 && (
            <Chip
              size="small"
              variant="outlined"
              icon={<Iconify icon="solar:users-group-rounded-bold-duotone" width={15} />}
              label={`Serve ${selectedProduct.servesCount} ${selectedProduct.servesCount === 1 ? 'pessoa' : 'pessoas'}`}
              sx={{ mb: 1.5 }}
            />
          )}

          {selectedProduct?.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {selectedProduct.description}
            </Typography>
          )}

          {selectedProduct?.isCombo &&
            selectedProduct.comboItems &&
            selectedProduct.comboItems.length > 0 && (
              <Box
                sx={{
                  p: 1.5,
                  mb: 2,
                  borderRadius: 1.25,
                  bgcolor: 'background.neutral',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>
                  Itens inclusos neste Combo:
                </Typography>
                <Stack spacing={0.5}>
                  {selectedProduct.comboItems.map((ci) => (
                    <Typography key={ci.productId} variant="caption" color="text.secondary">
                      • <strong>{ci.qty}x</strong> {ci.productName}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            )}

          <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 2 }}>
            <Typography
              variant="h6"
              color={
                selectedProduct?.promoActive &&
                selectedProduct?.originalPrice &&
                selectedProduct.originalPrice > selectedProduct.salePrice
                  ? 'success.main'
                  : 'primary.main'
              }
              sx={{ fontWeight: 700 }}
            >
              {fCurrency(selectedProduct?.salePrice || 0)}
            </Typography>
            {selectedProduct?.promoActive &&
              selectedProduct?.originalPrice &&
              selectedProduct.originalPrice > selectedProduct.salePrice && (
                <Typography
                  variant="body2"
                  sx={{ textDecoration: 'line-through', color: 'text.disabled' }}
                >
                  {fCurrency(selectedProduct.originalPrice)}
                </Typography>
              )}
          </Stack>

          <Divider sx={{ my: 2 }} />

          {/* Stepper de Quantidade */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 2.5 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Quantidade
            </Typography>
            <IncrementerButton
              size="medium"
              quantity={qty}
              onDecrease={() => setQty(Math.max(1, qty - 1))}
              onIncrease={() => setQty(qty + 1)}
            />
          </Stack>

          {/* Campo de Observações do Item (tamanho normal, sem small) */}
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Alguma observação?"
            placeholder="Ex: sem açúcar, bem gelado, levar guardanapos..."
            value={itemNotes}
            onChange={(e) => setItemNotes(e.target.value)}
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            fullWidth
            size="large"
            variant="contained"
            color="primary"
            onClick={handleConfirmAddProduct}
          >
            Adicionar • {fCurrency((selectedProduct?.salePrice || 0) * qty)}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 6. Perfil da Loja Drawer (Mais Informações - Padrão Anota AI) */}
      <Drawer
        anchor="right"
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        PaperProps={{
          sx: {
            width: '100%',
            maxWidth: 480,
            bgcolor: 'background.default',
          },
        }}
      >
        <Box sx={{ p: 2.5, overflowY: 'auto', height: '100%' }}>
          {/* Header com voltar */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2.5 }}>
            <IconButton onClick={() => setProfileOpen(false)} sx={{ ml: -1 }}>
              <Iconify icon="eva:arrow-back-fill" />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Perfil da loja
            </Typography>
          </Stack>

          {/* Card com Logo e Nome */}
          <Card sx={{ p: 2.5, mb: 2.5, textAlign: 'center' }}>
            <Avatar
              src={store.logoUrl}
              sx={{
                width: 72,
                height: 72,
                mx: 'auto',
                mb: 1.5,
                bgcolor: 'primary.lighter',
                color: 'primary.darker',
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {store.storeName.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {store.storeName}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {store.minOrderAmount && store.minOrderAmount > 0
                ? `Pedido mín. ${fCurrency(store.minOrderAmount)}`
                : 'Sem pedido mínimo'}
            </Typography>
          </Card>

          {/* Horário de Atendimento */}
          <Card sx={{ p: 2.5, mb: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              Horário de atendimento
            </Typography>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: storeStatus.isOpen ? 'success.lighter' : 'warning.lighter',
                color: storeStatus.isOpen ? 'success.darker' : 'warning.darker',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 2,
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: storeStatus.isOpen ? 'success.main' : 'warning.main',
                }}
              />
              {storeStatus.text}
            </Box>

            <Stack spacing={1} divider={<Divider sx={{ borderStyle: 'dashed' }} />}>
              {[
                'Domingo',
                'Segunda-feira',
                'Terça-feira',
                'Quarta-feira',
                'Quinta-feira',
                'Sexta-feira',
                'Sábado',
              ].map((dayName, idx) => {
                const todayIdx = new Date().getDay();
                const isToday = idx === todayIdx;
                const h = store.openingHours?.find((item) => Number(item.day) === idx);
                const isClosed = !h || h.closed;
                const hoursText = isClosed ? 'Fechado' : `${h.open} às ${h.close}`;

                return (
                  <Stack
                    key={dayName}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      py: 0.5,
                      typography: 'body2',
                      fontWeight: isToday ? 700 : 400,
                      color: isToday ? 'primary.main' : 'text.primary',
                    }}
                  >
                    <Box>
                      {dayName} {isToday && '(Hoje)'}
                    </Box>
                    <Box sx={{ color: isClosed ? 'text.disabled' : undefined }}>{hoursText}</Box>
                  </Stack>
                );
              })}
            </Stack>
          </Card>

          {/* Formas de Pagamento */}
          <Card sx={{ p: 2.5, mb: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              Formas de pagamento
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Pagamento na entrega ou retirada
            </Typography>
            <Stack spacing={1}>
              {store.paymentMethodsOnDelivery.map((method) => {
                const cfg = PAYMENT_METHOD_CONFIG[method] || PAYMENT_METHOD_CONFIG.cash;
                return (
                  <Stack
                    key={method}
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{ p: 1, borderRadius: 1, bgcolor: 'background.neutral' }}
                  >
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: alpha(cfg.color, 0.12),
                        color: cfg.color,
                      }}
                    >
                      <PaymentMethodIcon method={method} size={22} />
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {cfg.label}
                        </Typography>
                        <PaymentBrandLogos method={method} size={18} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {cfg.desc}
                      </Typography>
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </Card>

          {/* Endereço */}
          {store.address && (store.address.street || store.address.city) && (
            <Card sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Endereço
              </Typography>
              <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>
                {[
                  store.address.street &&
                    `${store.address.street}${store.address.number ? `, ${store.address.number}` : ''}`,
                  store.address.complement,
                  store.address.neighborhood,
                  [store.address.city, store.address.state].filter(Boolean).join(' - '),
                  store.address.zipCode && `CEP: ${formatCep(store.address.zipCode)}`,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Typography>
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                startIcon={<Iconify icon="solar:map-point-bold" />}
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [
                    store.address.street,
                    store.address.number,
                    store.address.city,
                    store.address.state,
                  ]
                    .filter(Boolean)
                    .join(', ')
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver no Google Maps
              </Button>
            </Card>
          )}
        </Box>
      </Drawer>

      {/* 7. Menu de Compartilhamento (WhatsApp com descrição da empresa + Copiar) */}
      <CustomPopover
        open={sharePopover.open}
        anchorEl={sharePopover.anchorEl}
        onClose={sharePopover.onClose}
        slotProps={{ arrow: { placement: 'top-right' } }}
      >
        <MenuList>
          {sharePayload && (
            <MenuItem
              component="a"
              href={sharePayload.whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={sharePopover.onClose}
            >
              <Iconify icon="ic:baseline-whatsapp" sx={{ color: '#25D366' }} />
              Compartilhar no WhatsApp
            </MenuItem>
          )}

          <MenuItem onClick={handleCopyShareText}>
            <Iconify icon="solar:document-text-bold" sx={{ color: 'primary.main' }} />
            Copiar link com descrição
          </MenuItem>

          <MenuItem onClick={handleCopyLinkOnly}>
            <Iconify icon="solar:copy-bold" sx={{ color: 'text.secondary' }} />
            Copiar apenas o link
          </MenuItem>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <MenuItem onClick={handleNativeShare}>
              <Iconify icon="solar:share-bold" sx={{ color: 'info.main' }} />
              Mais opções...
            </MenuItem>
          )}
        </MenuList>
      </CustomPopover>
    </Box>
  );
}

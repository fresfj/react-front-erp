import type { Product } from 'src/api/firestore/products';
import type { DiningTable, TableSession } from 'src/api/firestore/tables';
import type {
  OnlineOrder,
  OnlineOrderItem,
  OnlinePayOnDeliveryMethod,
} from 'src/api/firestore/online-orders';

import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Drawer from '@mui/material/Drawer';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';

import { formatPhoneBr } from 'src/utils/br-docs';
import { fCurrency } from 'src/utils/format-number';
import { getEffectiveProductPrice } from 'src/utils/product-pricing';
import { getHighlightParts, smartSearchProducts } from 'src/utils/smart-product-search';

import { varAlpha } from 'src/theme/styles';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { ProductImageBadges } from 'src/components/product-badges/product-image-badges';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  table: DiningTable | null;
  sessions: TableSession[];
  selectedSessionId: string | null;
  sessionOrders: OnlineOrder[];
  products: Product[];
  productsLoading?: boolean;
  busy?: boolean;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (customerName: string, customerPhone?: string) => Promise<void>;
  onClose: () => void;
  onSubmitOrder: (items: OnlineOrderItem[], notes?: string) => Promise<void>;
  onCloseTable: (paymentMethod: OnlinePayOnDeliveryMethod, includeServiceFee: boolean) => Promise<void>;
  onPrintComanda: (includeServiceFee: boolean) => void;
  onPrintSingleOrder: (order: OnlineOrder) => void;
};

export function TableSessionDrawer({
  open,
  table,
  sessions,
  selectedSessionId,
  sessionOrders,
  products,
  productsLoading,
  busy,
  onSelectSession,
  onCreateSession,
  onClose,
  onSubmitOrder,
  onCloseTable,
  onPrintComanda,
  onPrintSingleOrder,
}: Props) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('__featured__');
  const [draftItems, setDraftItems] = useState<OnlineOrderItem[]>([]);
  const [notes, setNotes] = useState('');
  const [showCloseBox, setShowCloseBox] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<OnlinePayOnDeliveryMethod>('pix');
  const [includeServiceFee, setIncludeServiceFee] = useState(false);

  const [addingComanda, setAddingComanda] = useState(false);
  const [newComandaName, setNewComandaName] = useState('');
  const [newComandaPhone, setNewComandaPhone] = useState('');

  useEffect(() => {
    if (open) {
      setSearch('');
      setDebouncedSearch('');
      setIsSearching(false);
      setSelectedCategory('__featured__');
      setDraftItems([]);
      setNotes('');
      setShowCloseBox(false);
      setIncludeServiceFee(false);
      setAddingComanda(false);
      setNewComandaName('');
      setNewComandaPhone('');
    }
  }, [open, table?.id]);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === debouncedSearch) {
      setIsSearching(false);
      return undefined;
    }
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      setDebouncedSearch(trimmed);
      setIsSearching(false);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [search, debouncedSearch]);

  const activeSession = useMemo(
    () =>
      sessions.find((s) => s.id === selectedSessionId) ||
      sessions[0] ||
      null,
    [selectedSessionId, sessions]
  );

  const activeFinishedProducts = useMemo(
    () => products.filter((p) => p.active && p.type === 'finished'),
    [products]
  );

  const categoryChips = useMemo(() => {
    const cats = Array.from(
      new Set(activeFinishedProducts.map((p) => p.category).filter(Boolean))
    ) as string[];
    return cats.slice(0, 6);
  }, [activeFinishedProducts]);

  const hasSearchQuery = debouncedSearch.length > 0;

  const filteredProducts = useMemo(() => {
    if (hasSearchQuery) {
      return smartSearchProducts(activeFinishedProducts, debouncedSearch, {
        limit: 12,
        category: 'all',
      });
    }
    // Sem busca: nunca listar o catálogo inteiro — exibe no máximo 6 sugestões da categoria/destaques
    const scoped = smartSearchProducts(activeFinishedProducts, '', {
      limit: 6,
      category: selectedCategory,
    });
    if (scoped.length > 0) return scoped;
    return smartSearchProducts(activeFinishedProducts, '', { limit: 6, category: 'all' });
  }, [activeFinishedProducts, debouncedSearch, hasSearchQuery, selectedCategory]);

  if (!table) {
    return <Drawer open={false} anchor="right" onClose={onClose} />;
  }

  const handleAddProduct = (prod: Product) => {
    const unitPrice = getEffectiveProductPrice(prod).effectivePrice;
    setDraftItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === prod.id);
      if (idx >= 0) {
        const next = [...prev];
        const qty = next[idx].qty + 1;
        next[idx] = { ...next[idx], qty, lineTotal: Math.round(qty * unitPrice * 100) / 100 };
        return next;
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          productSku: prod.sku,
          unit: prod.unit || 'un',
          qty: 1,
          unitPrice,
          lineTotal: unitPrice,
        },
      ];
    });
  };

  const handleChangeDraftQty = (productId: string, delta: number) => {
    setDraftItems((prev) =>
      prev
        .map((i) => {
          if (i.productId !== productId) return i;
          const nextQty = i.qty + delta;
          if (nextQty <= 0) return null;
          return { ...i, qty: nextQty, lineTotal: Math.round(nextQty * i.unitPrice * 100) / 100 };
        })
        .filter((i): i is OnlineOrderItem => i !== null)
    );
  };

  const draftTotal = draftItems.reduce((acc, i) => acc + i.lineTotal, 0);
  const currentSessionSubtotal =
    sessionOrders.length > 0
      ? sessionOrders.reduce((acc, o) => acc + Number(o.total || 0), 0)
      : activeSession?.subtotal || 0;
  const serviceFeeAmount = includeServiceFee
    ? Math.round(currentSessionSubtotal * 0.1 * 100) / 100
    : 0;
  const finalCloseTotal = Math.round((currentSessionSubtotal + serviceFeeAmount) * 100) / 100;

  const handleSendOrder = async () => {
    if (!draftItems.length) return;
    await onSubmitOrder(draftItems, notes);
    setDraftItems([]);
    setNotes('');
  };

  const handleConfirmNewComanda = async () => {
    if (!newComandaName.trim()) return;
    await onCreateSession(newComandaName.trim(), newComandaPhone.trim() || undefined);
    setNewComandaName('');
    setNewComandaPhone('');
    setAddingComanda(false);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      PaperProps={{ sx: { width: { xs: '100%', sm: 490 } } }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2.5, py: 2 }}
      >
        <Stack spacing={0.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Mesa {table.number}
            </Typography>
            <Label variant="soft" color={sessions.length > 0 ? 'warning' : 'success'}>
              {sessions.length > 0
                ? `${sessions.length} ${sessions.length === 1 ? 'comanda' : 'comandas'}`
                : 'Livre'}
            </Label>
          </Stack>
          {activeSession?.customerName && (
            <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
              Comanda ativa: {activeSession.customerName}
              {activeSession.customerPhone ? ` · ${activeSession.customerPhone}` : ''}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={0.5} alignItems="center">
          {activeSession && sessionOrders.length > 0 && (
            <Tooltip title="Imprimir comanda / pré-conta">
              <IconButton color="primary" onClick={() => onPrintComanda(includeServiceFee)}>
                <Iconify icon="solar:printer-minimalistic-bold" width={22} />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={onClose}>
            <Iconify icon="mingcute:close-line" />
          </IconButton>
        </Stack>
      </Stack>

      <Divider sx={{ borderStyle: 'dashed' }} />

      <Scrollbar fillContent sx={{ flex: '1 1 auto' }}>
        <Stack spacing={2.5} sx={{ p: 2.5 }}>
          {/* 0. Seletor de Comandas Individuais na Mesa (ex.: João, Maria, etc.) */}
          <Stack spacing={1.25}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="overline" color="text.secondary">
                Comandas individuais da Mesa {table.number}
              </Typography>
              <Button
                size="small"
                variant="soft"
                color="primary"
                onClick={() => setAddingComanda((v) => !v)}
                startIcon={<Iconify icon="mingcute:add-line" width={16} />}
              >
                Nova Comanda
              </Button>
            </Stack>

            {sessions.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {sessions.map((sess, idx) => {
                  const isSelected = activeSession?.id === sess.id;
                  const labelName = sess.customerName || `Comanda #${idx + 1}`;
                  return (
                    <Chip
                      key={sess.id}
                      label={`${labelName} · ${fCurrency(sess.total)}`}
                      color={isSelected ? 'primary' : 'default'}
                      variant={isSelected ? 'filled' : 'outlined'}
                      onClick={() => {
                        onSelectSession(sess.id);
                        setShowCloseBox(false);
                      }}
                    />
                  );
                })}
              </Stack>
            )}

            {addingComanda && (
              <Stack
                spacing={1.25}
                sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.neutral' }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  Abrir nova comanda individual na Mesa {table.number}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Nome (ex.: João, Maria)"
                    value={newComandaName}
                    onChange={(e) => setNewComandaName(e.target.value)}
                    disabled={busy}
                  />
                  <TextField
                    size="small"
                    fullWidth
                    type="tel"
                    label="Telefone (opcional)"
                    placeholder="(11) 99999-9999"
                    value={newComandaPhone}
                    onChange={(e) => setNewComandaPhone(formatPhoneBr(e.target.value))}
                    disabled={busy}
                  />
                </Stack>
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => setAddingComanda(false)}
                    disabled={busy}
                  >
                    Cancelar
                  </Button>
                  <LoadingButton
                    size="small"
                    variant="contained"
                    loading={busy}
                    disabled={!newComandaName.trim()}
                    onClick={handleConfirmNewComanda}
                  >
                    Criar Comanda
                  </LoadingButton>
                </Stack>
              </Stack>
            )}
          </Stack>

          {/* 1. Resumo da Comanda Selecionada + Impressão + Encerramento */}
          {activeSession && (
            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                bgcolor: (theme) => varAlpha(theme.vars.palette.warning.mainChannel, 0.08),
                border: (theme) =>
                  `1px dashed ${varAlpha(theme.vars.palette.warning.mainChannel, 0.36)}`,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Pedidos · {activeSession.customerName || 'Comanda Principal'} ({sessionOrders.length})
                </Typography>
                <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 800 }}>
                  {fCurrency(currentSessionSubtotal)}
                </Typography>
              </Stack>

              <Stack spacing={0.75}>
                {sessionOrders.map((ord) => (
                  <Box
                    key={ord.id}
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: 'background.paper',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {ord.code} ·{' '}
                        {ord.requestedByType === 'waiter'
                          ? `Garçom: ${ord.waiterName || 'Equipe'}`
                          : 'Cliente (QR)'}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          {fCurrency(ord.total)}
                        </Typography>
                        <Tooltip title="Imprimir este pedido">
                          <IconButton size="small" onClick={() => onPrintSingleOrder(ord)}>
                            <Iconify icon="solar:printer-minimalistic-bold" width={15} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                    {ord.items.map((it, idx) => (
                      <Typography
                        key={`${it.productId}-${idx}`}
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {it.qty}x {it.productName}
                      </Typography>
                    ))}
                  </Box>
                ))}
              </Stack>

              {!showCloseBox ? (
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    color="success"
                    onClick={() => setShowCloseBox(true)}
                    startIcon={<Iconify icon="solar:check-circle-bold" />}
                  >
                    Encerrar {activeSession.customerName ? activeSession.customerName : 'Comanda'} (
                    {fCurrency(currentSessionSubtotal)})
                  </Button>
                </Stack>
              ) : (
                <Stack
                  spacing={1.5}
                  sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}
                >
                  <FormControlLabel
                    control={
                      <Switch
                        checked={includeServiceFee}
                        onChange={(e) => setIncludeServiceFee(e.target.checked)}
                      />
                    }
                    label={`Incluir taxa de serviço (10% · +${fCurrency(
                      Math.round(currentSessionSubtotal * 0.1 * 100) / 100
                    )})`}
                  />

                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Forma de pagamento"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as OnlinePayOnDeliveryMethod)}
                  >
                    <MenuItem value="pix">PIX</MenuItem>
                    <MenuItem value="credit_card">Cartão de Crédito</MenuItem>
                    <MenuItem value="debit_card">Cartão de Débito</MenuItem>
                    <MenuItem value="cash">Dinheiro</MenuItem>
                  </TextField>

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2">Total a cobrar:</Typography>
                    <Typography variant="h6" color="success.main" sx={{ fontWeight: 800 }}>
                      {fCurrency(finalCloseTotal)}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      color="inherit"
                      onClick={() => setShowCloseBox(false)}
                      disabled={busy}
                    >
                      Voltar
                    </Button>
                    <LoadingButton
                      fullWidth
                      variant="contained"
                      color="success"
                      loading={busy}
                      onClick={() => onCloseTable(paymentMethod, includeServiceFee)}
                    >
                      Fechar
                    </LoadingButton>
                  </Stack>
                </Stack>
              )}
            </Box>
          )}

          {/* 2. Lançar Novo Pedido (Garçom) */}
          <Stack spacing={1.5}>
            <Typography variant="overline" color="text.secondary">
              Lançar pedido em {activeSession?.customerName || `Mesa ${table.number}`} (vai direto
              para Em Preparo)
            </Typography>

            <TextField
              fullWidth
              size="small"
              placeholder={`Buscar entre ${activeFinishedProducts.length} produtos (nome, SKU, categoria)...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      edge="end"
                      onClick={() => {
                        setSearch('');
                        setDebouncedSearch('');
                      }}
                    >
                      <Iconify icon="mingcute:close-line" width={16} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />

            {!hasSearchQuery && categoryChips.length > 0 && (
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  label="Destaques"
                  color={selectedCategory === '__featured__' ? 'primary' : 'default'}
                  variant={selectedCategory === '__featured__' ? 'filled' : 'outlined'}
                  onClick={() => setSelectedCategory('__featured__')}
                />
                {categoryChips.map((cat) => (
                  <Chip
                    key={cat}
                    size="small"
                    label={cat}
                    color={selectedCategory === cat ? 'primary' : 'default'}
                    variant={selectedCategory === cat ? 'filled' : 'outlined'}
                    onClick={() => setSelectedCategory(cat)}
                  />
                ))}
              </Stack>
            )}

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                {productsLoading || isSearching
                  ? 'Buscando produtos...'
                  : hasSearchQuery
                    ? `${filteredProducts.length} resultado(s) para "${debouncedSearch}"`
                    : `Exibindo ${filteredProducts.length} de ${activeFinishedProducts.length} produtos — digite para buscar`}
              </Typography>
            </Stack>

            <Stack spacing={1}>
              {productsLoading || isSearching ? (
                [...Array(4)].map((_, idx) => (
                  <Stack
                    key={idx}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1.25}
                    sx={{
                      p: 1,
                      borderRadius: 1.25,
                      border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                    }}
                  >
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flex: 1 }}>
                      <Skeleton animation="wave" variant="rounded" width={42} height={42} />
                      <Box sx={{ flex: 1 }}>
                        <Skeleton animation="wave" variant="text" width="72%" height={20} />
                        <Skeleton animation="wave" variant="text" width="38%" height={16} />
                      </Box>
                    </Stack>
                    <Skeleton animation="wave" variant="rounded" width={58} height={30} />
                  </Stack>
                ))
              ) : filteredProducts.length === 0 ? (
                <Box
                  sx={{
                    py: 3,
                    px: 2,
                    textAlign: 'center',
                    borderRadius: 1.25,
                    bgcolor: 'background.neutral',
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Nenhum produto encontrado para &ldquo;{debouncedSearch}&rdquo;.
                  </Typography>
                </Box>
              ) : (
                filteredProducts.map((prod) => {
                  const pricing = getEffectiveProductPrice(prod);
                  const nameParts = getHighlightParts(prod.name, debouncedSearch);
                  return (
                    <Stack
                      key={prod.id}
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1.25}
                      sx={{
                        p: 1,
                        borderRadius: 1.25,
                        border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                      }}
                    >
                      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                        <Box sx={{ position: 'relative', flexShrink: 0 }}>
                          <Avatar
                            src={prod.imageUrl}
                            variant="rounded"
                            sx={{ width: 42, height: 42, bgcolor: 'background.neutral' }}
                          >
                            {prod.name.charAt(0)}
                          </Avatar>
                          <ProductImageBadges
                            compact
                            servingTemperature={prod.servingTemperature}
                          />
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2" noWrap>
                            {nameParts.map((part, pIdx) => (
                              <Box
                                key={pIdx}
                                component="span"
                                sx={
                                  part.highlight
                                    ? {
                                        color: 'primary.main',
                                        fontWeight: 800,
                                        bgcolor: (theme) =>
                                          varAlpha(theme.vars.palette.primary.mainChannel, 0.14),
                                        borderRadius: 0.5,
                                        px: 0.25,
                                      }
                                    : undefined
                                }
                              >
                                {part.text}
                              </Box>
                            ))}
                          </Typography>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Typography
                              variant="caption"
                              color="primary.main"
                              sx={{ fontWeight: 700 }}
                            >
                              {fCurrency(pricing.effectivePrice)}
                            </Typography>
                            {prod.category && (
                              <Typography variant="caption" color="text.disabled" noWrap>
                                · {prod.category}
                              </Typography>
                            )}
                          </Stack>
                        </Box>
                      </Stack>

                      <Button
                        size="small"
                        variant="soft"
                        color="primary"
                        onClick={() => handleAddProduct(prod)}
                        sx={{ flexShrink: 0 }}
                      >
                        + Add
                      </Button>
                    </Stack>
                  );
                })
              )}
            </Stack>
          </Stack>

          {/* 3. Itens selecionados para envio */}
          {draftItems.length > 0 && (
            <Stack spacing={1.25}>
              <Divider sx={{ borderStyle: 'dashed' }} />
              <Typography variant="subtitle2">Itens do novo pedido</Typography>
              {draftItems.map((item) => (
                <Stack
                  key={item.productId}
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ p: 1, borderRadius: 1, bgcolor: 'background.neutral' }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {item.productName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fCurrency(item.lineTotal)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <IconButton
                      size="small"
                      onClick={() => handleChangeDraftQty(item.productId, -1)}
                    >
                      <Iconify icon="eva:minus-fill" width={16} />
                    </IconButton>
                    <Typography variant="subtitle2" sx={{ px: 0.5 }}>
                      {item.qty}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => handleChangeDraftQty(item.productId, 1)}
                    >
                      <Iconify icon="eva:plus-fill" width={16} />
                    </IconButton>
                  </Stack>
                </Stack>
              ))}

              <TextField
                fullWidth
                size="small"
                multiline
                rows={2}
                label="Observações para a cozinha (opcional)"
                placeholder="Ex.: Sem cebola, bem gelado..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Stack>
          )}
        </Stack>
      </Scrollbar>

      {draftItems.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <LoadingButton
              fullWidth
              size="large"
              variant="contained"
              loading={busy}
              onClick={handleSendOrder}
              startIcon={<Iconify icon="solar:fire-bold-duotone" />}
            >
              Enviar para Cozinha · {fCurrency(draftTotal)}
            </LoadingButton>
          </Box>
        </>
      )}
    </Drawer>
  );
}

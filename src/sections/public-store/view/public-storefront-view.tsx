import type {
  PublicStorefront,
  PublicStorefrontProduct,
  OnlinePayOnDeliveryMethod,
} from 'src/api/firestore/online-orders';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CardContent from '@mui/material/CardContent';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import {
  placeOnlineOrderCf,
  getPublicStorefrontCf,
} from 'src/api/firestore/online-orders';

import { toast } from 'src/components/snackbar';

import { usePublicCart } from '../public-cart-context';

// ----------------------------------------------------------------------

const CLOSED_REASON_KEY: Record<string, string> = {
  plan: 'publicStore.closed.plan',
  disabled: 'publicStore.closed.disabled',
  outside_hours: 'publicStore.closed.outsideHours',
  no_open_cash: 'publicStore.closed.noOpenCash',
};

// ----------------------------------------------------------------------

export function PublicStorefrontView() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslate('common');
  const cart = usePublicCart();

  const [store, setStore] = useState<PublicStorefront | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState<OnlinePayOnDeliveryMethod>('pix');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await getPublicStorefrontCf(slug);
        if (!alive) return;
        setStore(data);
        if (data.paymentMethodsOnDelivery?.[0]) {
          setPaymentMethod(data.paymentMethodsOnDelivery[0]);
        }
        if (data.acceptPickup === false && data.acceptDelivery) {
          setDeliveryType('delivery');
        }
      } catch (error) {
        if (!alive) return;
        toast.error(getFirebaseErrorMessage(error, t('publicStore.loadError')));
        setStore(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, t]);

  const selected = store?.products.find((p) => p.id === selectedId) || null;

  const categories = useMemo(() => {
    const map = new Map<string, PublicStorefrontProduct[]>();
    (store?.products || []).forEach((p) => {
      const key = p.category || t('publicStore.uncategorized');
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    });
    return Array.from(map.entries());
  }, [store, t]);

  const deliveryFee =
    deliveryType === 'delivery' ? Number(store?.deliveryFee || 0) : 0;
  const total = Math.round((cart.subtotal + deliveryFee) * 100) / 100;

  const handleAdd = () => {
    if (!selected) return;
    cart.addLine(selected, qty, notes.trim() || undefined);
    setSelectedId(null);
    setQty(1);
    setNotes('');
  };

  const handlePlace = async () => {
    if (!store?.isOpen) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error(t('publicStore.customerRequired'));
      return;
    }
    if (deliveryType === 'delivery' && !customerAddress.trim()) {
      toast.error(t('publicStore.addressRequired'));
      return;
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
        customerAddress:
          deliveryType === 'delivery' ? customerAddress.trim() : undefined,
        deliveryType,
        paymentMethod,
      });
      cart.clear();
      setCheckoutOpen(false);
      navigate(paths.publicStore.order(slug, result.orderId), {
        state: { code: result.code, whatsapp: store.whatsapp },
      });
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, t('publicStore.placeError')));
      try {
        const refreshed = await getPublicStorefrontCf(slug);
        setStore(refreshed);
      } catch {
        // ignore refresh failure
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!store) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{t('publicStore.notFound')}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 12, maxWidth: 480, mx: 'auto' }}>
      <Box sx={{ p: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h5">{store.storeName}</Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <Chip
            size="small"
            color={store.isOpen ? 'success' : 'default'}
            label={store.isOpen ? t('publicStore.open') : t('publicStore.closedLabel')}
          />
          <Typography variant="caption" color="text.secondary">
            ~{store.estimatedMinutes} min
          </Typography>
        </Stack>
        {!store.isOpen && store.closedReason && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {t(CLOSED_REASON_KEY[store.closedReason] || 'publicStore.closedLabel')}
          </Alert>
        )}
      </Box>

      <Stack spacing={2} sx={{ p: 2 }}>
        {categories.map(([category, products]) => (
          <Box key={category}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {category}
            </Typography>
            <Stack spacing={1.5}>
              {products.map((product) => (
                <Card
                  key={product.id}
                  variant="outlined"
                  sx={{ cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedId(product.id);
                    setQty(1);
                    setNotes('');
                  }}
                >
                  <CardContent sx={{ display: 'flex', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    {product.imageUrl && (
                      <Box
                        component="img"
                        src={product.imageUrl}
                        alt={product.name}
                        sx={{ width: 72, height: 72, borderRadius: 1, objectFit: 'cover' }}
                      />
                    )}
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" noWrap>
                        {product.name}
                      </Typography>
                      {product.description && (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {product.description}
                        </Typography>
                      )}
                      <Typography variant="subtitle2" color="primary.main">
                        {fCurrency(product.salePrice)}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>

      {cart.itemCount > 0 && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            p: 2,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Button
            fullWidth
            size="large"
            variant="contained"
            disabled={!store.isOpen}
            onClick={() => setCheckoutOpen(true)}
          >
            {t('publicStore.cartCta', { count: cart.itemCount, total: fCurrency(cart.subtotal) })}
          </Button>
        </Box>
      )}

      <Dialog open={Boolean(selected)} onClose={() => setSelectedId(null)} fullWidth maxWidth="xs">
        <DialogTitle>{selected?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="h6">{fCurrency(selected?.salePrice || 0)}</Typography>
            <TextField
              type="number"
              label={t('publicStore.qty')}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              inputProps={{ min: 1 }}
            />
            <TextField
              label={t('publicStore.notes')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedId(null)}>{t('publicStore.cancel')}</Button>
          <Button variant="contained" onClick={handleAdd}>
            {t('publicStore.add')}
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer anchor="bottom" open={checkoutOpen} onClose={() => setCheckoutOpen(false)}>
        <Box sx={{ p: 2, maxWidth: 480, mx: 'auto', width: 1 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('publicStore.checkout')}
          </Typography>
          {!store.isOpen && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {t(CLOSED_REASON_KEY[store.closedReason || ''] || 'publicStore.closedLabel')}
            </Alert>
          )}
          <Stack spacing={2}>
            {cart.lines.map((line) => (
              <Stack key={line.productId} direction="row" justifyContent="space-between">
                <Typography variant="body2">
                  {line.qty}x {line.name}
                </Typography>
                <Typography variant="body2">{fCurrency(line.qty * line.unitPrice)}</Typography>
              </Stack>
            ))}
            <Divider />
            <TextField
              select
              label={t('publicStore.deliveryType')}
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value as 'pickup' | 'delivery')}
            >
              {store.acceptPickup && <MenuItem value="pickup">{t('publicStore.pickup')}</MenuItem>}
              {store.acceptDelivery && (
                <MenuItem value="delivery">{t('publicStore.delivery')}</MenuItem>
              )}
            </TextField>
            <TextField
              label={t('publicStore.customerName')}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <TextField
              label={t('publicStore.customerPhone')}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
            {deliveryType === 'delivery' && (
              <TextField
                label={t('publicStore.address')}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                multiline
                rows={2}
              />
            )}
            <TextField
              select
              label={t('publicStore.paymentMethod')}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as OnlinePayOnDeliveryMethod)}
            >
              {store.paymentMethodsOnDelivery.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
            {deliveryFee > 0 && (
              <Typography variant="body2">
                {t('publicStore.deliveryFee')}: {fCurrency(deliveryFee)}
              </Typography>
            )}
            <Typography variant="subtitle1">
              {t('publicStore.total')}: {fCurrency(total)}
            </Typography>
            <Button
              fullWidth
              size="large"
              variant="contained"
              disabled={!store.isOpen || submitting || cart.itemCount === 0}
              onClick={handlePlace}
            >
              {submitting ? <CircularProgress size={22} /> : t('publicStore.placeOrder')}
            </Button>
          </Stack>
        </Box>
      </Drawer>
    </Box>
  );
}

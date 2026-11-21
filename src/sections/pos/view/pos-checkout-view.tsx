import type { Batch } from 'src/api/firestore/batches';
import type { Product } from 'src/api/firestore/products';
import type { Customer } from 'src/api/firestore/customers';
import type { Enterprise } from 'src/api/firestore/platform';
import type { CashSession } from 'src/api/firestore/cash-sessions';
import type { SaleItem, SalePayment, DeliveryType, PaymentMethod } from 'src/api/firestore/sales';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Grid from '@mui/material/Unstable_Grid2';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import LoadingButton from '@mui/lab/LoadingButton';
import ListItemText from '@mui/material/ListItemText';
import InputAdornment from '@mui/material/InputAdornment';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fPercent, fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { getEffectiveProductPrice } from 'src/utils/product-pricing';

import { useTranslate } from 'src/locales';
import { createSale } from 'src/api/firestore/sales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listProducts } from 'src/api/firestore/products';
import { getEnterprise } from 'src/api/firestore/platform';
import { seedDemoErpCatalog } from 'src/api/firestore/seed-demo';
import { listCashSessions } from 'src/api/firestore/cash-sessions';
import { listAvailableBatchesFIFO } from 'src/api/firestore/batches';
import { listCustomers, formatCustomerFullAddress } from 'src/api/firestore/customers';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { CustomTabs } from 'src/components/custom-tabs';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { PaymentMethodIcon, PaymentBrandLogos } from 'src/components/payment-method-icon';

import { CustomerListDialog } from 'src/sections/customer/customer-list-dialog';
import { IncrementerButton } from 'src/sections/product/components/incrementer-button';
import { CustomerQuickNewDialog } from 'src/sections/customer/customer-quick-new-dialog';

import { useAuthContext } from 'src/auth/hooks';

import { ProductListDialog } from '../product-list-dialog';
import {
  pickFifoBatch,
  generateSaleCode,
  calculatePosTotals,
} from '../pos-calculator';
import {
  PAYMENT_METHOD_META,
  PaymentMethodListDialog,
} from '../payment-method-list-dialog';

// ----------------------------------------------------------------------

type CartRow = {
  key: string;
  productId: string;
  productName: string;
  productSku: string;
  imageUrl?: string;
  unit: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  batchId: string;
  lotCode: string;
};

export function PosCheckoutView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const { user } = useAuthContext();

  const customerPicker = useBoolean();
  const quickCustomerModal = useBoolean();
  const productCatalogModal = useBoolean();

  const [activePaymentIdx, setActivePaymentIdx] = useState<number | null>(null);

  const enterpriseId = user?.enterpriseId as string | undefined;
  const isAdmin = Boolean(user?.platformAdmin) || user?.role === 'admin';
  const canViewFinancialMargins = isAdmin;

  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [cart, setCart] = useState<CartRow[]>([]);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [discountInput, setDiscountInput] = useState<string>('');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [payments, setPayments] = useState<SalePayment[]>([{ method: 'pix', amount: 0 }]);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [openCashSession, setOpenCashSession] = useState<CashSession | null>(null);
  const [cashChecked, setCashChecked] = useState(false);

  const loadData = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      let [prods, availBatches, custs, ent, cashList] = await Promise.all([
        listProducts(enterpriseId),
        listAvailableBatchesFIFO(enterpriseId),
        listCustomers(enterpriseId),
        getEnterprise(enterpriseId),
        listCashSessions(enterpriseId),
      ]);

      if (prods.length === 0) {
        try {
          await seedDemoErpCatalog(enterpriseId);
          [prods, availBatches, custs, ent, cashList] = await Promise.all([
            listProducts(enterpriseId),
            listAvailableBatchesFIFO(enterpriseId),
            listCustomers(enterpriseId),
            getEnterprise(enterpriseId),
            listCashSessions(enterpriseId),
          ]);
        } catch (seedError) {
          // Operador PDV não tem write em products — seed é best-effort (admin/gestor).
          console.warn(seedError);
        }
      }

      setProducts(prods.filter((p) => p.active));
      setBatches(availBatches);
      setCustomers(custs.filter((c) => c.active));
      setEnterprise(ent);
      setOpenCashSession(cashList.find((s) => s.status === 'open') || null);
      setCashChecked(true);
      if (ent?.defaultDeliveryFee) {
        setDeliveryFee(Number(ent.defaultDeliveryFee));
      }
    } catch (error) {
      console.error(error);
      toast.error(
        getFirebaseErrorMessage(
          error,
          'Não foi possível carregar o catálogo do PDV (produtos/estoque)'
        )
      );
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.ean && p.ean.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.variant && p.variant.toLowerCase().includes(q))
    );
  }, [products, searchQuery]);

  const handleAddProduct = useCallback(
    (product: Product) => {
      const fifoBatch = pickFifoBatch(batches, product.id);
      const unitPrice = getEffectiveProductPrice(product).effectivePrice;
      const unitCost = fifoBatch
        ? fifoBatch.unitCost
        : typeof product.costPrice === 'number'
          ? product.costPrice
          : 0;

      setCart((prev) => {
        const existingIdx = prev.findIndex(
          (item) => item.productId === product.id && item.batchId === (fifoBatch?.id || '')
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            qty: updated[existingIdx].qty + 1,
          };
          return updated;
        }

        return [
          ...prev,
          {
            key: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            productId: product.id,
            productName: product.variant ? `${product.name} (${product.variant})` : product.name,
            productSku: product.sku,
            imageUrl: product.imageUrl,
            unit: product.unit,
            qty: 1,
            unitPrice,
            unitCost,
            batchId: fifoBatch?.id || '',
            lotCode: fifoBatch?.lotCode || '',
          },
        ];
      });
    },
    [batches]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredCatalog.length > 0) {
      e.preventDefault();
      handleAddProduct(filteredCatalog[0]);
      setSearchQuery('');
    }
  };

  const handleBatchChange = (rowKey: string, batchId: string) => {
    const chosenBatch = batches.find((b) => b.id === batchId);
    setCart((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row;
        const prod = products.find((p) => p.id === row.productId);
        return {
          ...row,
          batchId: chosenBatch?.id || '',
          lotCode: chosenBatch?.lotCode || '',
          unitCost: chosenBatch ? chosenBatch.unitCost : prod?.costPrice ?? row.unitCost,
        };
      })
    );
  };

  const handleQtyChange = (rowKey: string, nextQty: number) => {
    setCart((prev) =>
      prev.map((row) => (row.key === rowKey ? { ...row, qty: Math.max(1, nextQty) } : row))
    );
  };

  const handlePriceChange = (rowKey: string, unitPrice: number) => {
    setCart((prev) =>
      prev.map((row) => (row.key === rowKey ? { ...row, unitPrice: Math.max(0, unitPrice) } : row))
    );
  };

  const handleRemoveCartRow = (rowKey: string) => {
    setCart((prev) => prev.filter((row) => row.key !== rowKey));
  };

  const calculateMethodFee = useCallback(
    (method: PaymentMethod, amount: number, installments?: number) => {
      if (!enterprise || amount <= 0) return { feeRate: 0, feeAmount: 0 };
      let rate = 0;
      let fixed = 0;
      switch (method) {
        case 'credit_card': {
          const baseRate = Number(enterprise.creditCardFeeRate || 0);
          const extraRate =
            installments && installments > 1
              ? Number(enterprise.creditCardInstallmentFeeRate || 0) * (installments - 1)
              : 0;
          rate = baseRate + extraRate;
          break;
        }
        case 'debit_card':
          rate = Number(enterprise.debitCardFeeRate || 0);
          break;
        case 'pix':
          rate = Number(enterprise.pixFeeRate || 0);
          fixed = Number(enterprise.pixFeeFixed || 0);
          break;
        case 'credit_tab':
          rate = Number(enterprise.creditTabFeeRate || 0);
          break;
        case 'cash':
        default:
          rate = 0;
          fixed = 0;
          break;
      }
      const feeAmount = Math.round((amount * (rate / 100) + fixed) * 100) / 100;
      return { feeRate: rate, feeAmount };
    },
    [enterprise]
  );

  const enrichedPayments = useMemo(() => payments.map((p) => {
      const { feeRate, feeAmount } = calculateMethodFee(p.method, p.amount, p.installments);
      return {
        ...p,
        feeRate,
        feeAmount,
      };
    }), [payments, calculateMethodFee]);

  const totalPaymentFees = useMemo(
    () => enrichedPayments.reduce((acc, p) => acc + (p.feeAmount || 0), 0),
    [enrichedPayments]
  );

  const passFeesToCustomer = Boolean(enterprise?.passPaymentFeesToCustomer);
  const surchargeAmount = passFeesToCustomer ? totalPaymentFees : 0;
  const effectiveDeliveryFee = deliveryType === 'delivery' ? deliveryFee : 0;

  const summary = useMemo(
    () =>
      calculatePosTotals({
        items: cart.map((c) => ({
          productId: c.productId,
          qty: c.qty,
          unitPrice: c.unitPrice,
          unitCost: c.unitCost,
        })),
        discountAmount,
        deliveryFee: effectiveDeliveryFee,
        surchargeAmount,
        payments: enrichedPayments,
        role: user?.role,
      }),
    [cart, discountAmount, effectiveDeliveryFee, surchargeAmount, enrichedPayments, user?.role]
  );

  useEffect(() => {
    if (payments.length === 1) {
      if (payments[0].method !== 'cash') {
        if (payments[0].amount !== summary.total) {
          setPayments((prev) => [{ ...prev[0], amount: summary.total }]);
        }
      } else if (payments[0].amount === 0 && summary.total > 0) {
        setPayments((prev) => [{ ...prev[0], amount: summary.total }]);
      }
    }
  }, [payments, summary.total]);

  const handleApplyDiscount = () => {
    const val = Math.max(0, Number(discountInput) || 0);
    setDiscountAmount(val);
  };

  const handleCompleteSale = useCallback(async () => {
    if (!enterpriseId) {
      toast.error(t('pos.errorMissingEnterprise'));
      return;
    }
    if (!cart.length) {
      toast.error(t('pos.errorEmptyCart'));
      return;
    }
    if (!summary.discountAllowed) {
      toast.error(
        t('pos.errorDiscountLimit', {
          percent: summary.discountPercent,
          max: summary.maxAllowedDiscountPercent,
        })
      );
      return;
    }
    if (!summary.isPaymentComplete) {
      toast.error(t('pos.errorInsufficientPayment'));
      return;
    }
    if (summary.creditTabAmount > 0 && !selectedCustomer) {
      toast.error(
        t('pos.errorCreditTabRequiresCustomer', {
          defaultValue: 'Selecione ou cadastre um cliente para vender no Crediário / Fiado.',
        })
      );
      customerPicker.onTrue();
      return;
    }

    if (deliveryType === 'delivery') {
      if (!selectedCustomer) {
        toast.error('Para entrega / delivery, vincule ou cadastre um cliente com endereço.');
        customerPicker.onTrue();
        return;
      }
      const finalAddress = deliveryAddress.trim() || formatCustomerFullAddress(selectedCustomer);
      if (!finalAddress) {
        toast.error('Informe o endereço de entrega do cliente.');
        return;
      }
    }

    if (!openCashSession) {
      toast.error('Caixa fechado! Abra o caixa em Financeiro → Caixa antes de realizar vendas.');
      return;
    }

    setSubmitting(true);
    try {
      const saleItems: SaleItem[] = cart.map((c) => {
        const batch = batches.find((b) => b.id === c.batchId);
        return {
          productId: c.productId,
          productName: c.productName,
          productSku: c.productSku,
          unit: c.unit,
          qty: Number(c.qty),
          unitPrice: Number(c.unitPrice),
          unitCost: Number(c.unitCost),
          lineTotal: Math.round(c.qty * c.unitPrice * 100) / 100,
          batchId: c.batchId || undefined,
          lotCode: c.lotCode || undefined,
          batchCurrentRemaining: batch?.remainingQty,
        };
      });

      const saleId = await createSale(enterpriseId, {
        code: generateSaleCode(),
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        customerDocument: selectedCustomer?.document,
        customerPhone: selectedCustomer?.phone,
        customerEmail: selectedCustomer?.email,
        customerAddress: formatCustomerFullAddress(selectedCustomer) || undefined,
        customerCurrentDebt: selectedCustomer?.currentDebt,
        creditTabAmount: summary.creditTabAmount,
        sellerUid: user?.id,
        sellerEmail: user?.email,
        items: saleItems,
        subtotal: summary.subtotal,
        discountAmount: summary.discountAmount,
        discountPercent: summary.discountPercent,
        total: summary.total,
        totalCost: summary.totalCost,
        grossProfit: summary.grossProfit,
        payments: enrichedPayments.filter((p) => p.amount > 0),
        paidAmount: summary.paidAmount,
        changeAmount: summary.changeAmount,
        deliveryType,
        deliveryAddress:
          deliveryType === 'delivery'
            ? deliveryAddress.trim() || formatCustomerFullAddress(selectedCustomer) || undefined
            : undefined,
        deliveryFee: effectiveDeliveryFee,
        paymentFeeAmount: totalPaymentFees,
        feesPassedToCustomer: passFeesToCustomer,
        surchargeAmount,
        channel: 'pos',
        cashSessionId: openCashSession.id,
        notes: notes.trim() || undefined,
      });

      toast.success(t('pos.createSuccess'));
      router.push(paths.dashboard.pos.saleDetails(saleId));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('pos.createError')));
    } finally {
      setSubmitting(false);
    }
  }, [
    batches,
    cart,
    customerPicker,
    deliveryAddress,
    deliveryType,
    effectiveDeliveryFee,
    enterpriseId,
    enrichedPayments,
    notes,
    openCashSession,
    passFeesToCustomer,
    router,
    selectedCustomer,
    summary,
    surchargeAmount,
    t,
    totalPaymentFees,
    user?.email,
    user?.id,
  ]);

  // Totals block matching OrderDetailsItems
  const renderOrderTotals = (
    <Stack
      spacing={2}
      alignItems="flex-end"
      sx={{ p: 3, textAlign: 'right', typography: 'body2' }}
    >
      <Stack direction="row">
        <Box sx={{ color: 'text.secondary' }}>{t('pos.fields.subtotal')}</Box>
        <Box sx={{ width: 160, typography: 'subtitle2' }}>{fCurrency(summary.subtotal)}</Box>
      </Stack>

      <Stack direction="row">
        <Box sx={{ color: 'text.secondary' }}>{t('pos.fields.discountAmount')}</Box>
        <Box sx={{ width: 160, ...(summary.discountAmount > 0 && { color: 'error.main' }) }}>
          {summary.discountAmount > 0
            ? `- ${fCurrency(summary.discountAmount)} (${fPercent(summary.discountPercent)})`
            : '—'}
        </Box>
      </Stack>

      {deliveryType === 'delivery' && deliveryFee > 0 && (
        <Stack direction="row">
          <Box sx={{ color: 'text.secondary' }}>Taxa de entrega</Box>
          <Box sx={{ width: 160 }}>+ {fCurrency(deliveryFee)}</Box>
        </Stack>
      )}

      {surchargeAmount > 0 && (
        <Stack direction="row">
          <Box sx={{ color: 'text.secondary' }}>Acréscimo (Taxa de pagamento)</Box>
          <Box sx={{ width: 160, color: 'warning.main' }}>+ {fCurrency(surchargeAmount)}</Box>
        </Stack>
      )}

      {!passFeesToCustomer && totalPaymentFees > 0 && (
        <Stack direction="row">
          <Box sx={{ color: 'text.disabled', typography: 'caption' }}>
            Taxa maquininha (despesa da loja DRE)
          </Box>
          <Box sx={{ width: 160, color: 'text.disabled', typography: 'caption' }}>
            - {fCurrency(totalPaymentFees)}
          </Box>
        </Stack>
      )}

      {canViewFinancialMargins && (
        <>
          <Stack direction="row">
            <Box sx={{ color: 'text.secondary' }}>{t('pos.fields.totalCost')}</Box>
            <Box sx={{ width: 160 }}>{fCurrency(summary.totalCost)}</Box>
          </Stack>

          <Stack direction="row">
            <Box sx={{ color: 'text.secondary' }}>{t('pos.fields.grossProfit')}</Box>
            <Box sx={{ width: 160, color: 'success.main', typography: 'subtitle2' }}>
              {fCurrency(summary.grossProfit)}
            </Box>
          </Stack>
        </>
      )}

      <Stack direction="row" sx={{ typography: 'h4' }}>
        <div>{t('pos.fields.total')}</div>
        <Box sx={{ width: 160, color: 'primary.main', typography: 'h4' }}>
          {fCurrency(summary.total)}
        </Box>
      </Stack>
    </Stack>
  );

  return (
    <>
      <DashboardContent maxWidth="xl">
        <CustomBreadcrumbs
          heading={t('pos.checkoutHeading')}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('nav.pos'), href: paths.dashboard.pos.root },
            { name: t('pos.checkoutHeading') },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                component={RouterLink}
                href={paths.dashboard.cash.root}
                variant="soft"
                color="info"
                startIcon={<Iconify icon="solar:wad-of-money-bold" />}
              >
                {t('nav.cash', { defaultValue: 'Fechar Caixa' })}
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.pos.sales}
                variant="outlined"
                startIcon={<Iconify icon="solar:history-bold" />}
              >
                {t('pos.viewSales')}
              </Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {cashChecked && !openCashSession && (
          <Alert
            severity="warning"
            sx={{ mb: 3 }}
            action={
              <Button
                component={RouterLink}
                href={paths.dashboard.cash.root}
                color="inherit"
                size="small"
                variant="outlined"
              >
                Abrir Caixa
              </Button>
            }
          >
            <strong>Caixa fechado!</strong> Abra uma sessão de caixa em{' '}
            <strong>Financeiro → Caixa</strong> antes de realizar qualquer venda no PDV.
          </Alert>
        )}

        {!enterpriseId && (
          <EmptyContent filled title={t('pos.errorMissingEnterprise')} sx={{ py: 10 }} />
        )}

        {enterpriseId && (
          <Grid container spacing={3}>
            {/* Left column (md=8): Barcode Search + Cart with IncrementerButton (- 1 +) */}
            <Grid xs={12} md={8}>
              <Stack spacing={3}>
                <Card sx={{ p: 2.5 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <TextField
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Bipar EAN-13, código SKU ou pesquisar nome do produto e teclar Enter..."
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Iconify icon="solar:qr-code-bold" sx={{ color: 'text.disabled' }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <Button
                      variant="soft"
                      color="primary"
                      onClick={productCatalogModal.onTrue}
                      startIcon={<Iconify icon="solar:box-minimalistic-bold" />}
                      sx={{ flexShrink: 0 }}
                    >
                      Catálogo ({products.length})
                    </Button>
                    {/* <Button
                      variant="contained"
                      disabled={!filteredCatalog.length}
                      onClick={() => {
                        if (filteredCatalog[0]) {
                          handleAddProduct(filteredCatalog[0]);
                          setSearchQuery('');
                        }
                      }}
                      startIcon={<Iconify icon="mingcute:add-line" />}
                      sx={{ flexShrink: 0 }}
                    >
                      {t('pos.addFirstMatch')}
                    </Button> */}
                  </Stack>
                </Card>

                {/* Cart Card following CheckoutCartProduct + OrderDetailsItems */}
                <Card>
                  <CardHeader
                    title={t('pos.cartTitle')}
                    subheader={t('pos.cartSubheader')}
                    action={
                      cart.length > 0 ? (
                        <Button
                          size="small"
                          color="error"
                          startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
                          onClick={() => {
                            setCart([]);
                            setDiscountAmount(0);
                            setDiscountInput('');
                          }}
                        >
                          {t('pos.clearCart')}
                        </Button>
                      ) : undefined
                    }
                    sx={{ mb: 3 }}
                  />

                  <Divider />

                  {!cart.length ? (
                    <EmptyContent title={t('pos.emptyCart')} sx={{ py: 8 }} />
                  ) : (
                    <Scrollbar>
                      {cart.map((row) => {
                        const productBatches = batches.filter(
                          (b) => b.productId === row.productId
                        );
                        const selectedBatch = batches.find((b) => b.id === row.batchId);
                        const availableQty = selectedBatch?.remainingQty;

                        return (
                          <Stack
                            key={row.key}
                            direction="row"
                            alignItems="flex-start"
                            spacing={2}
                            sx={{
                              p: 3,
                              minWidth: 480,
                              borderBottom: (theme) =>
                                `dashed 2px ${theme.vars.palette.background.neutral}`,
                            }}
                          >
                            <Avatar
                              src={row.imageUrl}
                              variant="rounded"
                              sx={{
                                width: 48,
                                height: 48,
                                mt: 0.5,
                                bgcolor: 'background.neutral',
                                color: 'text.secondary',
                              }}
                            >
                              <Iconify icon="solar:box-minimalistic-bold" width={24} />
                            </Avatar>

                            <ListItemText
                              primary={row.productName}
                              secondary={`${row.productSku} • ${row.unit}`}
                              primaryTypographyProps={{ typography: 'body2', fontWeight: 600 }}
                              secondaryTypographyProps={{
                                component: 'span',
                                color: 'text.disabled',
                                mt: 0.5,
                              }}
                              sx={{ flex: 1, minWidth: 160, mt: 0.5 }}
                            />

                            <TextField
                              select
                              size="small"
                              label={t('pos.fields.batch')}
                              value={row.batchId}
                              onChange={(e) => handleBatchChange(row.key, e.target.value)}
                              sx={{ display: 'none', width: 185 }}
                            >
                              <MenuItem value="">{t('pos.noBatchAvailable')}</MenuItem>
                              {productBatches.map((b) => (
                                <MenuItem key={b.id} value={b.id}>
                                  {b.lotCode} ({b.remainingQty} {b.unit})
                                </MenuItem>
                              ))}
                            </TextField>

                            {/* IncrementerButton (- 1 +) sized medium (56px) matching unitPrice with helperText */}
                            <IncrementerButton
                              size="medium"
                              quantity={row.qty}
                              onDecrease={() => handleQtyChange(row.key, row.qty - 1)}
                              onIncrease={() => handleQtyChange(row.key, row.qty + 1)}
                              onDelete={() => handleRemoveCartRow(row.key)}
                              disabledIncrease={
                                typeof availableQty === 'number' && row.qty >= availableQty
                              }
                              helperText={
                                typeof availableQty === 'number'
                                  ? `disp.: ${availableQty} ${row.unit}`
                                  : ' '
                              }
                            />

                            <TextField
                              type="number"
                              label={t('pos.fields.unitPrice')}
                              value={row.unitPrice}
                              onChange={(e) =>
                                handlePriceChange(row.key, Number(e.target.value))
                              }
                              helperText={row.unit ? `por ${row.unit}` : ' '}
                              InputLabelProps={{ shrink: true }}
                              inputProps={{ min: 0, step: 'any' }}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">
                                    <Box component="span" sx={{ color: 'text.disabled' }}>
                                      R$
                                    </Box>
                                  </InputAdornment>
                                ),
                              }}
                              sx={{ width: 120 }}
                            />

                            <Box
                              sx={{
                                width: 100,
                                textAlign: 'right',
                                typography: 'subtitle2',
                                pt: 2,
                              }}
                            >
                              {fCurrency(row.qty * row.unitPrice)}
                            </Box>
                          </Stack>
                        );
                      })}
                    </Scrollbar>
                  )}

                  {renderOrderTotals}
                </Card>
              </Stack>
            </Grid>

            {/* Right column (md=4): Customer + Discount (CheckoutSummary style) + Payment */}
            <Grid xs={12} md={4}>
              <Card>
                {/* Section 1: Customer Info */}
                <CardHeader
                  title={t('customers.customerInfo', { defaultValue: 'Cliente' })}
                  action={
                    <Stack direction="row" spacing={0.5}>
                      {selectedCustomer && (
                        <IconButton
                          color="error"
                          title="Desvincular cliente"
                          onClick={() => setSelectedCustomer(null)}
                        >
                          <Iconify icon="mingcute:close-line" />
                        </IconButton>
                      )}
                      <IconButton
                        color="primary"
                        onClick={customerPicker.onTrue}
                        title="Selecionar ou cadastrar cliente"
                      >
                        <Iconify
                          icon={selectedCustomer ? 'solar:pen-bold' : 'mingcute:add-line'}
                        />
                      </IconButton>
                    </Stack>
                  }
                />

                <Stack direction="row" sx={{ p: 3 }}>
                  <Avatar
                    alt={selectedCustomer?.name || 'Consumidor'}
                    sx={{ width: 48, height: 48, mr: 2 }}
                  >
                    {(selectedCustomer?.name || 'C').charAt(0).toUpperCase()}
                  </Avatar>

                  <Stack spacing={0.5} alignItems="flex-start" sx={{ typography: 'body2' }}>
                    <Typography variant="subtitle2">
                      {selectedCustomer?.name || 'Consumidor Final (Não identificado)'}
                    </Typography>

                    {selectedCustomer ? (
                      <>
                        {selectedCustomer.document && (
                          <Box sx={{ color: 'text.secondary' }}>
                            CPF/CNPJ: {selectedCustomer.document}
                          </Box>
                        )}
                        {selectedCustomer.phone && (
                          <Box sx={{ color: 'text.secondary' }}>
                            Tel: {selectedCustomer.phone}
                          </Box>
                        )}
                        {selectedCustomer.email && (
                          <Box sx={{ color: 'text.secondary' }}>{selectedCustomer.email}</Box>
                        )}
                        {formatCustomerFullAddress(selectedCustomer) && (
                          <Box sx={{ color: 'text.disabled', typography: 'caption' }}>
                            {formatCustomerFullAddress(selectedCustomer)}
                          </Box>
                        )}
                        {selectedCustomer.currentDebt > 0 && (
                          <Label color="error" variant="soft" sx={{ mt: 0.5 }}>
                            Débito anterior: {fCurrency(selectedCustomer.currentDebt)}
                          </Label>
                        )}
                      </>
                    ) : (
                      <Button
                        size="small"
                        color="primary"
                        startIcon={<Iconify icon="mingcute:add-line" />}
                        onClick={customerPicker.onTrue}
                        sx={{ mt: 0.5 }}
                      >
                        {t('customers.selectOrCreate', {
                          defaultValue: 'Vincular ou cadastrar cliente',
                        })}
                      </Button>
                    )}
                  </Stack>
                </Stack>

                <Divider sx={{ borderStyle: 'dashed' }} />

                <CardHeader
                  title={t('customers.delivery', { defaultValue: 'Entrega' })}
                />
                {/* Section 2: Delivery, Payment (Billing style) & Discount (below Paid) */}
                <Stack spacing={2.5} sx={{ p: 3}}>
                  {/* Delivery / Pickup Selector with animated smooth indicator (Banking Overview / CustomTabs style) */}
                  <Stack spacing={1.5}>
                    <CustomTabs
                      value={deliveryType}
                      onChange={(_, val) => {
                        if (!val) return;
                        if (val === 'delivery' && !selectedCustomer) {
                          toast.info('Para entrega / delivery, vincule ou cadastre um cliente com endereço.');
                          customerPicker.onTrue();
                        }
                        setDeliveryType(val);
                        if (val === 'delivery') {
                          if (deliveryFee === 0 && enterprise?.defaultDeliveryFee) {
                            setDeliveryFee(Number(enterprise.defaultDeliveryFee));
                          }
                          if (!deliveryAddress && selectedCustomer) {
                            setDeliveryAddress(formatCustomerFullAddress(selectedCustomer) || '');
                          }
                        }
                      }}
                      variant="fullWidth"
                      sx={{
                        borderRadius: 1.5,
                        bgcolor: 'background.neutral',
                        height: 58,
                        minHeight: 58,
                        mb: deliveryType === 'delivery' ? 1 : 0
                      }}
                      slotProps={{
                        indicator: {
                          borderRadius: 1,
                          boxShadow: (theme) => theme.customShadows.z4,
                        },
                        tab: {
                          minHeight: 48,
                          py: 1,
                          typography: 'subtitle2',
                        },
                      }}
                    >
                      <Tab
                        value="pickup"
                        label="Retirada"
                        icon={<Iconify icon="solar:shop-bold" width={18} />}
                        iconPosition="start"
                      />
                      <Tab
                        value="delivery"
                        label="Delivery"
                        icon={<Iconify icon="solar:delivery-bold" width={18} />}
                        iconPosition="start"
                      />
                    </CustomTabs>

                    {deliveryType === 'delivery' && (
                      <Stack spacing={2}>
                        {selectedCustomer && !formatCustomerFullAddress(selectedCustomer) && (
                          <Alert severity="warning" sx={{ typography: 'caption', py: 0.5 }}>
                            O cliente selecionado não possui endereço completo no cadastro. Preencha o endereço abaixo.
                          </Alert>
                        )}

                        <TextField
                          fullWidth
                          type="number"
                          label="Taxa de entrega (R$)"
                          placeholder="0.00"
                          value={deliveryFee || ''}
                          onChange={(e) => setDeliveryFee(Math.max(0, Number(e.target.value)))}
                          InputLabelProps={{ shrink: true }}
                          inputProps={{ min: 0, step: 'any' }}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <Box component="span" sx={{ color: 'text.disabled' }}>
                                  R$
                                </Box>
                              </InputAdornment>
                            ),
                          }}
                        />

                        <TextField
                          fullWidth
                          label="Endereço de entrega"
                          placeholder="Rua, número, complemento, bairro, cidade..."
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          helperText={
                            selectedCustomer && formatCustomerFullAddress(selectedCustomer)
                              ? 'Endereço cadastrado do cliente'
                              : 'Informe o endereço completo para envio'
                          }
                        />
                      </Stack>
                    )}
                  </Stack>
                </Stack>
                <Divider sx={{ borderStyle: 'dashed' }} />
                <CardHeader
                  title={t('customers.payment_methods', { defaultValue: 'Formas de pagamento' })}
                />
                <Stack spacing={2.5} sx={{ p: 3 }}>
                  {/* Payment Methods (Account Billing reference style) */}
                  {payments.map((payment, idx) => {
                    const meta = PAYMENT_METHOD_META[payment.method] || PAYMENT_METHOD_META.cash;
                    const methodLabel = t(`pos.paymentMethods.${payment.method}`, {
                      defaultValue: meta.defaultLabel,
                    });
                    const supportsInstallments =
                      payment.method === 'credit_card' || payment.method === 'credit_tab';
                    const currentInstallments = payment.installments || 1;
                    const baseInstallmentAmount =
                      payment.amount > 0 ? payment.amount : summary.total;

                    return (
                      <Stack key={idx} spacing={1.5}>
                        {/* Billing-style row: Label + clickable ButtonBase (matching dashboard/user/account/billing) */}
                        <Grid container spacing={{ xs: 0.5, md: 2 }} alignItems="center">
                          <Grid xs={12} md={4} sx={{ color: 'text.secondary', typography: 'body2' }}>
                            {payments.length > 1 ? `Pagamento ${idx + 1}` : 'Pagar com'}
                          </Grid>
                          <Grid xs={12} md={8}>
                            <Stack
                              direction="row"
                              alignItems="center"
                              justifyContent="space-between"
                              spacing={0.5}
                            >
                              <ButtonBase
                                onClick={() => setActivePaymentIdx(idx)}
                                sx={{
                                  typography: 'subtitle2',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  py: 0.5,
                                  px: 0.75,
                                  borderRadius: 0.75,
                                  color: 'text.primary',
                                  '&:hover': {
                                    color: 'text.secondary',
                                    bgcolor: 'action.hover',
                                  },
                                }}
                              >
                                <PaymentMethodIcon method={payment.method} size={22} />
                                {methodLabel}
                                <PaymentBrandLogos method={payment.method} size={18} />
                                <Iconify
                                  icon="eva:arrow-ios-downward-fill"
                                  width={16}
                                  sx={{ color: 'text.disabled', ml: 0.25 }}
                                />
                              </ButtonBase>

                              {payments.length > 1 && (
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => setPayments(payments.filter((_, i) => i !== idx))}
                                >
                                  <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                                </IconButton>
                              )}
                            </Stack>
                          </Grid>
                        </Grid>

                        {/* Installments (1x to 12x) with minInstallmentAmount rule */}
                        {supportsInstallments && (() => {
                          const minInstallment = enterprise?.minInstallmentAmount ?? 15;
                          const availableInstallments = Array.from({ length: 12 }, (_, i) => i + 1).filter(
                            (n) => n === 1 || baseInstallmentAmount / n >= minInstallment
                          );
                          const safeInstallments = availableInstallments.includes(currentInstallments)
                            ? currentInstallments
                            : 1;

                          return (
                            <Grid container spacing={{ xs: 0.5, md: 2 }} alignItems="center">
                              <Grid xs={12} md={4} sx={{ color: 'text.secondary', typography: 'body2' }}>
                                Parcelas
                              </Grid>
                              <Grid xs={12} md={8}>
                                <TextField
                                  select
                                  fullWidth
                                  size="small"
                                  value={safeInstallments}
                                  onChange={(e) => {
                                    const next = [...payments];
                                    next[idx] = {
                                      ...next[idx],
                                      installments: Number(e.target.value),
                                    };
                                    setPayments(next);
                                  }}
                                >
                                  {availableInstallments.map((n) => {
                                    const perInstallment = baseInstallmentAmount / n;
                                    return (
                                      <MenuItem key={n} value={n}>
                                        {n}x de {fCurrency(perInstallment)}
                                        {n === 1 ? ' (À vista)' : ''}
                                      </MenuItem>
                                    );
                                  })}
                                </TextField>
                              </Grid>
                            </Grid>
                          );
                        })()}

                        {/* Paid / Received Amount: only when cash, or for non-cash split payments if multiple payments */}
                        {payment.method === 'cash' && (
                          <TextField
                            fullWidth
                            type="number"
                            label={t('pos.fields.paymentAmount', { defaultValue: 'Valor recebido (R$)' })}
                            placeholder="0.00"
                            value={payment.amount || ''}
                            onChange={(e) => {
                              const next = [...payments];
                              next[idx] = {
                                ...next[idx],
                                amount: Math.max(0, Number(e.target.value)),
                              };
                              setPayments(next);
                            }}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ min: 0, step: 'any' }}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <Box component="span" sx={{ color: 'text.disabled' }}>
                                    R$
                                  </Box>
                                </InputAdornment>
                              ),
                            }}
                          />
                        )}

                        {payments.length > 1 && payment.method !== 'cash' && (
                          <TextField
                            fullWidth
                            type="number"
                            label="Valor deste pagamento (R$)"
                            placeholder="0.00"
                            value={payment.amount || ''}
                            onChange={(e) => {
                              const next = [...payments];
                              next[idx] = {
                                ...next[idx],
                                amount: Math.max(0, Number(e.target.value)),
                              };
                              setPayments(next);
                            }}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ min: 0, step: 'any' }}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <Box component="span" sx={{ color: 'text.disabled' }}>
                                    R$
                                  </Box>
                                </InputAdornment>
                              ),
                            }}
                          />
                        )}
                      </Stack>
                    );
                  })}

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      color="primary"
                      startIcon={<Iconify icon="mingcute:add-line" />}
                      onClick={() =>
                        setPayments([
                          ...payments,
                          { method: 'cash', amount: summary.remainingToPay },
                        ])
                      }
                    >
                      {t('pos.addPayment')}
                    </Button>
                  </Box>

                  {/* Discount input positioned BELOW Received Amount */}
                  <TextField
                    fullWidth
                    type="number"
                    label="Desconto (R$)"
                    placeholder="0.00"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyDiscount();
                      }
                    }}
                    InputLabelProps={{ shrink: true }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Box component="span" sx={{ color: 'text.disabled' }}>
                            R$
                          </Box>
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <Button
                            color="primary"
                            onClick={handleApplyDiscount}
                            sx={{ mr: -0.5 }}
                          >
                            Aplicar
                          </Button>
                        </InputAdornment>
                      ),
                    }}
                  />

                  {!summary.discountAllowed && (
                    <Alert severity="error">
                      {t('pos.errorDiscountLimit', {
                        percent: summary.discountPercent,
                        max: summary.maxAllowedDiscountPercent,
                      })}
                    </Alert>
                  )}

                  <Divider sx={{ borderStyle: 'dashed' }} />

                  <Stack spacing={1} sx={{ typography: 'h6' }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        {t('pos.fields.paidAmount')}
                      </Box>
                      <Typography variant="h4">{fCurrency(summary.paidAmount)}</Typography>
                    </Stack>

                    {summary.remainingToPay > 0 && (
                      <Stack direction="row" justifyContent="space-between">
                        <Box component="span" sx={{ color: 'error.main' }}>
                          {t('pos.fields.remainingToPay')}
                        </Box>
                        <Typography variant="h6" color="error.main">
                          {fCurrency(summary.remainingToPay)}
                        </Typography>
                      </Stack>
                    )}

                    <Stack direction="row" justifyContent="space-between">
                      <Box component="span" sx={{ color: 'success.main' }}>
                        {t('pos.fields.changeAmount')}
                      </Box>
                      <Typography variant="h4" color="success.main">
                        {fCurrency(summary.changeAmount)}
                      </Typography>
                    </Stack>
                  </Stack>

                  <TextField
                    fullWidth
                    label={t('pos.fields.notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    multiline
                    rows={2}
                  />

                  <LoadingButton
                    fullWidth
                    size="large"
                    variant="contained"
                    color="primary"
                    loading={submitting}
                    disabled={
                      !cart.length || !summary.discountAllowed || !summary.isPaymentComplete
                    }
                    onClick={handleCompleteSale}
                  >
                    {t('pos.finalizeSubmit')}
                  </LoadingButton>
                </Stack>
              </Card>
            </Grid>
          </Grid>
        )}
      </DashboardContent>

      {/* Customer Search & Selection Modal */}
      <CustomerListDialog
        title={t('nav.customers', { defaultValue: 'Clientes' })}
        open={customerPicker.value}
        onClose={customerPicker.onFalse}
        selected={(id) => selectedCustomer?.id === id}
        onSelect={(cust) => setSelectedCustomer(cust)}
        list={customers}
        action={
          <Button
            size="small"
            variant="soft"
            color="primary"
            startIcon={<Iconify icon="mingcute:add-line" />}
            onClick={() => {
              customerPicker.onFalse();
              quickCustomerModal.onTrue();
            }}
            sx={{ alignSelf: 'flex-end' }}
          >
            {t('customers.newCustomer', { defaultValue: 'Novo cliente' })}
          </Button>
        }
      />

      {/* Quick Customer Create Modal */}
      <CustomerQuickNewDialog
        open={quickCustomerModal.value}
        onClose={quickCustomerModal.onFalse}
        onCreated={(created) => {
          setCustomers((prev) => [...prev, created]);
          setSelectedCustomer(created);
        }}
      />

      {/* Product Catalog Modal */}
      <ProductListDialog
        open={productCatalogModal.value}
        onClose={productCatalogModal.onFalse}
        products={products}
        batches={batches}
        onSelectProduct={(prod) => {
          handleAddProduct(prod);
          toast.success(`${prod.name} adicionado ao carrinho`);
        }}
      />

      {/* Payment Method Selection Modal */}
      <PaymentMethodListDialog
        open={activePaymentIdx !== null}
        onClose={() => setActivePaymentIdx(null)}
        selected={
          activePaymentIdx !== null && payments[activePaymentIdx]
            ? payments[activePaymentIdx].method
            : 'pix'
        }
        onSelect={(method) => {
          if (activePaymentIdx === null) return;
          const next = [...payments];
          const supportsInstallments = method === 'credit_card' || method === 'credit_tab';
          next[activePaymentIdx] = {
            ...next[activePaymentIdx],
            method,
            amount:
              payments.length === 1
                ? summary.total
                : (next[activePaymentIdx].amount || summary.total),
            installments: supportsInstallments
              ? next[activePaymentIdx].installments || 1
              : undefined,
          };
          setPayments(next);
        }}
      />
    </>
  );
}

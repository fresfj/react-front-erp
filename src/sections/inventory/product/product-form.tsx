import type { Supplier } from 'src/api/firestore/suppliers';
import type {
  Product,
  ProductType,
  ProductComboItem,
  ProductServingTemp,
  ProductDiscountType,
} from 'src/api/firestore/products';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import ToggleButton from '@mui/material/ToggleButton';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { getEffectiveProductPrice } from 'src/utils/product-pricing';

import { useTranslate } from 'src/locales';
import { listSuppliers } from 'src/api/firestore/suppliers';
import { uploadProductImage } from 'src/api/firestore/storage';
import {
  listProducts,
  createProduct,
  updateProduct,
  deactivateProduct,
} from 'src/api/firestore/products';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';
import { ConfirmDialog } from 'src/components/custom-dialog';

import { SupplierListDialog } from 'src/sections/supplier/supplier-list-dialog';
import { SupplierQuickNewDialog } from 'src/sections/supplier/supplier-quick-new-dialog';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const PRODUCT_CATEGORIES = [
  'Açaí Processado',
  'Potes & Copos Prontos',
  'Polpas & Frutas',
  'Complementos & Granolas',
  'Matéria-Prima (Insumo)',
  'Embalagens & Descartáveis',
  'Outros',
];

const VARIATION_TAG_SUGGESTIONS = [
  'Fino (Pop)',
  'Médio (12%)',
  'Grosso (14%)',
  '300ml',
  '500ml',
  '1 Litro',
  '5 Litros',
  '10 Litros',
  'Zero Açúcar',
  'Com Guaraná',
];

const optionalNumber = zod.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : value;
}, zod.number().nonnegative().optional());

export const ProductSchema = zod.object({
  name: zod.string().min(1, { message: 'Required' }),
  sku: zod.string().min(1, { message: 'Required' }),
  ean: zod.string().optional().or(zod.literal('')),
  type: zod.enum(['raw', 'finished'], { required_error: 'Required' }),
  category: zod.string().optional().or(zod.literal('')),
  description: zod.string().optional().or(zod.literal('')),
  unit: zod.string().min(1, { message: 'Required' }),
  costPrice: optionalNumber,
  salePrice: optionalNumber,
  promoActive: zod.boolean(),
  discountType: zod.enum(['percent', 'fixed']),
  discountValue: optionalNumber,
  servingTemperature: zod.enum(['none', 'cold', 'hot']),
  isCombo: zod.boolean(),
  servesCount: optionalNumber,
  featured: zod.boolean(),
  minStock: optionalNumber,
  expirationDate: zod.string().optional().or(zod.literal('')),
  supplierId: zod.string().optional().or(zod.literal('')),
  variant: zod.string().optional().or(zod.literal('')),
  tags: zod.array(zod.string()).optional(),
  taxPercent: optionalNumber,
  ncm: zod.string().optional().or(zod.literal('')),
  origin: zod.coerce.number().int().min(0).max(8).optional(),
  cfopSaleDefault: zod.string().optional().or(zod.literal('')),
  cstOrCsosn: zod.string().optional().or(zod.literal('')),
  commercialUnit: zod.string().optional().or(zod.literal('')),
  cest: zod.string().optional().or(zod.literal('')),
  taxBenefitCode: zod.string().optional().or(zod.literal('')),
  cbsRate: optionalNumber,
  ibsRate: optionalNumber,
  cClassTrib: zod.string().optional().or(zod.literal('')),
  taxClassificationNotes: zod.string().optional().or(zod.literal('')),
  imageUrl: zod.any().optional(),
  showOnline: zod.boolean(),
  active: zod.boolean(),
});

export type ProductSchemaType = zod.infer<typeof ProductSchema>;

type Props = {
  currentProduct?: Product;
};

// ----------------------------------------------------------------------

export function ProductForm({ currentProduct }: Props) {
  const router = useRouter();
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const confirmDeactivate = useBoolean();
  const openDetails = useBoolean(true);
  const openCatalogExtras = useBoolean(true);
  const openProperties = useBoolean(true);
  const openPricing = useBoolean(true);
  const openFiscal = useBoolean(true);
  const supplierPicker = useBoolean();
  const quickSupplierModal = useBoolean();

  const [includeTaxes, setIncludeTaxes] = useState(
    !currentProduct?.taxPercent || currentProduct.taxPercent === 0
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [comboItems, setComboItems] = useState<ProductComboItem[]>(
    currentProduct?.comboItems || []
  );
  const [comboPickId, setComboPickId] = useState('');
  const [comboPickQty, setComboPickQty] = useState(1);

  const enterpriseId = user?.enterpriseId as string | undefined;

  const defaultValues = useMemo<ProductSchemaType>(
    () => ({
      name: currentProduct?.name || '',
      sku: currentProduct?.sku || '',
      ean: currentProduct?.ean || '',
      type: currentProduct?.type || 'finished',
      category: currentProduct?.category || PRODUCT_CATEGORIES[0],
      description: currentProduct?.description || '',
      unit: currentProduct?.unit || 'L',
      costPrice: currentProduct?.costPrice,
      salePrice: currentProduct?.salePrice,
      promoActive: currentProduct?.promoActive === true,
      discountType: (currentProduct?.discountType as ProductDiscountType) || 'percent',
      discountValue: currentProduct?.discountValue,
      servingTemperature: (currentProduct?.servingTemperature as ProductServingTemp) || 'none',
      isCombo: currentProduct?.isCombo === true,
      servesCount: currentProduct?.servesCount,
      featured: currentProduct?.featured === true,
      minStock: currentProduct?.minStock ?? 10,
      expirationDate: currentProduct?.expirationDate || '',
      supplierId: currentProduct?.supplierId || '',
      variant: currentProduct?.variant || '',
      tags: currentProduct?.tags || [],
      taxPercent: currentProduct?.taxPercent ?? 0,
      ncm: currentProduct?.ncm || '',
      origin: currentProduct?.origin ?? 0,
      cfopSaleDefault: currentProduct?.cfopSaleDefault || '5102',
      cstOrCsosn: currentProduct?.cstOrCsosn || '',
      commercialUnit: currentProduct?.commercialUnit || currentProduct?.unit || '',
      cest: currentProduct?.cest || '',
      taxBenefitCode: currentProduct?.taxBenefitCode || '',
      cbsRate: currentProduct?.cbsRate,
      ibsRate: currentProduct?.ibsRate,
      cClassTrib: currentProduct?.cClassTrib || '',
      taxClassificationNotes: currentProduct?.taxClassificationNotes || '',
      imageUrl: currentProduct?.imageUrl || null,
      showOnline: currentProduct?.showOnline === true,
      active: currentProduct?.active ?? true,
    }),
    [currentProduct]
  );

  const methods = useForm<ProductSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(ProductSchema),
    defaultValues,
  });

  const {
    reset,
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const productType = watch('type') as ProductType;
  const watchedSupplierId = watch('supplierId');
  const watchedSalePrice = watch('salePrice');
  const watchedPromoActive = watch('promoActive');
  const watchedDiscountType = watch('discountType') as ProductDiscountType;
  const watchedDiscountValue = watch('discountValue');
  const watchedServingTemp = watch('servingTemperature') as ProductServingTemp;
  const watchedIsCombo = watch('isCombo');

  const pricingPreview = useMemo(
    () =>
      getEffectiveProductPrice({
        salePrice: watchedSalePrice,
        promoActive: watchedPromoActive,
        discountType: watchedDiscountType,
        discountValue: watchedDiscountValue,
      }),
    [watchedSalePrice, watchedPromoActive, watchedDiscountType, watchedDiscountValue]
  );

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === watchedSupplierId) || null,
    [suppliers, watchedSupplierId]
  );

  const loadSuppliers = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      const [sups, prods] = await Promise.all([
        listSuppliers(enterpriseId),
        listProducts(enterpriseId),
      ]);
      setSuppliers(sups.filter((s) => s.active));
      setCatalogProducts(
        prods.filter(
          (p) => p.active && p.type === 'finished' && !p.isCombo && p.id !== currentProduct?.id
        )
      );
    } catch (error) {
      console.error(error);
    }
  }, [enterpriseId, currentProduct?.id]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    if (currentProduct) {
      reset(defaultValues);
      setComboItems(currentProduct.comboItems || []);
    }
  }, [currentProduct, defaultValues, reset]);

  const handleAddComboItem = () => {
    const picked = catalogProducts.find((p) => p.id === comboPickId);
    if (!picked) return;
    const qty = Math.max(1, Number(comboPickQty || 1));
    setComboItems((prev) => {
      const existing = prev.find((i) => i.productId === picked.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === picked.id ? { ...i, qty: i.qty + qty } : i
        );
      }
      return [...prev, { productId: picked.id, productName: picked.name, qty }];
    });
    setComboPickId('');
    setComboPickQty(1);
  };

  const handleRemoveComboItem = (productId: string) => {
    setComboItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) {
      toast.error(t('products.errorMissingEnterprise'));
      return;
    }

    try {
      let resolvedImageUrl: string | undefined =
        typeof data.imageUrl === 'string' && data.imageUrl
          ? data.imageUrl
          : currentProduct?.imageUrl;

      if (data.imageUrl instanceof File) {
        resolvedImageUrl = await uploadProductImage(
          enterpriseId,
          data.sku.trim(),
          data.imageUrl
        );
      } else if (data.imageUrl === null) {
        resolvedImageUrl = undefined;
      }

      const sup = suppliers.find((s) => s.id === data.supplierId);

      const payload = {
        name: data.name.trim(),
        sku: data.sku.trim(),
        ean: data.ean?.trim() || undefined,
        type: data.type,
        category: data.category?.trim() || undefined,
        description: data.description?.trim() || undefined,
        unit: data.unit.trim(),
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        promoActive: data.promoActive,
        discountType: data.promoActive ? data.discountType : undefined,
        discountValue: data.promoActive ? data.discountValue : undefined,
        servingTemperature: data.servingTemperature !== 'none' ? data.servingTemperature : undefined,
        isCombo: data.isCombo,
        comboItems: data.isCombo && comboItems.length > 0 ? comboItems : undefined,
        servesCount: data.servesCount && data.servesCount > 0 ? Math.round(data.servesCount) : undefined,
        featured: data.featured,
        minStock: data.minStock,
        expirationDate: data.expirationDate?.trim() || undefined,
        supplierId: sup?.id || undefined,
        supplierName: sup?.name || undefined,
        variant: data.variant?.trim() || undefined,
        tags: data.tags?.length ? data.tags : undefined,
        taxPercent: includeTaxes ? 0 : data.taxPercent,
        ncm: data.ncm?.trim() || undefined,
        origin:
          data.origin != null && data.origin >= 0 && data.origin <= 8
            ? (data.origin as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8)
            : undefined,
        cfopSaleDefault: data.cfopSaleDefault?.trim() || undefined,
        cstOrCsosn: data.cstOrCsosn?.trim() || undefined,
        commercialUnit: data.commercialUnit?.trim() || data.unit.trim(),
        cest: data.cest?.trim() || undefined,
        taxBenefitCode: data.taxBenefitCode?.trim() || undefined,
        cbsRate: data.cbsRate,
        ibsRate: data.ibsRate,
        cClassTrib: data.cClassTrib?.trim() || undefined,
        taxClassificationNotes: data.taxClassificationNotes?.trim() || undefined,
        imageUrl: resolvedImageUrl,
        showOnline: data.showOnline,
        active: data.active,
      };

      if (currentProduct) {
        await updateProduct(enterpriseId, currentProduct.id, payload);
        toast.success(t('products.updateSuccess'));
      } else {
        await createProduct(enterpriseId, payload);
        toast.success(t('products.createSuccess'));
      }

      router.push(paths.dashboard.products.list);
    } catch (error) {
      console.error(error);
      toast.error(
        getFirebaseErrorMessage(
          error,
          currentProduct ? t('products.updateError') : t('products.createError')
        )
      );
    }
  });

  const handleConfirmDeactivate = async () => {
    if (!enterpriseId || !currentProduct) {
      return;
    }

    try {
      await deactivateProduct(enterpriseId, currentProduct.id);
      toast.success(t('products.deactivateSuccess'));
      confirmDeactivate.onFalse();
      router.push(paths.dashboard.products.list);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('products.deactivateError')));
    }
  };

  const renderCollapseAction = (open: boolean, onToggle: () => void) => (
    <IconButton onClick={onToggle}>
      <Iconify icon={open ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'} />
    </IconButton>
  );

  const renderDetails = (
    <Card>
      <CardHeader
        title={t('products.details')}
        subheader={t('products.detailsSubheader')}
        action={renderCollapseAction(openDetails.value, openDetails.onToggle)}
        sx={{ mb: 3 }}
      />

      <Collapse in={openDetails.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          <Field.Text name="name" label={t('products.fields.name')} />

          <Field.Text
            name="description"
            label="Descrição comercial (exibida no Cardápio Online e detalhes do PDV)"
            placeholder="Ex.: Açaí cremoso batido com guaraná natural, acompanha banana e granola crocante..."
            multiline
            rows={3}
          />

          <Box
            columnGap={2}
            rowGap={3}
            display="grid"
            gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' }}
          >
            <Field.Select name="type" label={t('products.fields.type')}>
              <MenuItem value="finished">{t('products.types.finished')}</MenuItem>
              <MenuItem value="raw">{t('products.types.raw')}</MenuItem>
            </Field.Select>

            <Field.Select name="category" label="Categoria">
              {PRODUCT_CATEGORIES.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {cat}
                </MenuItem>
              ))}
            </Field.Select>
          </Box>

          <Stack spacing={1.5}>
            <Typography variant="subtitle2">
              {t('products.fields.image', { defaultValue: 'Imagem do produto (opcional)' })}
            </Typography>
            <Field.Upload
              name="imageUrl"
              maxSize={3145728}
              onDelete={() => setValue('imageUrl', null, { shouldValidate: true })}
            />
          </Stack>
        </Stack>
      </Collapse>
    </Card>
  );

  const renderProperties = (
    <Card>
      <CardHeader
        title={t('products.properties')}
        subheader="SKU, Código de Barras EAN-13, Fornecedor, Validade, Estoque Mínimo e Variações..."
        action={renderCollapseAction(openProperties.value, openProperties.onToggle)}
        sx={{ mb: 3 }}
      />

      <Collapse in={openProperties.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          <Box
            columnGap={2}
            rowGap={3}
            display="grid"
            gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' }}
          >
            <Field.Text
              name="sku"
              label={t('products.fields.sku')}
              placeholder="Ex: ACA-MED-1L"
            />

            <Field.Text
              name="ean"
              label="Código de Barras (EAN-13 / GTIN)"
              placeholder="7890000000000"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Iconify icon="solar:qr-code-bold" sx={{ color: 'text.disabled' }} />
                  </InputAdornment>
                ),
              }}
            />

            <Field.Text
              name="unit"
              label={t('products.fields.unit')}
              placeholder="kg, L, un, cx"
            />

            <Field.Text
              name="minStock"
              label="Estoque Mínimo (Alerta)"
              placeholder="0"
              type="number"
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: 0, step: 'any' }}
            />

            <Field.DatePicker
              name="expirationDate"
              label="Data de Validade / Lote Padrão"
            />

            <Button
              variant="outlined"
              color="inherit"
              onClick={supplierPicker.onTrue}
              startIcon={<Iconify icon="solar:buildings-2-bold" width={20} />}
              endIcon={<Iconify icon="eva:arrow-ios-downward-fill" width={16} />}
              sx={{
                height: 56,
                justifyContent: 'space-between',
                px: 2,
                textTransform: 'none',
                fontWeight: 500,
                borderColor: (theme) => theme.vars.palette.divider,
              }}
            >
              <Box
                component="span"
                sx={{
                  textAlign: 'left',
                  flexGrow: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedSupplier
                  ? `Fornecedor: ${selectedSupplier.name}`
                  : 'Selecionar Fornecedor (Modal)'}
              </Box>
            </Button>
          </Box>

          <Field.Text
            name="variant"
            label={
              productType === 'finished'
                ? 'Variação Principal / Classificação (Ex: Fino, Médio, Grosso, 500ml, 1L)'
                : 'Especificação do Insumo (Ex: Saca 28kg, Saca 50kg)'
            }
          />

          <Field.Autocomplete
            name="tags"
            label="Atributos e Variações (Tags)"
            placeholder="+ Adicionar variação ou atributo"
            multiple
            freeSolo
            disableCloseOnSelect
            options={VARIATION_TAG_SUGGESTIONS}
            getOptionLabel={(option) => option}
            renderOption={(props, option) => (
              <li {...props} key={option}>
                {option}
              </li>
            )}
            renderTags={(selected, getTagProps) =>
              selected.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option}
                  label={option}
                  size="small"
                  color="info"
                  variant="soft"
                />
              ))
            }
          />
        </Stack>
      </Collapse>
    </Card>
  );

  const renderCatalogExtras = (
    <Card>
      <CardHeader
        title="Cardápio Digital, Temperatura & Combo"
        subheader="Identificação Gelado/Quente sobre a imagem, composição de Combo e destaques estilo iFood"
        action={renderCollapseAction(openCatalogExtras.value, openCatalogExtras.onToggle)}
        sx={{ mb: 3 }}
      />

      <Collapse in={openCatalogExtras.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2">Temperatura do produto (badge sobre a imagem)</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={watchedServingTemp}
              onChange={(_, val: ProductServingTemp | null) => {
                if (val) setValue('servingTemperature', val);
              }}
            >
              <ToggleButton value="none" sx={{ px: 2 }}>
                Nenhum
              </ToggleButton>
              <ToggleButton
                value="cold"
                sx={{
                  px: 2,
                  gap: 0.75,
                  '&.Mui-selected': {
                    bgcolor: 'info.main',
                    color: 'common.white',
                    '&:hover': { bgcolor: 'info.dark' },
                  },
                }}
              >
                <Iconify icon="solar:snowflake-line-duotone" width={18} />
                Gelado
              </ToggleButton>
              <ToggleButton
                value="hot"
                sx={{
                  px: 2,
                  gap: 0.75,
                  '&.Mui-selected': {
                    bgcolor: 'error.main',
                    color: 'common.white',
                    '&:hover': { bgcolor: 'error.dark' },
                  },
                }}
              >
                <Iconify icon="solar:flame-bold-duotone" width={18} />
                Quente
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Box
            columnGap={2}
            rowGap={3}
            display="grid"
            gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' }}
            alignItems="center"
          >
            <Field.Text
              name="servesCount"
              label="Serve quantas pessoas (opcional)"
              placeholder="Ex.: 2"
              type="number"
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: 1, step: 1 }}
            />

            <Field.Switch name="featured" label="Destacar no cardápio (Mais pedido)" />
          </Box>

          <Divider sx={{ borderStyle: 'dashed' }} />

          <Stack spacing={2}>
            <Field.Switch
              name="isCombo"
              label="Este produto é um Combo (agrupa outros itens do cardápio)"
            />

            {watchedIsCombo && (
              <Stack spacing={2} sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}>
                <Typography variant="caption" color="text.secondary">
                  Selecione os produtos que compõem este combo. A composição aparece no cardápio online e no PDV.
                </Typography>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Produto componente"
                    value={comboPickId}
                    onChange={(e) => setComboPickId(e.target.value)}
                  >
                    {catalogProducts.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name} ({fCurrency(p.salePrice ?? 0)})
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    size="small"
                    type="number"
                    label="Qtd"
                    value={comboPickQty}
                    onChange={(e) => setComboPickQty(Math.max(1, Number(e.target.value || 1)))}
                    inputProps={{ min: 1 }}
                    sx={{ width: { xs: '100%', sm: 96 } }}
                  />

                  <Button
                    variant="contained"
                    onClick={handleAddComboItem}
                    disabled={!comboPickId}
                    sx={{ flexShrink: 0 }}
                  >
                    Adicionar
                  </Button>
                </Stack>

                {comboItems.length > 0 && (
                  <Stack spacing={1}>
                    {comboItems.map((item) => (
                      <Stack
                        key={item.productId}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{
                          px: 1.5,
                          py: 0.75,
                          borderRadius: 1,
                          bgcolor: 'background.paper',
                        }}
                      >
                        <Typography variant="body2">
                          <strong>{item.qty}x</strong> {item.productName}
                        </Typography>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveComboItem(item.productId)}
                        >
                          <Iconify icon="solar:trash-bin-trash-bold" width={16} />
                        </IconButton>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Stack>
            )}
          </Stack>
        </Stack>
      </Collapse>
    </Card>
  );

  const renderPricing = (
    <Card>
      <CardHeader
        title={t('products.pricing', { defaultValue: 'Preços e Custo (Pricing)' })}
        subheader={t('products.pricingSubheader', {
          defaultValue: 'Preço de custo (CMV), preço de venda e impostos',
        })}
        action={renderCollapseAction(openPricing.value, openPricing.onToggle)}
        sx={{ mb: 3 }}
      />

      <Collapse in={openPricing.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          <Field.Text
            name="costPrice"
            label={t('products.fields.costPrice')}
            placeholder="0.00"
            type="number"
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

          <Field.Text
            name="salePrice"
            label={t('products.fields.salePrice')}
            placeholder="0.00"
            type="number"
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

          <Divider sx={{ borderStyle: 'dashed' }} />

          <Field.Switch
            name="promoActive"
            label="Ativar promoção / desconto neste produto (PDV e Cardápio Online)"
          />

          {watchedPromoActive && (
            <Stack spacing={2} sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}>
              <Box
                columnGap={2}
                rowGap={2}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' }}
              >
                <Field.Select name="discountType" label="Tipo de desconto">
                  <MenuItem value="percent">Percentual (%)</MenuItem>
                  <MenuItem value="fixed">Valor fixo (R$)</MenuItem>
                </Field.Select>

                <Field.Text
                  name="discountValue"
                  label={watchedDiscountType === 'fixed' ? 'Desconto em R$' : 'Desconto em %'}
                  placeholder="0"
                  type="number"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{
                    min: 0,
                    max: watchedDiscountType === 'percent' ? 100 : undefined,
                    step: 'any',
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Box component="span" sx={{ color: 'text.disabled' }}>
                          {watchedDiscountType === 'fixed' ? 'R$' : '%'}
                        </Box>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              {pricingPreview.hasDiscount && (
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                  <Typography
                    variant="body2"
                    sx={{ textDecoration: 'line-through', color: 'text.disabled' }}
                  >
                    De {fCurrency(pricingPreview.basePrice)}
                  </Typography>
                  <Typography variant="subtitle1" color="success.main" sx={{ fontWeight: 700 }}>
                    Por {fCurrency(pricingPreview.effectivePrice)}
                  </Typography>
                  {pricingPreview.discountBadge && (
                    <Chip size="small" color="success" label={pricingPreview.discountBadge} />
                  )}
                </Stack>
              )}
            </Stack>
          )}

          <FormControlLabel
            control={
              <Switch
                id="toggle-taxes"
                checked={includeTaxes}
                onChange={(e) => setIncludeTaxes(e.target.checked)}
              />
            }
            label="Preço já inclui impostos"
          />

          {!includeTaxes && (
            <Field.Text
              name="taxPercent"
              label="Alíquota de imposto (%)"
              placeholder="0.00"
              type="number"
              InputLabelProps={{ shrink: true }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box component="span" sx={{ color: 'text.disabled' }}>
                      %
                    </Box>
                  </InputAdornment>
                ),
              }}
            />
          )}
        </Stack>
      </Collapse>
    </Card>
  );

  const fiscalIncomplete = !methods.watch('ncm') || !methods.watch('cstOrCsosn');

  const renderFiscal = (
    <Card>
      <CardHeader
        title={t('fiscal.productCard')}
        subheader="NCM, origem, CST/CSOSN e campos da Reforma Tributária"
        action={renderCollapseAction(openFiscal.value, openFiscal.onToggle)}
        sx={{ mb: 3 }}
      />
      <Collapse in={openFiscal.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          {fiscalIncomplete && (
            <Alert severity="info">{t('fiscal.missingProductFiscal')}</Alert>
          )}
          <Box
            columnGap={2}
            rowGap={3}
            display="grid"
            gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
          >
            <Field.Text name="ncm" label={t('fiscal.ncm')} />
            <Field.Select name="origin" label={t('fiscal.origin')}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((code) => (
                <MenuItem key={code} value={code}>
                  {code}
                </MenuItem>
              ))}
            </Field.Select>
            <Field.Text name="cfopSaleDefault" label={t('fiscal.cfopSaleDefault')} />
            <Field.Text name="cstOrCsosn" label={t('fiscal.cstOrCsosn')} />
            <Field.Text name="commercialUnit" label={t('fiscal.commercialUnit')} />
            <Field.Text name="cest" label={t('fiscal.cest')} />
            <Field.Text name="taxBenefitCode" label={t('fiscal.taxBenefitCode')} />
            <Field.Text name="cClassTrib" label={t('fiscal.cClassTrib')} />
            <Field.Text name="cbsRate" label={t('fiscal.cbsRate')} type="number" />
            <Field.Text name="ibsRate" label={t('fiscal.ibsRate')} type="number" />
          </Box>
          <Field.Text
            name="taxClassificationNotes"
            label={t('fiscal.taxClassificationNotes')}
            multiline
            rows={2}
          />
        </Stack>
      </Collapse>
    </Card>
  );

  const renderActions = (
    <Stack
      spacing={3}
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
    >
      <Stack direction="row" spacing={2} alignItems="center" sx={{ pl: 3, flexGrow: 1 }}>
        <Field.Switch name="active" label={t('products.fields.active')} />
        <Field.Switch name="showOnline" label={t('products.fields.showOnline')} />
      </Stack>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ ml: 'auto' }}>
        {currentProduct && (
          <Button
            color="error"
            variant="soft"
            onClick={confirmDeactivate.onTrue}
            disabled={isSubmitting}
          >
            {t('products.deactivate')}
          </Button>
        )}

        <LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
          {currentProduct ? t('products.saveSubmit') : t('products.createSubmit')}
        </LoadingButton>
      </Stack>
    </Stack>
  );

  return (
    <>
      <Form methods={methods} onSubmit={onSubmit}>
        <Stack spacing={{ xs: 3, md: 5 }} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
          {renderDetails}
          {renderCatalogExtras}
          {renderProperties}
          {renderPricing}
          {renderFiscal}
          {renderActions}
        </Stack>
      </Form>

      <SupplierListDialog
        title={t('nav.suppliers')}
        open={supplierPicker.value}
        onClose={supplierPicker.onFalse}
        selected={(id) => watchedSupplierId === id}
        onSelect={(sup) => setValue('supplierId', sup?.id || '')}
        list={suppliers}
        action={
          <Button
            size="small"
            variant="soft"
            color="primary"
            startIcon={<Iconify icon="mingcute:add-line" />}
            onClick={() => {
              supplierPicker.onFalse();
              quickSupplierModal.onTrue();
            }}
          >
            {t('suppliers.newSupplier')}
          </Button>
        }
      />

      <SupplierQuickNewDialog
        open={quickSupplierModal.value}
        onClose={quickSupplierModal.onFalse}
        onCreated={(created) => {
          setSuppliers((prev) => [...prev, created]);
          setValue('supplierId', created.id);
        }}
      />

      <ConfirmDialog
        open={confirmDeactivate.value}
        onClose={confirmDeactivate.onFalse}
        title={t('products.deactivate')}
        content={t('products.deactivateConfirm')}
        action={
          <Button variant="contained" color="error" onClick={handleConfirmDeactivate}>
            {t('products.deactivate')}
          </Button>
        }
      />
    </>
  );
}

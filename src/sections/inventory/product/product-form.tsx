import type { Supplier } from 'src/api/firestore/suppliers';
import type { Product, ProductType } from 'src/api/firestore/products';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listSuppliers } from 'src/api/firestore/suppliers';
import { uploadProductImage } from 'src/api/firestore/storage';
import {
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
  unit: zod.string().min(1, { message: 'Required' }),
  costPrice: optionalNumber,
  salePrice: optionalNumber,
  minStock: optionalNumber,
  expirationDate: zod.string().optional().or(zod.literal('')),
  supplierId: zod.string().optional().or(zod.literal('')),
  variant: zod.string().optional().or(zod.literal('')),
  tags: zod.array(zod.string()).optional(),
  taxPercent: optionalNumber,
  imageUrl: zod.any().optional(),
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
  const openProperties = useBoolean(true);
  const openPricing = useBoolean(true);
  const supplierPicker = useBoolean();
  const quickSupplierModal = useBoolean();

  const [includeTaxes, setIncludeTaxes] = useState(
    !currentProduct?.taxPercent || currentProduct.taxPercent === 0
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const enterpriseId = user?.enterpriseId as string | undefined;

  const defaultValues = useMemo<ProductSchemaType>(
    () => ({
      name: currentProduct?.name || '',
      sku: currentProduct?.sku || '',
      ean: currentProduct?.ean || '',
      type: currentProduct?.type || 'finished',
      category: currentProduct?.category || PRODUCT_CATEGORIES[0],
      unit: currentProduct?.unit || 'L',
      costPrice: currentProduct?.costPrice,
      salePrice: currentProduct?.salePrice,
      minStock: currentProduct?.minStock ?? 10,
      expirationDate: currentProduct?.expirationDate || '',
      supplierId: currentProduct?.supplierId || '',
      variant: currentProduct?.variant || '',
      tags: currentProduct?.tags || [],
      taxPercent: currentProduct?.taxPercent ?? 0,
      imageUrl: currentProduct?.imageUrl || null,
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

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === watchedSupplierId) || null,
    [suppliers, watchedSupplierId]
  );

  const loadSuppliers = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      const sups = await listSuppliers(enterpriseId);
      setSuppliers(sups.filter((s) => s.active));
    } catch (error) {
      console.error(error);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    if (currentProduct) {
      reset(defaultValues);
    }
  }, [currentProduct, defaultValues, reset]);

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
        unit: data.unit.trim(),
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        minStock: data.minStock,
        expirationDate: data.expirationDate?.trim() || undefined,
        supplierId: sup?.id || undefined,
        supplierName: sup?.name || undefined,
        variant: data.variant?.trim() || undefined,
        tags: data.tags?.length ? data.tags : undefined,
        taxPercent: includeTaxes ? 0 : data.taxPercent,
        imageUrl: resolvedImageUrl,
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

  const renderActions = (
    <Stack
      spacing={3}
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      flexWrap="wrap"
    >
      <Field.Switch
        name="active"
        label={t('products.fields.active')}
        slotProps={{
          wrap: { pl: 3, flexGrow: 1 },
          switch: {},
        }}
      />

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
          {renderProperties}
          {renderPricing}
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

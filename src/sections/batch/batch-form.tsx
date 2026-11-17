import type { Product } from 'src/api/firestore/products';
import type { Supplier } from 'src/api/firestore/suppliers';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listProducts } from 'src/api/firestore/products';
import { listSuppliers } from 'src/api/firestore/suppliers';
import { createBatchEntry } from 'src/api/firestore/batches';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

import { generateLotCode } from 'src/sections/processing/cost-allocation';
import { SupplierListDialog } from 'src/sections/supplier/supplier-list-dialog';
import { SupplierQuickNewDialog } from 'src/sections/supplier/supplier-quick-new-dialog';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const positiveNumber = zod.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return 0;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : 0;
}, zod.number().gt(0, { message: 'Must be > 0' }));

const nonNegativeNumber = zod.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return 0;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : 0;
}, zod.number().min(0));

export const BatchEntrySchema = zod.object({
  lotCode: zod.string().min(1, { message: 'Required' }),
  productId: zod.string().min(1, { message: 'Required' }),
  supplierId: zod.string().optional().or(zod.literal('')),
  initialQty: positiveNumber,
  unitCost: nonNegativeNumber,
  expiresAt: zod.string().optional().or(zod.literal('')),
  notes: zod.string().optional().or(zod.literal('')),
});

export type BatchEntrySchemaType = zod.infer<typeof BatchEntrySchema>;

// ----------------------------------------------------------------------

export function BatchForm() {
  const router = useRouter();
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const openDetails = useBoolean(true);
  const openQuantities = useBoolean(true);
  const supplierPicker = useBoolean();
  const quickSupplierModal = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const defaultValues = useMemo<BatchEntrySchemaType>(
    () => ({
      lotCode: generateLotCode('LOTE'),
      productId: '',
      supplierId: '',
      initialQty: 1,
      unitCost: 0,
      expiresAt: '',
      notes: '',
    }),
    []
  );

  const methods = useForm<BatchEntrySchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(BatchEntrySchema),
    defaultValues,
  });

  const {
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const selectedProductId = watch('productId');
  const selectedSupplierId = watch('supplierId');
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) || null,
    [selectedSupplierId, suppliers]
  );

  const loadCatalogs = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      const [prods, sups] = await Promise.all([
        listProducts(enterpriseId),
        listSuppliers(enterpriseId),
      ]);
      setProducts(prods.filter((p) => p.active));
      setSuppliers(sups.filter((s) => s.active));
    } catch (error) {
      console.error(error);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    if (!selectedProductId) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (prod && typeof prod.costPrice === 'number') {
      setValue('unitCost', prod.costPrice);
    }
  }, [products, selectedProductId, setValue]);

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) {
      toast.error(t('batches.errorMissingEnterprise'));
      return;
    }

    const prod = products.find((p) => p.id === data.productId);
    if (!prod) {
      toast.error(t('batches.createError'));
      return;
    }

    const sup = suppliers.find((s) => s.id === data.supplierId);

    try {
      await createBatchEntry(enterpriseId, {
        lotCode: data.lotCode.trim(),
        productId: prod.id,
        productName: prod.name,
        productSku: prod.sku,
        productType: prod.type,
        unit: prod.unit,
        supplierId: sup?.id,
        supplierName: sup?.name,
        initialQty: Number(data.initialQty),
        unitCost: Number(data.unitCost),
        expiresAt: data.expiresAt?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        createdBy: user?.id,
      });

      toast.success(t('batches.createSuccess'));
      router.push(paths.dashboard.batches.list);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('batches.createError')));
    }
  });

  const renderCollapseAction = (open: boolean, onToggle: () => void) => (
    <IconButton onClick={onToggle}>
      <Iconify icon={open ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'} />
    </IconButton>
  );

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Stack spacing={{ xs: 3, md: 5 }} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
        <Card>
          <CardHeader
            title={t('batches.details')}
            subheader={t('batches.detailsSubheader')}
            action={renderCollapseAction(openDetails.value, openDetails.onToggle)}
            sx={{ mb: 3 }}
          />
          <Collapse in={openDetails.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' }}
              >
                <Field.Text name="lotCode" label={t('batches.fields.lotCode')} />

                <Field.Select name="productId" label={t('batches.fields.product')}>
                  {products.map((prod) => (
                    <MenuItem key={prod.id} value={prod.id}>
                      {prod.name} ({prod.sku} — {prod.unit})
                    </MenuItem>
                  ))}
                </Field.Select>

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
                  <Box component="span" sx={{ textAlign: 'left', flexGrow: 1 }}>
                    {selectedSupplier
                      ? `${selectedSupplier.name}${
                          selectedSupplier.document ? ` (${selectedSupplier.document})` : ''
                        }`
                      : t('batches.fields.supplier')}
                  </Box>
                </Button>

                <Field.DatePicker
                  name="expiresAt"
                  label={t('batches.fields.expiresAt')}
                />
              </Box>
            </Stack>
          </Collapse>
        </Card>

        <Card>
          <CardHeader
            title={t('batches.quantities')}
            subheader={t('batches.quantitiesSubheader')}
            action={renderCollapseAction(openQuantities.value, openQuantities.onToggle)}
            sx={{ mb: 3 }}
          />
          <Collapse in={openQuantities.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' }}
              >
                <Field.Text
                  name="initialQty"
                  label={t('batches.fields.initialQty')}
                  type="number"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: 0.01, step: 'any' }}
                />

                <Field.Text
                  name="unitCost"
                  label={t('batches.fields.unitCost')}
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
              </Box>

              <Field.Text
                name="notes"
                label={t('batches.fields.notes')}
                multiline
                rows={2}
              />
            </Stack>
          </Collapse>
        </Card>

        <Stack direction="row" justifyContent="flex-end">
          <LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
            {t('batches.createSubmit')}
          </LoadingButton>
        </Stack>
      </Stack>

      <SupplierListDialog
        title={t('nav.suppliers')}
        open={supplierPicker.value}
        onClose={supplierPicker.onFalse}
        selected={(id) => selectedSupplierId === id}
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
    </Form>
  );
}

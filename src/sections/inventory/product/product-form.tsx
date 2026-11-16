import type { Product, ProductType } from 'src/api/firestore/products';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

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

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import {
  createProduct,
  updateProduct,
  deactivateProduct,
} from 'src/api/firestore/products';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';
import { ConfirmDialog } from 'src/components/custom-dialog';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

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
  type: zod.enum(['raw', 'finished'], { required_error: 'Required' }),
  unit: zod.string().min(1, { message: 'Required' }),
  costPrice: optionalNumber,
  salePrice: optionalNumber,
  variant: zod.string().optional().or(zod.literal('')),
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

  const enterpriseId = user?.enterpriseId as string | undefined;

  const defaultValues = useMemo<ProductSchemaType>(
    () => ({
      name: currentProduct?.name || '',
      sku: currentProduct?.sku || '',
      type: currentProduct?.type || 'raw',
      unit: currentProduct?.unit || '',
      costPrice: currentProduct?.costPrice,
      salePrice: currentProduct?.salePrice,
      variant: currentProduct?.variant || '',
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
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const productType = watch('type') as ProductType;

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
      const payload = {
        name: data.name.trim(),
        sku: data.sku.trim(),
        type: data.type,
        unit: data.unit.trim(),
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        variant: data.type === 'finished' ? data.variant?.trim() || undefined : undefined,
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
      <Iconify icon={open ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'} />
    </IconButton>
  );

  const renderDetails = (
    <Card>
      <CardHeader
        title={t('products.details')}
        subheader={t('products.detailsSubheader')}
        action={renderCollapseAction(openDetails.value, openDetails.onToggle)}
        sx={{ mb: openDetails.value ? 3 : 0 }}
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
            <Field.Text name="sku" label={t('products.fields.sku')} />
            <Field.Select name="type" label={t('products.fields.type')}>
              <MenuItem value="raw">{t('products.types.raw')}</MenuItem>
              <MenuItem value="finished">{t('products.types.finished')}</MenuItem>
            </Field.Select>
          </Box>

          <Field.Switch name="active" label={t('products.fields.active')} sx={{ m: 0 }} />
        </Stack>
      </Collapse>
    </Card>
  );

  const renderProperties = (
    <Card>
      <CardHeader
        title={t('products.properties')}
        subheader={t('products.propertiesSubheader')}
        action={renderCollapseAction(openProperties.value, openProperties.onToggle)}
        sx={{ mb: openProperties.value ? 3 : 0 }}
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
            <Field.Text name="unit" label={t('products.fields.unit')} />
            <Field.Text
              name="costPrice"
              label={t('products.fields.costPrice')}
              type="number"
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: 0, step: 'any' }}
            />
            <Field.Text
              name="salePrice"
              label={t('products.fields.salePrice')}
              type="number"
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: 0, step: 'any' }}
            />
            {productType === 'finished' && (
              <Field.Text name="variant" label={t('products.fields.variant')} />
            )}
          </Box>
        </Stack>
      </Collapse>
    </Card>
  );

  const renderActions = (
    <Stack direction="row" spacing={2} justifyContent="flex-end" alignItems="center">
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
  );

  return (
    <>
      <Form methods={methods} onSubmit={onSubmit}>
        <Stack spacing={{ xs: 3, md: 5 }} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
          {renderDetails}
          {renderProperties}
          {renderActions}
        </Stack>
      </Form>

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

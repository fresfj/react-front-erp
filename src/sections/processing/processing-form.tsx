import type { Batch } from 'src/api/firestore/batches';
import type { Product } from 'src/api/firestore/products';
import type { Supplier } from 'src/api/firestore/suppliers';

import { z as zod } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { fNumber, fPercent, fCurrency } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';
import { listProducts } from 'src/api/firestore/products';
import { listSuppliers } from 'src/api/firestore/suppliers';
import { listAvailableBatchesFIFO } from 'src/api/firestore/batches';
import { createProcessingOrder } from 'src/api/firestore/processing-orders';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

import { SupplierListDialog } from 'src/sections/supplier/supplier-list-dialog';
import { SupplierQuickNewDialog } from 'src/sections/supplier/supplier-quick-new-dialog';

import { useAuthContext } from 'src/auth/hooks';

import {
  generateLotCode,
  generateProcessingOrderCode,
  calculateProcessingCostAllocation,
} from './cost-allocation';

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

export const ProcessingOrderSchema = zod.object({
  code: zod.string().min(1, { message: 'Required' }),
  rawProductId: zod.string().min(1, { message: 'Required' }),
  rawBatchId: zod.string().optional().or(zod.literal('')),
  supplierId: zod.string().optional().or(zod.literal('')),
  rawQtyUsed: positiveNumber,
  rawUnitCost: nonNegativeNumber,
  extraCost: nonNegativeNumber,
  notes: zod.string().optional().or(zod.literal('')),
  outputs: zod
    .array(
      zod.object({
        productId: zod.string().min(1, { message: 'Required' }),
        qty: positiveNumber,
        weightFactor: positiveNumber,
        lotCode: zod.string().min(1, { message: 'Required' }),
      })
    )
    .min(1),
});

export type ProcessingOrderSchemaType = zod.infer<typeof ProcessingOrderSchema>;

// ----------------------------------------------------------------------

export function ProcessingForm() {
  const router = useRouter();
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const openRaw = useBoolean(true);
  const openOutputs = useBoolean(true);
  const openSummary = useBoolean(true);
  const supplierPicker = useBoolean();
  const quickSupplierModal = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rawBatches, setRawBatches] = useState<Batch[]>([]);

  const rawProducts = useMemo(
    () => products.filter((p) => p.active && p.type === 'raw'),
    [products]
  );
  const finishedProducts = useMemo(
    () => products.filter((p) => p.active && p.type === 'finished'),
    [products]
  );

  const defaultValues = useMemo<ProcessingOrderSchemaType>(
    () => ({
      code: generateProcessingOrderCode(),
      rawProductId: '',
      rawBatchId: '',
      supplierId: '',
      rawQtyUsed: 100,
      rawUnitCost: 0,
      extraCost: 0,
      notes: '',
      outputs: [
        {
          productId: '',
          qty: 10,
          weightFactor: 1,
          lotCode: generateLotCode('LOTE'),
        },
      ],
    }),
    []
  );

  const methods = useForm<ProcessingOrderSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(ProcessingOrderSchema),
    defaultValues,
  });

  const {
    watch,
    control,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'outputs',
  });

  const watchedRawProductId = watch('rawProductId');
  const watchedRawBatchId = watch('rawBatchId');
  const watchedSupplierId = watch('supplierId');
  const watchedRawQtyUsed = watch('rawQtyUsed');
  const watchedRawUnitCost = watch('rawUnitCost');
  const watchedExtraCost = watch('extraCost');
  const watchedOutputs = watch('outputs');

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === watchedSupplierId) || null,
    [suppliers, watchedSupplierId]
  );

  const loadCatalogs = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      const [prods, sups, batches] = await Promise.all([
        listProducts(enterpriseId),
        listSuppliers(enterpriseId),
        listAvailableBatchesFIFO(enterpriseId),
      ]);
      setProducts(prods);
      setSuppliers(sups.filter((s) => s.active));
      setRawBatches(batches);
    } catch (error) {
      console.error(error);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  // Filter batches for selected raw product
  const filteredRawBatches = useMemo(
    () => rawBatches.filter((b) => b.productId === watchedRawProductId),
    [rawBatches, watchedRawProductId]
  );

  // Auto-fill unit cost when rawProductId changes
  useEffect(() => {
    if (!watchedRawProductId) return;
    const rawProd = rawProducts.find((p) => p.id === watchedRawProductId);
    if (rawProd && typeof rawProd.costPrice === 'number') {
      setValue('rawUnitCost', rawProd.costPrice);
    }
    setValue('rawBatchId', '');
  }, [rawProducts, setValue, watchedRawProductId]);

  // Auto-fill unit cost and supplier when rawBatchId changes
  useEffect(() => {
    if (!watchedRawBatchId) return;
    const batch = rawBatches.find((b) => b.id === watchedRawBatchId);
    if (batch) {
      setValue('rawUnitCost', batch.unitCost);
      if (batch.supplierId) {
        setValue('supplierId', batch.supplierId);
      }
    }
  }, [rawBatches, setValue, watchedRawBatchId]);

  const allocation = useMemo(
    () =>
      calculateProcessingCostAllocation({
        rawQtyUsed: Number(watchedRawQtyUsed) || 0,
        rawUnitCost: Number(watchedRawUnitCost) || 0,
        extraCost: Number(watchedExtraCost) || 0,
        outputs: (watchedOutputs || []).map((o) => ({
          productId: o.productId,
          qty: Number(o.qty) || 0,
          weightFactor: Number(o.weightFactor) || 1,
        })),
      }),
    [watchedExtraCost, watchedOutputs, watchedRawQtyUsed, watchedRawUnitCost]
  );

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) {
      toast.error(t('processing.errorMissingEnterprise'));
      return;
    }

    const rawProd = products.find((p) => p.id === data.rawProductId);
    if (!rawProd) {
      toast.error(t('processing.createError'));
      return;
    }

    const selectedBatch = rawBatches.find((b) => b.id === data.rawBatchId);
    const targetSupplier = suppliers.find((s) => s.id === data.supplierId);

    try {
      const outputsPayload = data.outputs.map((out, idx) => {
        const prod = products.find((p) => p.id === out.productId);
        const calc = allocation.items[idx];
        return {
          productId: out.productId,
          productName: prod?.name || '',
          productSku: prod?.sku || '',
          variant: prod?.variant,
          unit: prod?.unit || 'un',
          qty: Number(out.qty),
          weightFactor: Number(out.weightFactor),
          allocatedTotalCost: calc?.allocatedTotalCost ?? 0,
          allocatedUnitCost: calc?.allocatedUnitCost ?? 0,
          lotCode: out.lotCode.trim(),
        };
      });

      const orderId = await createProcessingOrder(enterpriseId, {
        code: data.code.trim(),
        rawProductId: rawProd.id,
        rawProductName: rawProd.name,
        rawProductSku: rawProd.sku,
        rawUnit: rawProd.unit,
        rawBatchId: selectedBatch?.id,
        rawLotCode: selectedBatch?.lotCode,
        rawBatchCurrentRemaining: selectedBatch?.remainingQty,
        supplierId: targetSupplier?.id,
        supplierName: targetSupplier?.name,
        rawQtyUsed: Number(data.rawQtyUsed),
        rawUnitCost: Number(data.rawUnitCost),
        rawTotalCost: allocation.rawTotalCost,
        extraCost: allocation.extraCost,
        totalCost: allocation.totalCost,
        totalOutputQty: allocation.totalOutputQty,
        outputs: outputsPayload,
        notes: data.notes?.trim() || undefined,
        createdBy: user?.id,
      });

      toast.success(t('processing.createSuccess'));
      router.push(paths.dashboard.processing.details(orderId));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('processing.createError')));
    }
  });

  const renderCollapseAction = (open: boolean, onToggle: () => void) => (
    <IconButton onClick={onToggle}>
      <Iconify icon={open ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'} />
    </IconButton>
  );

  const renderRawSection = (
    <Card>
      <CardHeader
        title={t('processing.rawSectionTitle')}
        subheader={t('processing.rawSectionSubheader')}
        action={renderCollapseAction(openRaw.value, openRaw.onToggle)}
        sx={{ mb: 3 }}
      />
      <Collapse in={openRaw.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          {!rawProducts.length && (
            <Alert severity="info">{t('processing.noRawProductsHint')}</Alert>
          )}

          <Box
            columnGap={2}
            rowGap={3}
            display="grid"
            gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' }}
          >
            <Field.Text name="code" label={t('processing.fields.code')} />

            <Field.Select name="rawProductId" label={t('processing.fields.rawProduct')}>
              {rawProducts.map((prod) => (
                <MenuItem key={prod.id} value={prod.id}>
                  {prod.name} ({prod.sku} — {prod.unit})
                </MenuItem>
              ))}
            </Field.Select>

            <Field.Select name="rawBatchId" label={t('processing.fields.rawBatch')}>
              <MenuItem value="">{t('processing.fields.noBatch')}</MenuItem>
              {filteredRawBatches.map((batch) => (
                <MenuItem key={batch.id} value={batch.id}>
                  {batch.lotCode} — Saldo: {batch.remainingQty} {batch.unit} (R${' '}
                  {batch.unitCost.toFixed(2)})
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
                  : t('processing.fields.supplier')}
              </Box>
            </Button>
          </Box>

          <Box
            columnGap={2}
            rowGap={3}
            display="grid"
            gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(3, 1fr)' }}
          >
            <Field.Text
              name="rawQtyUsed"
              label={t('processing.fields.rawQtyUsed')}
              type="number"
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: 0.01, step: 'any' }}
            />
            <Field.Text
              name="rawUnitCost"
              label={t('processing.fields.rawUnitCost')}
              type="number"
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: 0, step: 'any' }}
            />
            <Field.Text
              name="extraCost"
              label={t('processing.fields.extraCost')}
              type="number"
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: 0, step: 'any' }}
            />
          </Box>

          <Field.Text
            name="notes"
            label={t('processing.fields.notes')}
            multiline
            rows={2}
          />
        </Stack>
      </Collapse>
    </Card>
  );

  const renderOutputsSection = (
    <Card>
      <CardHeader
        title={t('processing.outputsSectionTitle')}
        subheader={t('processing.outputsSectionSubheader')}
        action={renderCollapseAction(openOutputs.value, openOutputs.onToggle)}
        sx={{ mb: 3 }}
      />
      <Collapse in={openOutputs.value}>
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          {!finishedProducts.length && (
            <Alert severity="info">{t('processing.noFinishedProductsHint')}</Alert>
          )}

          {fields.map((field, index) => {
            const calc = allocation.items[index];
            return (
              <Stack
                key={field.id}
                spacing={2}
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: 'background.neutral',
                }}
              >
                <Box
                  columnGap={2}
                  rowGap={2}
                  display="grid"
                  gridTemplateColumns={{
                    xs: 'repeat(1, 1fr)',
                    md: '2fr 1fr 1fr 1.5fr auto',
                  }}
                  alignItems="center"
                >
                  <Field.Select
                    name={`outputs.${index}.productId`}
                    label={t('processing.fields.outputProduct')}
                  >
                    {finishedProducts.map((prod) => (
                      <MenuItem key={prod.id} value={prod.id}>
                        {prod.name} {prod.variant ? `(${prod.variant})` : ''} — {prod.unit}
                      </MenuItem>
                    ))}
                  </Field.Select>

                  <Field.Text
                    name={`outputs.${index}.qty`}
                    label={t('processing.fields.outputQty')}
                    type="number"
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: 0.01, step: 'any' }}
                  />

                  <Field.Text
                    name={`outputs.${index}.weightFactor`}
                    label={t('processing.fields.weightFactor')}
                    type="number"
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: 0.1, step: '0.05' }}
                  />

                  <Field.Text
                    name={`outputs.${index}.lotCode`}
                    label={t('processing.fields.lotCode')}
                  />

                  <IconButton
                    color="error"
                    onClick={() => remove(index)}
                    disabled={fields.length <= 1}
                    title={t('processing.removeOutput')}
                  >
                    <Iconify icon="solar:trash-bin-trash-bold" />
                  </IconButton>
                </Box>

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  justifyContent="flex-end"
                  sx={{ color: 'text.secondary', typography: 'caption' }}
                >
                  <span>
                    {t('processing.fields.sharePercent')}:{' '}
                    <strong>{fPercent((calc?.shareRatio ?? 0) * 100)}</strong>
                  </span>
                  <span>
                    {t('processing.fields.allocatedTotalCost')}:{' '}
                    <strong>{fCurrency(calc?.allocatedTotalCost ?? 0)}</strong>
                  </span>
                  <span>
                    {t('processing.fields.allocatedUnitCost')}:{' '}
                    <strong>{fCurrency(calc?.allocatedUnitCost ?? 0)}</strong>
                  </span>
                </Stack>
              </Stack>
            );
          })}

          <Box>
            <Button
              size="small"
              color="primary"
              startIcon={<Iconify icon="mingcute:add-line" />}
              onClick={() =>
                append({
                  productId: '',
                  qty: 10,
                  weightFactor: 1,
                  lotCode: generateLotCode('LOTE'),
                })
              }
            >
              {t('processing.addOutput')}
            </Button>
          </Box>
        </Stack>
      </Collapse>
    </Card>
  );

  const renderSummarySection = (
    <Card>
      <CardHeader
        title={t('processing.summarySectionTitle')}
        action={renderCollapseAction(openSummary.value, openSummary.onToggle)}
        sx={{ mb: 3 }}
      />
      <Collapse in={openSummary.value}>
        <Divider />
        <Stack spacing={2} sx={{ p: 3 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={3}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('processing.fields.rawTotalCost')}
              </Typography>
              <Typography variant="subtitle1">{fCurrency(allocation.rawTotalCost)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('processing.fields.extraCost')}
              </Typography>
              <Typography variant="subtitle1">{fCurrency(allocation.extraCost)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('processing.fields.totalCost')}
              </Typography>
              <Typography variant="h6" color="primary.main">
                {fCurrency(allocation.totalCost)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('processing.fields.totalOutputQty')}
              </Typography>
              <Typography variant="h6">{fNumber(allocation.totalOutputQty)}</Typography>
            </Box>
          </Stack>

          <Divider />

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('processing.fields.outputProduct')}</TableCell>
                <TableCell align="right">{t('processing.fields.outputQty')}</TableCell>
                <TableCell align="right">{t('processing.fields.weightFactor')}</TableCell>
                <TableCell align="right">{t('processing.fields.allocatedTotalCost')}</TableCell>
                <TableCell align="right">{t('processing.fields.allocatedUnitCost')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {allocation.items.map((item, idx) => {
                const prod = finishedProducts.find((p) => p.id === item.productId);
                return (
                  <TableRow key={`${item.productId}-${idx}`}>
                    <TableCell>
                      {prod ? `${prod.name} (${prod.unit})` : `#${idx + 1}`}
                    </TableCell>
                    <TableCell align="right">{fNumber(item.qty)}</TableCell>
                    <TableCell align="right">{item.weightFactor}x</TableCell>
                    <TableCell align="right">{fCurrency(item.allocatedTotalCost)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {fCurrency(item.allocatedUnitCost)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Stack>
      </Collapse>
    </Card>
  );

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Stack spacing={{ xs: 3, md: 5 }} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 960 } }}>
        {renderRawSection}
        {renderOutputsSection}
        {renderSummarySection}

        <Stack direction="row" justifyContent="flex-end">
          <LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
            {t('processing.createSubmit')}
          </LoadingButton>
        </Stack>
      </Stack>

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
    </Form>
  );
}

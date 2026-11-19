import type {
  Payable,
  DreClass,
  FinancialStatus,
  FinancialCategory,
  FinancialRecurrence,
} from 'src/api/firestore/payables';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import CardHeader from '@mui/material/CardHeader';
import LoadingButton from '@mui/lab/LoadingButton';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { updatePayable, createPayableWithInstallments } from 'src/api/firestore/payables';

import { toast } from 'src/components/snackbar';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const Schema = zod.object({
  description: zod.string().min(1),
  category: zod.enum(['utilities_power', 'utilities_internet', 'rent', 'supplier', 'tax', 'other']),
  amount: zod.coerce.number().positive(),
  startDate: zod.string().min(1),
  dueDate: zod.string().min(1),
  competenceDate: zod.string().min(1),
  dreClass: zod
    .enum(['operating', 'cogs_inventory', 'other_income', 'ignore'])
    .optional()
    .or(zod.literal('')),
  supplierName: zod.string().optional().or(zod.literal('')),
  recurrence: zod.enum(['none', 'weekly', 'monthly']),
  installmentCount: zod.coerce.number().int().min(1).max(24),
  status: zod.enum(['open', 'paid', 'cancelled']),
  active: zod.boolean(),
});

type SchemaType = zod.infer<typeof Schema>;

type Props = { current?: Payable };

const CATEGORIES: FinancialCategory[] = [
  'utilities_power',
  'utilities_internet',
  'rent',
  'supplier',
  'tax',
  'other',
];

const DRE_CLASSES: DreClass[] = ['operating', 'cogs_inventory', 'other_income', 'ignore'];

export function PayableForm({ current }: Props) {
  const router = useRouter();
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;
  const isEdit = Boolean(current);

  const defaultValues = useMemo<SchemaType>(
    () => ({
      description: current?.description || '',
      category: current?.category || 'other',
      amount: current?.amount || 0,
      startDate: current?.startDate || '',
      dueDate: current?.dueDate || '',
      competenceDate: current?.competenceDate || current?.startDate || '',
      dreClass: current?.dreClass || '',
      supplierName: current?.supplierName || '',
      recurrence: current?.recurrence || 'none',
      installmentCount: current?.installmentCount || 2,
      status: current?.status || 'open',
      active: current?.active ?? true,
    }),
    [current]
  );

  const methods = useForm<SchemaType>({
    resolver: zodResolver(Schema),
    defaultValues,
  });

  const {
    reset,
    watch,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const recurrence = watch('recurrence');

  useEffect(() => {
    if (current) reset(defaultValues);
  }, [current, defaultValues, reset]);

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) return;
    try {
      const dreClass = data.dreClass ? (data.dreClass as DreClass) : undefined;
      if (isEdit && current) {
        await updatePayable(enterpriseId, current.id, {
          description: data.description.trim(),
          category: data.category as FinancialCategory,
          amount: Number(data.amount),
          startDate: data.startDate,
          dueDate: data.dueDate,
          competenceDate: data.competenceDate,
          dreClass,
          supplierName: data.supplierName?.trim() || undefined,
          recurrence: data.recurrence as FinancialRecurrence,
          status: data.status as FinancialStatus,
          active: data.active,
        });
        toast.success(t('finance.payableUpdateSuccess', { defaultValue: 'Conta atualizada' }));
      } else {
        await createPayableWithInstallments(enterpriseId, {
          description: data.description.trim(),
          category: data.category as FinancialCategory,
          amount: Number(data.amount),
          startDate: data.startDate,
          dueDate: data.dueDate,
          competenceDate: data.competenceDate,
          dreClass,
          supplierName: data.supplierName?.trim() || undefined,
          recurrence: data.recurrence as FinancialRecurrence,
          installmentCount: data.recurrence === 'none' ? 1 : Number(data.installmentCount),
          status: data.status as FinancialStatus,
          active: data.active,
        });
        toast.success(t('finance.payableCreateSuccess', { defaultValue: 'Conta criada' }));
      }
      router.push(paths.dashboard.cash.payables);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao salvar'));
    }
  });

  return (
    <Form methods={methods} onSubmit={onSubmit}>
      <Card sx={{ mx: 'auto', maxWidth: 880 }}>
        <CardHeader
          title={t('finance.payableForm', { defaultValue: 'Conta a pagar' })}
          sx={{ mb: 2 }}
        />
        <Divider />
        <Stack spacing={3} sx={{ p: 3 }}>
          <Field.Text name="description" label={t('finance.description', { defaultValue: 'Descrição' })} />
          <Box
            display="grid"
            gap={2}
            gridTemplateColumns={{ xs: '1fr', sm: 'repeat(2, 1fr)' }}
          >
            <Field.Select name="category" label={t('finance.category', { defaultValue: 'Categoria' })}>
              {CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {t(`finance.categories.${c}`, { defaultValue: c })}
                </MenuItem>
              ))}
            </Field.Select>
            <Field.Text name="amount" label={t('finance.amount', { defaultValue: 'Valor' })} type="number" />
            <Field.DatePicker name="startDate" label={t('finance.dateStart', { defaultValue: 'Início' })} />
            <Field.DatePicker name="dueDate" label={t('finance.dueDate', { defaultValue: 'Vencimento' })} />
            <Field.DatePicker
              name="competenceDate"
              label={t('dre.competenceDate', { defaultValue: 'Data de competência' })}
            />
            <Field.Select
              name="dreClass"
              label={t('dre.dreClass', { defaultValue: 'Classificação DRE' })}
            >
              <MenuItem value="">
                {t('dre.dreClassAuto', { defaultValue: 'Automático (categoria)' })}
              </MenuItem>
              {DRE_CLASSES.map((c) => (
                <MenuItem key={c} value={c}>
                  {t(`dre.dreClassOptions.${c}`, { defaultValue: c })}
                </MenuItem>
              ))}
            </Field.Select>
            <Field.Text name="supplierName" label={t('finance.supplierName', { defaultValue: 'Fornecedor' })} />
            <Field.Select name="recurrence" label={t('finance.recurrence', { defaultValue: 'Recorrência' })}>
              <MenuItem value="none">{t('finance.recurrenceNone', { defaultValue: 'Nenhuma' })}</MenuItem>
              <MenuItem value="weekly">{t('finance.recurrenceWeekly', { defaultValue: 'Semanal' })}</MenuItem>
              <MenuItem value="monthly">{t('finance.recurrenceMonthly', { defaultValue: 'Mensal' })}</MenuItem>
            </Field.Select>
            {recurrence !== 'none' && !isEdit && (
              <Field.Text
                name="installmentCount"
                type="number"
                label={t('finance.installmentCount', { defaultValue: 'Nº de parcelas' })}
                helperText={t('finance.installmentCountHint', {
                  defaultValue: 'Valor informado é o total a dividir (máx. 24)',
                })}
                inputProps={{ min: 2, max: 24, step: 1 }}
              />
            )}
            <Field.Select name="status" label={t('finance.status', { defaultValue: 'Status' })}>
              <MenuItem value="open">{t('finance.statusOpen', { defaultValue: 'Em aberto' })}</MenuItem>
              <MenuItem value="paid">{t('finance.statusPaid', { defaultValue: 'Pago' })}</MenuItem>
              <MenuItem value="cancelled">{t('finance.statusCancelled', { defaultValue: 'Cancelado' })}</MenuItem>
            </Field.Select>
          </Box>
          <Field.Switch name="active" label={t('finance.active', { defaultValue: 'Ativo' })} />
          <Stack direction="row" justifyContent="flex-end">
            <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
              {isEdit ? t('common.save', { defaultValue: 'Salvar' }) : t('common.create', { defaultValue: 'Criar' })}
            </LoadingButton>
          </Stack>
        </Stack>
      </Card>
    </Form>
  );
}

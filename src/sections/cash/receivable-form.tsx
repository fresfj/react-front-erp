import type { Customer } from 'src/api/firestore/customers';
import type { Receivable } from 'src/api/firestore/receivables';
import type {
  FinancialStatus,
  FinancialCategory,
  FinancialRecurrence,
} from 'src/api/firestore/payables';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listCustomers } from 'src/api/firestore/customers';
import { updateReceivable, createReceivableWithInstallments } from 'src/api/firestore/receivables';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

import { CustomerListDialog } from 'src/sections/customer/customer-list-dialog';
import { CustomerQuickNewDialog } from 'src/sections/customer/customer-quick-new-dialog';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const Schema = zod.object({
  description: zod.string().min(1),
  category: zod.enum(['utilities_power', 'utilities_internet', 'rent', 'supplier', 'tax', 'other']),
  amount: zod.coerce.number().positive(),
  startDate: zod.string().min(1),
  dueDate: zod.string().min(1),
  customerId: zod.string().optional().or(zod.literal('')),
  customerName: zod.string().optional().or(zod.literal('')),
  recurrence: zod.enum(['none', 'weekly', 'monthly']),
  installmentCount: zod.coerce.number().int().min(1).max(24),
  status: zod.enum(['open', 'paid', 'cancelled']),
  active: zod.boolean(),
});

type SchemaType = zod.infer<typeof Schema>;

type Props = { current?: Receivable };

const CATEGORIES: FinancialCategory[] = [
  'utilities_power',
  'utilities_internet',
  'rent',
  'supplier',
  'tax',
  'other',
];

export function ReceivableForm({ current }: Props) {
  const router = useRouter();
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;
  const isEdit = Boolean(current);

  const customerPicker = useBoolean();
  const customerQuickNew = useBoolean();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const defaultValues = useMemo<SchemaType>(
    () => ({
      description: current?.description || '',
      category: current?.category || 'other',
      amount: current?.amount || 0,
      startDate: current?.startDate || '',
      dueDate: current?.dueDate || '',
      customerId: current?.customerId || '',
      customerName: current?.customerName || '',
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
    setValue,
    watch,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const customerId = watch('customerId');
  const customerName = watch('customerName');
  const recurrence = watch('recurrence');

  useEffect(() => {
    if (current) reset(defaultValues);
  }, [current, defaultValues, reset]);

  useEffect(() => {
    if (!enterpriseId) return;
    listCustomers(enterpriseId)
      .then((rows) => {
        setCustomers(rows.filter((c) => c.active));
        if (current?.customerId) {
          setSelectedCustomer(rows.find((c) => c.id === current.customerId) || null);
        }
      })
      .catch((error) => console.error(error));
  }, [current?.customerId, enterpriseId]);

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) return;
    try {
      if (isEdit && current) {
        await updateReceivable(enterpriseId, current.id, {
          description: data.description.trim(),
          category: data.category as FinancialCategory,
          amount: Number(data.amount),
          startDate: data.startDate,
          dueDate: data.dueDate,
          customerId: data.customerId?.trim() || undefined,
          customerName: data.customerName?.trim() || undefined,
          recurrence: data.recurrence as FinancialRecurrence,
          status: data.status as FinancialStatus,
          active: data.active,
        });
        toast.success(t('finance.receivableUpdateSuccess', { defaultValue: 'Conta atualizada' }));
      } else {
        await createReceivableWithInstallments(enterpriseId, {
          description: data.description.trim(),
          category: data.category as FinancialCategory,
          amount: Number(data.amount),
          startDate: data.startDate,
          dueDate: data.dueDate,
          customerId: data.customerId?.trim() || undefined,
          customerName: data.customerName?.trim() || undefined,
          customerCurrentDebt: selectedCustomer?.currentDebt ?? 0,
          recurrence: data.recurrence as FinancialRecurrence,
          installmentCount: data.recurrence === 'none' ? 1 : Number(data.installmentCount),
          status: data.status as FinancialStatus,
          active: data.active,
        });
        toast.success(t('finance.receivableCreateSuccess', { defaultValue: 'Conta criada' }));
      }
      router.push(paths.dashboard.cash.receivables);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao salvar'));
    }
  });

  const handleSelectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    setValue('customerId', customer?.id || '', { shouldDirty: true });
    setValue('customerName', customer?.name || '', { shouldDirty: true });
  };

  return (
    <>
      <Form methods={methods} onSubmit={onSubmit}>
        <Card sx={{ mx: 'auto', maxWidth: 880 }}>
          <CardHeader
            title={t('finance.receivableForm', { defaultValue: 'Conta a receber' })}
            sx={{ mb: 2 }}
          />
          <Divider />
          <Stack spacing={3} sx={{ p: 3 }}>
            <Field.Text
              name="description"
              label={t('finance.description', { defaultValue: 'Descrição' })}
            />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('finance.customerName', { defaultValue: 'Cliente' })}
              </Typography>
              <Button
                fullWidth
                variant="outlined"
                color="inherit"
                onClick={customerPicker.onTrue}
                startIcon={<Iconify icon="solar:user-bold" width={20} />}
                endIcon={<Iconify icon="eva:arrow-ios-downward-fill" width={16} />}
                sx={{
                  justifyContent: 'space-between',
                  typography: 'body2',
                  py: 1.5,
                  ...(customerId && { bgcolor: 'action.selected' }),
                }}
              >
                <Box sx={{ textAlign: 'left' }}>
                  {selectedCustomer || customerName ? (
                    <>
                      <Typography variant="subtitle2">
                        {selectedCustomer?.name || customerName}
                      </Typography>
                      {selectedCustomer && (
                        <Typography variant="caption" color="text.secondary">
                          {[selectedCustomer.document, selectedCustomer.phone]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </Typography>
                      )}
                    </>
                  ) : (
                    t('finance.selectCustomer', { defaultValue: 'Selecionar cliente' })
                  )}
                </Box>
              </Button>
              {selectedCustomer && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t('customers.fields.currentDebt', { defaultValue: 'Débito atual' })}:
                  </Typography>
                  <Label
                    variant="soft"
                    color={selectedCustomer.currentDebt > 0 ? 'error' : 'success'}
                  >
                    {fCurrency(selectedCustomer.currentDebt)}
                  </Label>
                </Stack>
              )}
              <Field.Text name="customerId" sx={{ display: 'none' }} />
              <Field.Text name="customerName" sx={{ display: 'none' }} />
            </Box>

            <Box
              display="grid"
              gap={2}
              gridTemplateColumns={{ xs: '1fr', sm: 'repeat(2, 1fr)' }}
            >
              <Field.Select
                name="category"
                label={t('finance.category', { defaultValue: 'Categoria' })}
              >
                {CATEGORIES.map((c) => (
                  <MenuItem key={c} value={c}>
                    {t(`finance.categories.${c}`, { defaultValue: c })}
                  </MenuItem>
                ))}
              </Field.Select>
              <Field.Text
                name="amount"
                label={t('finance.amount', { defaultValue: 'Valor' })}
                type="number"
              />
              <Field.DatePicker
                name="startDate"
                label={t('finance.dateStart', { defaultValue: 'Início' })}
              />
              <Field.DatePicker
                name="dueDate"
                label={t('finance.dueDate', { defaultValue: 'Vencimento' })}
              />
              <Field.Select
                name="recurrence"
                label={t('finance.recurrence', { defaultValue: 'Recorrência' })}
              >
                <MenuItem value="none">
                  {t('finance.recurrenceNone', { defaultValue: 'Nenhuma' })}
                </MenuItem>
                <MenuItem value="weekly">
                  {t('finance.recurrenceWeekly', { defaultValue: 'Semanal' })}
                </MenuItem>
                <MenuItem value="monthly">
                  {t('finance.recurrenceMonthly', { defaultValue: 'Mensal' })}
                </MenuItem>
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
                <MenuItem value="open">
                  {t('finance.statusOpen', { defaultValue: 'Em aberto' })}
                </MenuItem>
                <MenuItem value="paid">
                  {t('finance.statusPaid', { defaultValue: 'Recebido' })}
                </MenuItem>
                <MenuItem value="cancelled">
                  {t('finance.statusCancelled', { defaultValue: 'Cancelado' })}
                </MenuItem>
              </Field.Select>
            </Box>
            <Field.Switch name="active" label={t('finance.active', { defaultValue: 'Ativo' })} />
            <Stack direction="row" justifyContent="flex-end">
              <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
                {isEdit
                  ? t('common.save', { defaultValue: 'Salvar' })
                  : t('common.create', { defaultValue: 'Criar' })}
              </LoadingButton>
            </Stack>
          </Stack>
        </Card>
      </Form>

      <CustomerListDialog
        list={customers}
        open={customerPicker.value}
        onClose={customerPicker.onFalse}
        selected={(id) => id === customerId}
        onSelect={handleSelectCustomer}
        action={
          <Button
            size="small"
            startIcon={<Iconify icon="mingcute:add-line" />}
            onClick={() => {
              customerPicker.onFalse();
              customerQuickNew.onTrue();
            }}
          >
            {t('customers.newCustomer', { defaultValue: 'Novo cliente' })}
          </Button>
        }
      />

      <CustomerQuickNewDialog
        open={customerQuickNew.value}
        onClose={customerQuickNew.onFalse}
        onCreated={(customer) => {
          setCustomers((prev) => [customer, ...prev]);
          handleSelectCustomer(customer);
          customerQuickNew.onFalse();
        }}
      />
    </>
  );
}

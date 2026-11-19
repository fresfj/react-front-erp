import type { Enterprise, ReceiptModelType } from 'src/api/firestore/platform';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { useMemo, useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';

import { useBoolean } from 'src/hooks/use-boolean';
import { useCepLookup } from 'src/hooks/use-cep-lookup';
import { useCnpjLookup } from 'src/hooks/use-cnpj-lookup';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { formatCep, digitsOnly, formatCnpj } from 'src/utils/br-docs';

import {
  getEnterprise,
  updateEnterpriseSettings,
} from 'src/api/firestore/platform';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';

import { useAuthContext } from 'src/auth/hooks';

import { AccountOnlineStoreForm } from './account-online-store-form';

// ----------------------------------------------------------------------

const numberOrZero = zod.preprocess(
  (val) => (val === '' || val === null || val === undefined ? 0 : Number(val)),
  zod.number().min(0).default(0)
);

export const AccountCompanySchema = zod.object({
  name: zod.string().min(1, { message: 'Razão social obrigatória' }),
  tradeName: zod.string().optional().or(zod.literal('')),
  document: zod
    .string()
    .min(1, { message: 'CNPJ obrigatório' })
    .refine((v) => digitsOnly(v).length === 14, { message: 'CNPJ deve ter 14 dígitos' }),
  stateRegistration: zod.string().optional().or(zod.literal('')),
  phone: zod.string().optional().or(zod.literal('')),
  zipCode: zod.string().optional().or(zod.literal('')),
  address: zod.string().optional().or(zod.literal('')),
  addressNumber: zod.string().optional().or(zod.literal('')),
  complement: zod.string().optional().or(zod.literal('')),
  neighborhood: zod.string().optional().or(zod.literal('')),
  city: zod.string().optional().or(zod.literal('')),
  state: zod.string().optional().or(zod.literal('')),
  // Fiscal / NFC-e / Cupom settings
  nfceSeries: zod.string().min(1, { message: 'Série obrigatória' }),
  nfceEnvironment: zod.enum(['homologation', 'production']),
  receiptDefaultModel: zod.enum(['58mm', '80mm', 'a5']),
  receiptFooterMessage: zod.string().optional().or(zod.literal('')),
  receiptBold: zod.boolean(),
  receiptShowLogo: zod.boolean(),
  // Taxas e Custos de Pagamento e Entrega (DRE)
  defaultDeliveryFee: numberOrZero,
  passPaymentFeesToCustomer: zod.boolean().default(false),
  creditCardFeeRate: numberOrZero,
  creditCardInstallmentFeeRate: numberOrZero,
  debitCardFeeRate: numberOrZero,
  pixFeeRate: numberOrZero,
  pixFeeFixed: numberOrZero,
  creditTabFeeRate: numberOrZero,
  minInstallmentAmount: numberOrZero,
});

export type AccountCompanySchemaType = zod.infer<typeof AccountCompanySchema>;

// ----------------------------------------------------------------------

export function AccountCompanyForm() {
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);

  const openGeneral = useBoolean(true);
  const openAddress = useBoolean(true);
  const openFiscal = useBoolean(true);
  const openFees = useBoolean(true);

  const canEdit =
    Boolean(user?.platformAdmin) ||
    user?.role === 'admin' ||
    user?.role === 'gestor';

  const defaultValues = useMemo<AccountCompanySchemaType>(
    () => ({
      name: enterprise?.name || '',
      tradeName: enterprise?.tradeName || '',
      document: formatCnpj(enterprise?.document || ''),
      stateRegistration: enterprise?.stateRegistration || '',
      phone: enterprise?.phone || '',
      zipCode: formatCep(enterprise?.zipCode || ''),
      address: enterprise?.address || '',
      addressNumber: enterprise?.addressNumber || '',
      complement: enterprise?.complement || '',
      neighborhood: enterprise?.neighborhood || '',
      city: enterprise?.city || '',
      state: enterprise?.state || '',
      nfceSeries: enterprise?.nfceSeries || '1',
      nfceEnvironment: enterprise?.nfceEnvironment || 'homologation',
      receiptDefaultModel: enterprise?.receiptDefaultModel || '58mm',
      receiptFooterMessage:
        enterprise?.receiptFooterMessage || 'OBRIGADO PELA PREFERÊNCIA! VOLTE SEMPRE',
      receiptBold: enterprise?.receiptBold ?? true,
      receiptShowLogo: enterprise?.receiptShowLogo ?? true,
      defaultDeliveryFee: enterprise?.defaultDeliveryFee ?? 0,
      passPaymentFeesToCustomer: enterprise?.passPaymentFeesToCustomer ?? false,
      creditCardFeeRate: enterprise?.creditCardFeeRate ?? 2.15,
      creditCardInstallmentFeeRate: enterprise?.creditCardInstallmentFeeRate ?? 1.5,
      debitCardFeeRate: enterprise?.debitCardFeeRate ?? 1.29,
      pixFeeRate: enterprise?.pixFeeRate ?? 0,
      pixFeeFixed: enterprise?.pixFeeFixed ?? 0,
      creditTabFeeRate: enterprise?.creditTabFeeRate ?? 0,
      minInstallmentAmount: enterprise?.minInstallmentAmount ?? 15,
    }),
    [enterprise]
  );

  const methods = useForm<AccountCompanySchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(AccountCompanySchema),
    defaultValues,
  });

  const {
    reset,
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const zipCodeWatch = watch('zipCode') || '';
  const documentWatch = watch('document') || '';

  // Load Enterprise data
  useEffect(() => {
    if (!enterpriseId) {
      setLoading(false);
      return;
    }
    getEnterprise(enterpriseId)
      .then((data) => {
        setEnterprise(data);
        if (data) {
          reset({
            name: data.name || '',
            tradeName: data.tradeName || '',
            document: formatCnpj(data.document || ''),
            stateRegistration: data.stateRegistration || '',
            phone: data.phone || '',
            zipCode: formatCep(data.zipCode || ''),
            address: data.address || '',
            addressNumber: data.addressNumber || '',
            complement: data.complement || '',
            neighborhood: data.neighborhood || '',
            city: data.city || '',
            state: data.state || '',
            nfceSeries: data.nfceSeries || '1',
            nfceEnvironment: data.nfceEnvironment || 'homologation',
            receiptDefaultModel: data.receiptDefaultModel || '58mm',
            receiptFooterMessage:
              data.receiptFooterMessage || 'OBRIGADO PELA PREFERÊNCIA! VOLTE SEMPRE',
            receiptBold: data.receiptBold ?? true,
            receiptShowLogo: data.receiptShowLogo ?? true,
            defaultDeliveryFee: data.defaultDeliveryFee ?? 0,
            passPaymentFeesToCustomer: data.passPaymentFeesToCustomer ?? false,
            creditCardFeeRate: data.creditCardFeeRate ?? 2.15,
            creditCardInstallmentFeeRate: data.creditCardInstallmentFeeRate ?? 1.5,
            debitCardFeeRate: data.debitCardFeeRate ?? 1.29,
            pixFeeRate: data.pixFeeRate ?? 0,
            pixFeeFixed: data.pixFeeFixed ?? 0,
            creditTabFeeRate: data.creditTabFeeRate ?? 0,
            minInstallmentAmount: data.minInstallmentAmount ?? 15,
          });
        }
      })
      .catch((err) => {
        console.error(err);
        toast.error('Erro ao carregar dados da empresa');
      })
      .finally(() => setLoading(false));
  }, [enterpriseId, reset]);

  // Cep auto-lookup
  const { handleBlur: handleCepBlur } = useCepLookup({
    cep: zipCodeWatch,
    initialValue: enterprise?.zipCode,
    onSuccess: (fields) => {
      setValue('zipCode', formatCep(fields.zipCode), { shouldDirty: true });
      if (fields.address) setValue('address', fields.address, { shouldDirty: true });
      if (fields.neighborhood) setValue('neighborhood', fields.neighborhood, { shouldDirty: true });
      if (fields.city) setValue('city', fields.city, { shouldDirty: true });
      if (fields.state) setValue('state', fields.state, { shouldDirty: true });
    },
  });

  // CNPJ auto-lookup
  const { handleBlur: handleCnpjBlur } = useCnpjLookup({
    document: documentWatch,
    initialValue: enterprise?.document,
    onSuccess: (fields) => {
      if (fields.name) setValue('name', fields.name, { shouldDirty: true });
      if (fields.tradeName) setValue('tradeName', fields.tradeName, { shouldDirty: true });
      if (fields.phone) setValue('phone', fields.phone, { shouldDirty: true });
      if (fields.zipCode) setValue('zipCode', formatCep(fields.zipCode), { shouldDirty: true });
      if (fields.address) setValue('address', fields.address, { shouldDirty: true });
      if (fields.addressNumber) setValue('addressNumber', fields.addressNumber, { shouldDirty: true });
      if (fields.complement) setValue('complement', fields.complement, { shouldDirty: true });
      if (fields.neighborhood) setValue('neighborhood', fields.neighborhood, { shouldDirty: true });
      if (fields.city) setValue('city', fields.city, { shouldDirty: true });
      if (fields.state) setValue('state', fields.state, { shouldDirty: true });
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) return;

    try {
      await updateEnterpriseSettings(enterpriseId, {
        name: data.name,
        tradeName: data.tradeName || undefined,
        document: digitsOnly(data.document),
        stateRegistration: data.stateRegistration || undefined,
        phone: data.phone || undefined,
        zipCode: digitsOnly(data.zipCode) || undefined,
        address: data.address || undefined,
        addressNumber: data.addressNumber || undefined,
        complement: data.complement || undefined,
        neighborhood: data.neighborhood || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        nfceSeries: data.nfceSeries,
        nfceEnvironment: data.nfceEnvironment,
        receiptDefaultModel: data.receiptDefaultModel as ReceiptModelType,
        receiptFooterMessage: data.receiptFooterMessage || undefined,
        receiptBold: data.receiptBold,
        receiptShowLogo: data.receiptShowLogo,
        defaultDeliveryFee: Number(data.defaultDeliveryFee ?? 0),
        passPaymentFeesToCustomer: data.passPaymentFeesToCustomer,
        creditCardFeeRate: Number(data.creditCardFeeRate ?? 0),
        creditCardInstallmentFeeRate: Number(data.creditCardInstallmentFeeRate ?? 0),
        debitCardFeeRate: Number(data.debitCardFeeRate ?? 0),
        pixFeeRate: Number(data.pixFeeRate ?? 0),
        pixFeeFixed: Number(data.pixFeeFixed ?? 0),
        creditTabFeeRate: Number(data.creditTabFeeRate ?? 0),
        minInstallmentAmount: Number(data.minInstallmentAmount ?? 15),
      });

      toast.success('Configurações da empresa e taxas atualizadas com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao atualizar dados da empresa'));
    }
  });

  const renderCollapseAction = (open: boolean, onToggle: () => void) => (
    <IconButton onClick={onToggle}>
      <Iconify icon={open ? 'eva:arrow-ios-downward-fill' : 'eva:arrow-ios-forward-fill'} />
    </IconButton>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3} sx={{ mx: 'auto', maxWidth: { xs: 720, xl: 880 } }}>
    <Form methods={methods} onSubmit={onSubmit}>
      <Stack spacing={3}>
        {/* Card 1: Dados Principais da Empresa */}
        <Card>
          <CardHeader
            title="Dados da Empresa (Emissor Fiscal)"
            subheader="Razão Social, Nome Fantasia e CNPJ que constam no Cupom Fiscal e NFC-e"
            action={renderCollapseAction(openGeneral.value, openGeneral.onToggle)}
            sx={{ mb: 3 }}
          />
          <Collapse in={openGeneral.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
              >
                <Field.Text
                  name="document"
                  label="CNPJ"
                  disabled={!canEdit}
                  placeholder="00.000.000/0000-00"
                  value={formatCnpj(documentWatch)}
                  onChange={(event) => {
                    setValue('document', formatCnpj(event.target.value), { shouldDirty: true });
                  }}
                  onBlur={handleCnpjBlur}
                  helperText="Preenchimento automático de dados cadastrais via BrasilAPI ao sair do campo"
                />

                <Field.Text
                  name="stateRegistration"
                  label="Inscrição Estadual (IE)"
                  disabled={!canEdit}
                  placeholder="Ex: 123456789 ou ISENTO"
                />

                <Field.Text
                  name="name"
                  label="Razão Social"
                  disabled={!canEdit}
                  helperText="Nome jurídico oficial registrado na Receita Federal"
                />

                <Field.Text
                  name="tradeName"
                  label="Nome Fantasia"
                  disabled={!canEdit}
                  helperText="Nome comercial exibido no topo do Cupom / Recibo"
                />

                <Field.Phone
                  name="phone"
                  label="Telefone de Contato"
                  disabled={!canEdit}
                  country="BR"
                />
              </Box>
            </Stack>
          </Collapse>
        </Card>

        {/* Card 2: Endereço Fiscal */}
        <Card>
          <CardHeader
            title="Endereço da Empresa"
            subheader="Endereço oficial que sai impresso no cabeçalho do Cupom Fiscal e da DANFE NFC-e"
            action={renderCollapseAction(openAddress.value, openAddress.onToggle)}
            sx={{ mb: 3 }}
          />
          <Collapse in={openAddress.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: '1fr 2fr 1fr' }}
              >
                <Field.Text
                  name="zipCode"
                  label="CEP"
                  disabled={!canEdit}
                  placeholder="00000-000"
                  value={formatCep(zipCodeWatch)}
                  onChange={(event) => {
                    setValue('zipCode', formatCep(event.target.value), { shouldDirty: true });
                  }}
                  onBlur={handleCepBlur}
                />
                <Field.Text name="address" label="Logradouro" disabled={!canEdit} />
                <Field.Text name="addressNumber" label="Número" disabled={!canEdit} />
              </Box>

              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(4, 1fr)' }}
              >
                <Field.Text name="neighborhood" label="Bairro" disabled={!canEdit} />
                <Field.Text name="complement" label="Complemento" disabled={!canEdit} />
                <Field.Text name="city" label="Cidade" disabled={!canEdit} />
                <Field.Text name="state" label="UF" disabled={!canEdit} />
              </Box>
            </Stack>
          </Collapse>
        </Card>

        {/* Card 3: Configurações de Impressão e Cupom Fiscal / NFC-e */}
        <Card>
          <CardHeader
            title="Configuração do Cupom Fiscal / NFC-e"
            subheader="Definições da impressora padrão, ambiente fiscal SEFAZ e mensagem personalizada"
            action={renderCollapseAction(openFiscal.value, openFiscal.onToggle)}
            sx={{ mb: 3 }}
          />
          <Collapse in={openFiscal.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(3, 1fr)' }}
              >
                <Field.Select
                  name="receiptDefaultModel"
                  label="Modelo de Impressão Padrão"
                  disabled={!canEdit}
                >
                  <MenuItem value="58mm">🧾 Cupom Térmico (58mm)</MenuItem>
                  <MenuItem value="80mm">🧾 Cupom Térmico (80mm)</MenuItem>
                  <MenuItem value="a5">📄 Recibo A5 (Meia A4)</MenuItem>
                </Field.Select>

                <Field.Text
                  name="nfceSeries"
                  label="Série da NFC-e"
                  disabled={!canEdit}
                  placeholder="Ex: 1"
                  helperText="Série autorizada para emissão de NFC-e"
                />

                <Field.Select
                  name="nfceEnvironment"
                  label="Ambiente SEFAZ"
                  disabled={!canEdit}
                >
                  <MenuItem value="homologation">Homologação (Testes)</MenuItem>
                  <MenuItem value="production">Produção (Com valor fiscal)</MenuItem>
                </Field.Select>
              </Box>

              <Field.Text
                name="receiptFooterMessage"
                label="Mensagem de Rodapé do Cupom"
                disabled={!canEdit}
                multiline
                rows={2}
                placeholder="Ex: OBRIGADO PELA PREFERÊNCIA! VOLTE SEMPRE"
                helperText="Texto que será impresso no final de todos os cupons e recibos"
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                <Field.Switch
                  name="receiptBold"
                  label="Imprimir em Negrito Forte por padrão"
                  disabled={!canEdit}
                  helperText="Recomendado para melhor contraste em impressoras térmicas"
                />
                <Field.Switch
                  name="receiptShowLogo"
                  label="Exibir Logotipo no Cupom"
                  disabled={!canEdit}
                  helperText="Imprime o logotipo no cabeçalho do recibo"
                />
              </Stack>
            </Stack>
          </Collapse>
        </Card>

        {/* Card 4: Taxas de Pagamento (Maquininha) & Custos de Entrega (DRE) */}
        <Card>
          <CardHeader
            title="Taxas de Pagamento (Maquininha) & Custos de Entrega"
            subheader="Configure as taxas cobradas por operadoras de cartão/PIX para apuração automática de despesas no DRE"
            action={renderCollapseAction(openFees.value, openFees.onToggle)}
            sx={{ mb: 3 }}
          />
          <Collapse in={openFees.value}>
            <Divider />
            <Stack spacing={3} sx={{ p: 3 }}>
              {/* Repassar ou Absorver no DRE */}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: 'background.neutral',
                  border: (theme) => `1px dashed ${theme.vars.palette.divider}`,
                }}
              >
                <Field.Switch
                  name="passPaymentFeesToCustomer"
                  label="Repassar taxa de pagamento ao cliente (acrescentar no total)"
                  disabled={!canEdit}
                  helperText="Desmarcado: a taxa é uma despesa da loja e aparece deduzida no DRE. Marcado: a taxa é acrescentada no valor final pago pelo cliente."
                />
              </Box>

              <Box
                columnGap={2}
                rowGap={3}
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }}
              >
                <Field.Text
                  type="number"
                  name="defaultDeliveryFee"
                  label="Taxa de Entrega Padrão (R$)"
                  disabled={!canEdit}
                  placeholder="0.00"
                  helperText="Valor fixo padrão para entregas"
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">R$</InputAdornment>,
                  }}
                />

                <Field.Text
                  type="number"
                  name="creditCardFeeRate"
                  label="Taxa Crédito à vista (%)"
                  disabled={!canEdit}
                  placeholder="2.15"
                  helperText="Ex: 2.15% por transação"
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />

                <Field.Text
                  type="number"
                  name="creditCardInstallmentFeeRate"
                  label="Taxa Crédito Parcelado (+%/mês)"
                  disabled={!canEdit}
                  placeholder="1.50"
                  helperText="Adicional por parcela"
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />

                <Field.Text
                  type="number"
                  name="debitCardFeeRate"
                  label="Taxa Débito (%)"
                  disabled={!canEdit}
                  placeholder="1.29"
                  helperText="Ex: 1.29% por transação"
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />

                <Field.Text
                  type="number"
                  name="pixFeeRate"
                  label="Taxa PIX (%)"
                  disabled={!canEdit}
                  placeholder="0.00"
                  helperText="Percentual sobre o PIX"
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />

                <Field.Text
                  type="number"
                  name="pixFeeFixed"
                  label="Taxa Fixa PIX (R$)"
                  disabled={!canEdit}
                  placeholder="0.00"
                  helperText="Tarifa fixa por PIX recebido"
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">R$</InputAdornment>,
                  }}
                />

                <Field.Text
                  type="number"
                  name="creditTabFeeRate"
                  label="Taxa Crediário / Fiado (%)"
                  disabled={!canEdit}
                  placeholder="0.00"
                  helperText="Custo de cobrança / risco"
                  inputProps={{ min: 0, step: 'any' }}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />

                <Field.Text
                  type="number"
                  name="minInstallmentAmount"
                  label="Parcela Mínima (R$)"
                  disabled={!canEdit}
                  placeholder="15.00"
                  helperText="Valor mínimo permitido"
                  inputProps={{ min: 1, step: 'any' }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">R$</InputAdornment>,
                  }}
                />
              </Box>

              {/* Informative explanation matching user example */}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  bgcolor: 'info.lighter',
                  color: 'info.darker',
                  typography: 'body2',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Iconify icon="solar:info-circle-bold" width={20} sx={{ mt: 0.25, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'inherit' }}>
                      Como as taxas influenciam o PDV e o DRE:
                    </Typography>
                    <div>
                      • <strong>Desmarcado (Padrão):</strong> O cliente paga o valor normal dos produtos. As taxas de maquininha são absorvidas pela loja e registradas no DRE como despesa operacional de intermediação de vendas.
                    </div>
                    <div>
                      • <strong>Marcado (Repassar taxa):</strong> O percentual da maquininha é acrescido diretamente no valor total da venda a ser pago pelo cliente.
                    </div>
                    <div>
                      • <strong>Valor Fixo de Entrega:</strong> Quando a modalidade &quot;Entrega&quot; for escolhida no PDV, o valor acima será sugerido automaticamente.
                    </div>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </Collapse>
        </Card>

        {canEdit && (
          <Stack direction="row" justifyContent="flex-end">
            <LoadingButton
              type="submit"
              variant="contained"
              size="large"
              loading={isSubmitting}
            >
              Salvar Configurações da Empresa
            </LoadingButton>
          </Stack>
        )}
      </Stack>
    </Form>

      <AccountOnlineStoreForm
        enterprise={enterprise}
        canEdit={canEdit}
        onSaved={async () => {
          if (!enterpriseId) return;
          const next = await getEnterprise(enterpriseId);
          setEnterprise(next);
        }}
      />
    </Stack>
  );
}

import type { Enterprise } from 'src/api/firestore/platform';
import type { CreditCardInput, BillingAddressInput } from 'src/api/firestore/billing';

import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';

import { useBoolean } from 'src/hooks/use-boolean';
import { useCepLookup } from 'src/hooks/use-cep-lookup';

import { formatCep, digitsOnly } from 'src/utils/br-docs';

import { useTranslate } from 'src/locales';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

export type BillingAddressInfo = Required<
  Pick<
    BillingAddressInput,
    'name' | 'phone' | 'zipCode' | 'address' | 'addressNumber' | 'neighborhood' | 'city' | 'state'
  >
> & {
  complement?: string;
};

export type SavedBillingCard = {
  id: string;
  cardType: 'visa' | 'mastercard';
  cardNumber: string;
  holderName: string;
  expiryMonth: string;
  expiryYear: string;
  primary: boolean;
  creditCardToken?: string | null;
  creditCard?: CreditCardInput;
  billingAddress: BillingAddressInfo;
  useCompanyAddress: boolean;
};

export function formatBillingAddressLine(addr?: Partial<BillingAddressInfo> | null): string {
  if (!addr) return '';
  return [
    addr.address,
    addr.addressNumber,
    addr.complement,
    addr.neighborhood,
    addr.city,
    addr.state,
    addr.zipCode ? formatCep(addr.zipCode) : '',
  ]
    .filter(Boolean)
    .join(', ');
}

export function extractCompanyBillingAddress(enterprise?: Enterprise | null): BillingAddressInfo {
  return {
    name: enterprise?.name || enterprise?.tradeName || '',
    phone: enterprise?.phone || '',
    zipCode: enterprise?.zipCode || '',
    address: enterprise?.address || '',
    addressNumber: enterprise?.addressNumber || '',
    complement: enterprise?.complement || '',
    neighborhood: enterprise?.neighborhood || '',
    city: enterprise?.city || '',
    state: enterprise?.state || '',
  };
}

function formatCardNumberDisplay(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatExpiryDisplay(digits: string) {
  const clean = digits.replace(/\D/g, '').slice(0, 4);
  if (clean.length <= 2) return clean;
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}`;
}

const NO_AUTOCOMPLETE_INPUT_PROPS = {
  autoComplete: 'new-password',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-form-type': 'other',
};

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  onClose: () => void;
  enterprise: Enterprise | null;
  onAddCard: (card: SavedBillingCard) => Promise<void> | void;
};

export function AccountBillingNewCardDialog({ open, onClose, enterprise, onAddCard }: Props) {
  const { t } = useTranslate('common');
  const showCvv = useBoolean();

  const companyAddr = extractCompanyBillingAddress(enterprise);
  const companyAddressLine = formatBillingAddressLine(companyAddr);
  const hasCompanyAddress = Boolean(companyAddr.address || companyAddr.zipCode || companyAddr.city);

  const [card, setCard] = useState<CreditCardInput>({
    holderName: '',
    number: '',
    expiryMonth: '',
    expiryYear: '',
    ccv: '',
  });
  const [expiryDigits, setExpiryDigits] = useState('');
  const [saving, setSaving] = useState(false);

  const [useCompanyAddress, setUseCompanyAddress] = useState<boolean>(true);
  const [customAddress, setCustomAddress] = useState<BillingAddressInfo>(companyAddr);

  useEffect(() => {
    if (open) {
      const freshCompany = extractCompanyBillingAddress(enterprise);
      setCard({
        holderName: '',
        number: '',
        expiryMonth: '',
        expiryYear: '',
        ccv: '',
      });
      setExpiryDigits('');
      setSaving(false);
      setUseCompanyAddress(
        Boolean(freshCompany.address || freshCompany.zipCode || freshCompany.city)
      );
      setCustomAddress(freshCompany);
      showCvv.onFalse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enterprise]);

  const { handleBlur: handleCepBlur } = useCepLookup({
    cep: customAddress.zipCode,
    onSuccess: (fields) => {
      setCustomAddress((prev) => ({
        ...prev,
        zipCode: formatCep(fields.zipCode),
        address: fields.address || prev.address,
        neighborhood: fields.neighborhood || prev.neighborhood,
        city: fields.city || prev.city,
        state: fields.state || prev.state,
      }));
    },
  });

  const patchCard = (partial: Partial<CreditCardInput>) => {
    setCard((prev) => ({ ...prev, ...partial }));
  };

  const patchAddress = (partial: Partial<BillingAddressInfo>) => {
    setCustomAddress((prev) => ({ ...prev, ...partial }));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    setExpiryDigits(raw);
    const month = raw.slice(0, 2);
    const yearShort = raw.slice(2, 4);
    const year = yearShort.length === 2 ? `20${yearShort}` : '';
    patchCard({ expiryMonth: month, expiryYear: year });
  };

  const handleToggleCustomAddress = () => {
    setUseCompanyAddress((prev) => {
      const next = !prev;
      if (!next) {
        setCustomAddress({
          name: companyAddr.name,
          phone: companyAddr.phone,
          zipCode: '',
          address: '',
          addressNumber: '',
          complement: '',
          neighborhood: '',
          city: '',
          state: '',
        });
      } else {
        setCustomAddress(companyAddr);
      }
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const cleanDigits = card.number.replace(/\D/g, '');
    const monthNum = Number(card.expiryMonth);

    if (
      !card.holderName.trim() ||
      cleanDigits.length < 13 ||
      expiryDigits.length < 4 ||
      monthNum < 1 ||
      monthNum > 12 ||
      !card.expiryYear ||
      card.expiryYear.length < 4 ||
      card.ccv.replace(/\D/g, '').length < 3
    ) {
      toast.error('Preencha todos os dados do cartão corretamente (incluindo validade MM/AA).');
      return;
    }

    const activeAddress: BillingAddressInfo = useCompanyAddress ? companyAddr : customAddress;

    if (!activeAddress.address.trim() && !digitsOnly(activeAddress.zipCode)) {
      toast.error('Informe o endereço de cobrança do cartão.');
      setUseCompanyAddress(false);
      return;
    }

    if (!useCompanyAddress) {
      if (
        !activeAddress.name.trim() ||
        digitsOnly(activeAddress.zipCode).length < 8 ||
        !activeAddress.address.trim() ||
        !activeAddress.addressNumber.trim() ||
        !activeAddress.city.trim() ||
        !activeAddress.state.trim()
      ) {
        toast.error('Preencha todos os campos obrigatórios do novo endereço de cobrança.');
        return;
      }
    }

    const last4 = cleanDigits.slice(-4);
    const cardType: 'visa' | 'mastercard' = cleanDigits.startsWith('4') ? 'visa' : 'mastercard';

    const newSavedCard: SavedBillingCard = {
      id: `card_${Date.now()}`,
      cardType,
      cardNumber: `**** **** **** ${last4}`,
      holderName: card.holderName.trim().toUpperCase(),
      expiryMonth: card.expiryMonth.padStart(2, '0'),
      expiryYear: card.expiryYear,
      primary: true,
      creditCardToken: null,
      creditCard: {
        holderName: card.holderName.trim().toUpperCase(),
        number: cleanDigits,
        expiryMonth: card.expiryMonth.padStart(2, '0'),
        expiryYear: card.expiryYear,
        ccv: card.ccv.replace(/\D/g, ''),
      },
      billingAddress: {
        ...activeAddress,
        zipCode: digitsOnly(activeAddress.zipCode),
      },
      useCompanyAddress,
    };

    setSaving(true);
    try {
      await onAddCard(newSavedCard);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog fullWidth maxWidth="sm" open={open} onClose={saving ? undefined : onClose}>
      <Box component="form" autoComplete="off" noValidate onSubmit={handleSubmit}>
        <DialogTitle>{t('billing.addNewCard')}</DialogTitle>

        <DialogContent sx={{ overflow: 'unset' }}>
          {/* Campos ocultos anti-autofill para navegadores baseados em Chromium */}
          <input
            type="text"
            name="prevent_autofill_user"
            autoComplete="username"
            style={{ display: 'none' }}
            tabIndex={-1}
            readOnly
          />
          <input
            type="password"
            name="prevent_autofill_pass"
            autoComplete="new-password"
            style={{ display: 'none' }}
            tabIndex={-1}
            readOnly
          />

          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              name="billing_cc_num_manual"
              autoComplete="off"
              label={t('billing.cardNumber')}
              placeholder="XXXX XXXX XXXX XXXX"
              value={formatCardNumberDisplay(card.number)}
              onChange={(e) => patchCard({ number: e.target.value.replace(/\D/g, '').slice(0, 16) })}
              InputLabelProps={{ shrink: true }}
              inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
            />

            <TextField
              fullWidth
              name="billing_cc_holder_manual"
              autoComplete="off"
              label={t('billing.cardHolder')}
              placeholder="JOHN DOE"
              value={card.holderName}
              onChange={(e) => patchCard({ holderName: e.target.value.toUpperCase() })}
              InputLabelProps={{ shrink: true }}
              inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
            />

            <Stack spacing={2} direction="row">
              <TextField
                fullWidth
                name="billing_cc_exp_manual"
                autoComplete="off"
                label={t('billing.expirationDate')}
                placeholder="MM/AA"
                value={formatExpiryDisplay(expiryDigits)}
                onChange={handleExpiryChange}
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  ...NO_AUTOCOMPLETE_INPUT_PROPS,
                  maxLength: 5,
                  inputMode: 'numeric',
                }}
              />

              <TextField
                fullWidth
                name="billing_cc_cvv_manual"
                autoComplete="off"
                label={t('billing.cvv')}
                placeholder="***"
                type={showCvv.value ? 'text' : 'password'}
                value={card.ccv}
                onChange={(e) => patchCard({ ccv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  ...NO_AUTOCOMPLETE_INPUT_PROPS,
                  maxLength: 4,
                  inputMode: 'numeric',
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={showCvv.onToggle} edge="end" size="small">
                        <Iconify
                          icon={showCvv.value ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                        />
                      </IconButton>
                      <Tooltip arrow title={t('billing.cvvHint')} placement="top">
                        <Box component="span" sx={{ display: 'inline-flex', ml: 0.5 }}>
                          <Iconify width={18} icon="eva:info-outline" />
                        </Box>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>

            <Divider sx={{ borderStyle: 'dashed' }} />

            {/* Seção de Endereço de Cobrança */}
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2">{t('billing.billingAddress')}</Typography>

                {hasCompanyAddress && (
                  <Button
                    size="small"
                    color="primary"
                    startIcon={
                      <Iconify
                        icon={useCompanyAddress ? 'solar:pen-bold' : 'eva:undo-fill'}
                        width={16}
                      />
                    }
                    onClick={handleToggleCustomAddress}
                  >
                    {useCompanyAddress
                      ? t('billing.changeBillingAddress')
                      : t('billing.keepCompanyAddress')}
                  </Button>
                )}
              </Stack>

              {/* Sempre exibe o endereço já cadastrado na empresa como referência padrão */}
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 1.5,
                  bgcolor: useCompanyAddress ? 'background.neutral' : 'transparent',
                  borderColor: useCompanyAddress ? 'primary.main' : 'divider',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2">
                    {companyAddr.name || t('billing.companyAddressRegistered')}
                  </Typography>
                  <Label color={useCompanyAddress ? 'info' : 'default'}>
                    {t('billing.companyAddressRegistered')}
                  </Label>
                </Stack>

                <Typography variant="body2" color="text.secondary">
                  {companyAddressLine || 'Endereço ainda não cadastrado na empresa.'}
                </Typography>

                {companyAddr.phone && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mt: 0.5 }}
                  >
                    {t('billing.billingPhone')}: {companyAddr.phone}
                  </Typography>
                )}
              </Paper>

              {/* Formulário de novo endereço de cobrança */}
              <Collapse in={!useCompanyAddress} unmountOnExit>
                <Stack spacing={2} sx={{ pt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t('billing.customBillingAddress')}
                  </Typography>

                  <Box
                    sx={{
                      gap: 2,
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    }}
                  >
                    <TextField
                      fullWidth
                      size="small"
                      name="billing_addr_name_manual"
                      autoComplete="off"
                      label={t('billing.billingName')}
                      value={customAddress.name}
                      onChange={(e) => patchAddress({ name: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      name="billing_addr_phone_manual"
                      autoComplete="off"
                      label={t('billing.billingPhone')}
                      placeholder="(00) 00000-0000"
                      value={customAddress.phone}
                      onChange={(e) => patchAddress({ phone: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
                    />
                  </Box>

                  <Box
                    sx={{
                      gap: 2,
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr 1fr' },
                    }}
                  >
                    <TextField
                      fullWidth
                      size="small"
                      name="billing_addr_zip_manual"
                      autoComplete="off"
                      label={t('account.fields.zipCode')}
                      placeholder="00000-000"
                      value={formatCep(customAddress.zipCode)}
                      onChange={(e) => patchAddress({ zipCode: formatCep(e.target.value) })}
                      onBlur={handleCepBlur}
                      InputLabelProps={{ shrink: true }}
                      inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      name="billing_addr_street_manual"
                      autoComplete="off"
                      label={t('account.fields.address')}
                      value={customAddress.address}
                      onChange={(e) => patchAddress({ address: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      name="billing_addr_num_manual"
                      autoComplete="off"
                      label={t('account.fields.addressNumber')}
                      value={customAddress.addressNumber}
                      onChange={(e) => patchAddress({ addressNumber: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
                    />
                  </Box>

                  <Box
                    sx={{
                      gap: 2,
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr 80px' },
                    }}
                  >
                    <TextField
                      fullWidth
                      size="small"
                      name="billing_addr_neigh_manual"
                      autoComplete="off"
                      label={t('account.fields.neighborhood')}
                      value={customAddress.neighborhood}
                      onChange={(e) => patchAddress({ neighborhood: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      name="billing_addr_comp_manual"
                      autoComplete="off"
                      label={t('account.fields.complement')}
                      value={customAddress.complement || ''}
                      onChange={(e) => patchAddress({ complement: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      name="billing_addr_city_manual"
                      autoComplete="off"
                      label={t('account.fields.city')}
                      value={customAddress.city}
                      onChange={(e) => patchAddress({ city: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
                    />

                    <TextField
                      fullWidth
                      size="small"
                      name="billing_addr_state_manual"
                      autoComplete="off"
                      label="UF"
                      value={customAddress.state}
                      onChange={(e) =>
                        patchAddress({ state: e.target.value.toUpperCase().slice(0, 2) })
                      }
                      InputLabelProps={{ shrink: true }}
                      inputProps={NO_AUTOCOMPLETE_INPUT_PROPS}
                    />
                  </Box>
                </Stack>
              </Collapse>
            </Stack>

            <Stack
              direction="row"
              alignItems="center"
              sx={{ typography: 'caption', color: 'text.disabled' }}
            >
              <Iconify icon="solar:lock-password-outline" sx={{ mr: 0.75 }} />
              {t('billing.sslSecured')}
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={onClose} disabled={saving}>
            {t('billing.cancel')}
          </Button>

          <LoadingButton type="submit" variant="contained" loading={saving}>
            {t('billing.add')}
          </LoadingButton>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

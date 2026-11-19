import type { Plan } from 'src/api/firestore/plans';
import type { Enterprise } from 'src/api/firestore/platform';

import { useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Unstable_Grid2';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { fCurrency } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';
import { PlanFreeIcon, PlanStarterIcon, PlanPremiumIcon } from 'src/assets/icons';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';

import {
  formatBillingAddressLine,
  extractCompanyBillingAddress,
} from './account-billing-new-card-dialog';

import type { SavedBillingCard } from './account-billing-new-card-dialog';

// ----------------------------------------------------------------------

type Props = {
  plans: Plan[];
  enterprise: Enterprise | null;
  confirmedPlanCode: string;
  selectedPlanId: string;
  paymentMethod: 'pix' | 'credit_card';
  selectedCard: SavedBillingCard | null;
  onSelectPlan: (planId: string) => void;
  onOpenPaymentModal: () => void;
  onUpgrade: () => void;
  onCancel: () => void;
  upgrading: boolean;
  paymentUrl?: string | null;
};

function planIcon(code: string) {
  if (code === 'free') return <PlanFreeIcon />;
  if (code === 'pro') return <PlanStarterIcon />;
  return <PlanPremiumIcon />;
}

export function AccountBillingPlan({
  plans,
  enterprise,
  confirmedPlanCode,
  selectedPlanId,
  paymentMethod,
  selectedCard,
  onSelectPlan,
  onOpenPaymentModal,
  onUpgrade,
  onCancel,
  upgrading,
  paymentUrl,
}: Props) {
  const { t } = useTranslate('common');
  const sub = enterprise?.subscription;
  const currentCode = confirmedPlanCode || 'free';

  const handleSelectPlan = useCallback(
    (plan: Plan) => {
      if (plan.code === currentCode) return;
      onSelectPlan(plan.id);
    },
    [currentCode, onSelectPlan]
  );

  const selected = plans.find((p) => p.id === selectedPlanId);
  const currentPlanObj = plans.find((p) => p.code === currentCode);
  const canUpgrade = Boolean(
    selected &&
      selected.code !== 'free' &&
      selected.priceMonthly > 0 &&
      selected.code !== currentCode
  );
  const canCancel = Boolean(currentCode !== 'free' && sub && !sub.cancelAtPeriodEnd);

  const companyAddr = extractCompanyBillingAddress(enterprise);
  const activeAddr =
    paymentMethod === 'credit_card' && selectedCard?.billingAddress
      ? selectedCard.billingAddress
      : companyAddr;

  const billingName = activeAddr.name || enterprise?.name || '—';
  const addressLine = formatBillingAddressLine(activeAddr) || '—';
  const billingPhone = activeAddr.phone || enterprise?.phone || '—';

  const paymentMethodLabel =
    paymentMethod === 'credit_card'
      ? selectedCard
        ? `${selectedCard.cardNumber} (${selectedCard.holderName})`
        : `${t('billing.fields.credit_card')} — ${t('billing.selectPaymentMethod')}`
      : `${t('billing.fields.pix')} (QR Code)`;

  return (
    <Card>
      <CardHeader title={t('billing.currentPlan')} />

      <Grid container spacing={2} sx={{ p: 3 }}>
        {plans.map((plan) => {
          const isCurrent = plan.code === currentCode;
          const isSelected = plan.id === selectedPlanId;
          return (
            <Grid key={plan.id} xs={12} md={4}>
              <Paper
                variant="outlined"
                onClick={() => handleSelectPlan(plan)}
                sx={{
                  p: 2.5,
                  borderRadius: 1.5,
                  cursor: isCurrent ? 'default' : 'pointer',
                  position: 'relative',
                  ...(isCurrent ? { opacity: 0.72 } : null),
                  ...(isSelected
                    ? {
                        boxShadow: (theme) => `0 0 0 2px ${theme.palette.text.primary}`,
                      }
                    : null),
                }}
              >
                {isCurrent && (
                  <Label
                    color="info"
                    startIcon={<Iconify icon="eva:star-fill" />}
                    sx={{ position: 'absolute', top: 8, right: 8 }}
                  >
                    {t('billing.currentBadge')}
                  </Label>
                )}

                {planIcon(plan.code)}

                <Box
                  sx={{
                    typography: 'subtitle2',
                    mt: 2,
                    mb: 0.5,
                    textTransform: 'capitalize',
                  }}
                >
                  {plan.name}
                </Box>

                <Box sx={{ display: 'flex', typography: 'h4', alignItems: 'center' }}>
                  {plan.priceMonthly > 0 ? fCurrency(plan.priceMonthly) : t('billing.freePrice')}
                  {plan.priceMonthly > 0 && (
                    <Box
                      component="span"
                      sx={{ typography: 'body2', color: 'text.disabled', ml: 0.5 }}
                    >
                      {t('billing.perMonth')}
                    </Box>
                  )}
                </Box>

                {(plan.features || []).slice(0, 3).map((f) => (
                  <Typography key={f} variant="caption" display="block" color="text.secondary">
                    {f}
                  </Typography>
                ))}
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Stack spacing={2} sx={{ p: 3, pt: 0, typography: 'body2' }}>
        <Grid container spacing={{ xs: 0.5, md: 2 }}>
          <Grid xs={12} md={4} sx={{ color: 'text.secondary' }}>
            {t('billing.planLabel')}
          </Grid>
          <Grid xs={12} md={8} sx={{ typography: 'subtitle2' }}>
            {currentPlanObj?.name || selected?.name || '—'}
            {sub?.status === 'active' ? ` · ${sub.status}` : ''}
            {sub?.status === 'incomplete' ? ' · Aguardando confirmação de pagamento' : ''}
            {sub?.billingMode && sub?.status === 'active' ? ` · ${sub.billingMode}` : ''}
          </Grid>
        </Grid>

        <Grid container spacing={{ xs: 0.5, md: 2 }}>
          <Grid xs={12} md={4} sx={{ color: 'text.secondary' }}>
            {t('billing.billingName')}
          </Grid>
          <Grid xs={12} md={8} sx={{ typography: 'subtitle2' }}>
            {billingName}
          </Grid>
        </Grid>

        <Grid container spacing={{ xs: 0.5, md: 2 }}>
          <Grid xs={12} md={4} sx={{ color: 'text.secondary' }}>
            {t('billing.billingAddress')}
          </Grid>
          <Grid xs={12} md={8} sx={{ color: 'text.secondary' }}>
            {addressLine}
          </Grid>
        </Grid>

        <Grid container spacing={{ xs: 0.5, md: 2 }}>
          <Grid xs={12} md={4} sx={{ color: 'text.secondary' }}>
            {t('billing.billingPhone')}
          </Grid>
          <Grid xs={12} md={8} sx={{ color: 'text.secondary' }}>
            {billingPhone}
          </Grid>
        </Grid>

        <Grid container spacing={{ xs: 0.5, md: 2 }}>
          <Grid xs={12} md={4} sx={{ color: 'text.secondary' }}>
            {t('billing.paymentMethod')}
          </Grid>
          <Grid xs={12} md={8}>
            <Button
              onClick={onOpenPaymentModal}
              endIcon={<Iconify width={16} icon="eva:arrow-ios-downward-fill" />}
              sx={{ typography: 'subtitle2', p: 0, borderRadius: 0 }}
            >
              {paymentMethodLabel}
            </Button>
          </Grid>
        </Grid>

        {sub?.currentPeriodEnd && sub?.status === 'active' && (
          <Grid container spacing={{ xs: 0.5, md: 2 }}>
            <Grid xs={12} md={4} sx={{ color: 'text.secondary' }}>
              {t('billing.periodEnd')}
            </Grid>
            <Grid xs={12} md={8}>{sub.currentPeriodEnd}</Grid>
          </Grid>
        )}
      </Stack>

      <Divider sx={{ borderStyle: 'dashed' }} />

      <Box sx={{ p: 3, gap: 1.5, display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {paymentUrl && (
          <Button href={paymentUrl} target="_blank" rel="noopener" variant="outlined">
            {t('billing.paymentUrl')}
          </Button>
        )}
        {canCancel && (
          <Button variant="outlined" onClick={onCancel}>
            {t('billing.cancelAtPeriodEnd')}
          </Button>
        )}
        <LoadingButton
          variant="contained"
          loading={upgrading}
          disabled={!canUpgrade}
          onClick={onUpgrade}
        >
          {t('billing.upgrade')}
        </LoadingButton>
      </Box>
    </Card>
  );
}

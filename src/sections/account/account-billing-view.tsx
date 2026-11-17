import type { Plan } from 'src/api/firestore/plans';
import type { Enterprise } from 'src/api/firestore/platform';
import type { SubscriptionInvoice } from 'src/api/firestore/billing';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { useBoolean } from 'src/hooks/use-boolean';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listPlans } from 'src/api/firestore/plans';
import { getEnterprise } from 'src/api/firestore/platform';
import {
  getPublicBillingConfig,
  listSubscriptionInvoices,
  cancelSubscriptionAtPeriodEnd,
} from 'src/api/firestore/billing';
import { shouldDowngradeAfterGrace } from 'src/sections/billing/subscription-domain';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { ConfirmDialog } from 'src/components/custom-dialog';

import { useAuthContext } from 'src/auth/hooks';

import { UpgradePlanDialog } from './upgrade-plan-dialog';

// ----------------------------------------------------------------------

function graceDaysLeft(pastDueSince: string | null, graceDays: number, now: Date): number {
  if (!pastDueSince) return 0;
  const start = Date.parse(pastDueSince);
  if (Number.isNaN(start)) return 0;
  const elapsed = (now.getTime() - start) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(graceDays - elapsed));
}

// ----------------------------------------------------------------------

export function AccountBillingView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;
  const upgradeOpen = useBoolean();
  const confirmCancel = useBoolean();

  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [graceDays, setGraceDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      const [ent, planRows, invRows, cfg] = await Promise.all([
        getEnterprise(enterpriseId),
        listPlans({ activeOnly: true }),
        listSubscriptionInvoices(enterpriseId),
        getPublicBillingConfig().catch(() => ({ graceDays: 7 })),
      ]);
      setEnterprise(ent);
      setPlans(planRows);
      setInvoices(invRows);
      setGraceDays(cfg.graceDays);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.loadError')));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const sub = enterprise?.subscription;
  const planName = useMemo(() => {
    if (!sub) return '—';
    return plans.find((p) => p.id === sub.planId)?.name || sub.planCode;
  }, [plans, sub]);

  const pastDue = sub?.status === 'past_due';
  const now = new Date();
  const daysLeft = pastDue ? graceDaysLeft(sub?.pastDueSince ?? null, graceDays, now) : 0;
  const willDowngrade =
    pastDue && shouldDowngradeAfterGrace(sub?.pastDueSince, graceDays, now);

  const handleCancel = async () => {
    if (!enterpriseId) return;
    setCancelling(true);
    try {
      await cancelSubscriptionAtPeriodEnd(enterpriseId);
      toast.success(t('billing.cancelSuccess'));
      confirmCancel.onFalse();
      await load();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.cancelError')));
    } finally {
      setCancelling(false);
    }
  };

  if (!enterpriseId) {
    return <Alert severity="warning">{t('account.errorMissingEnterprise')}</Alert>;
  }

  return (
    <Stack spacing={3}>
      {pastDue && (
        <Alert severity={willDowngrade ? 'error' : 'warning'}>
          {t('billing.pastDueBanner', { days: daysLeft })}
        </Alert>
      )}
      {sub?.cancelAtPeriodEnd && (
        <Alert severity="info">{t('billing.cancelAtPeriodEnd')}</Alert>
      )}

      <Card sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{t('billing.currentPlan')}</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1">{loading ? '…' : planName}</Typography>
            {sub && <Label color="info">{sub.status}</Label>}
            {sub && <Label>{sub.planCode}</Label>}
          </Stack>
          {sub?.currentPeriodEnd && (
            <Typography variant="body2" color="text.secondary">
              {t('billing.periodEnd')}: {sub.currentPeriodEnd}
            </Typography>
          )}
          <Stack direction="row" spacing={2}>
            <Button variant="contained" onClick={upgradeOpen.onTrue}>
              {t('billing.upgrade')}
            </Button>
            {sub && sub.planCode !== 'free' && !sub.cancelAtPeriodEnd && (
              <Button color="inherit" variant="outlined" onClick={confirmCancel.onTrue}>
                {t('billing.cancelAtPeriodEnd')}
              </Button>
            )}
          </Stack>
        </Stack>
      </Card>

      <Card sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t('billing.invoices')}
        </Typography>
        <Stack spacing={1}>
          {invoices.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          )}
          {invoices.map((inv) => (
            <Stack
              key={inv.id}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              justifyContent="space-between"
            >
              <Typography variant="body2">
                {inv.dueDate} · {fCurrency(inv.value)} · {inv.status} · {inv.billingType}
              </Typography>
              {inv.invoiceUrl && (
                <Button size="small" href={inv.invoiceUrl} target="_blank" rel="noopener">
                  {t('billing.paymentUrl')}
                </Button>
              )}
            </Stack>
          ))}
        </Stack>
      </Card>

      <UpgradePlanDialog
        open={upgradeOpen.value}
        onClose={upgradeOpen.onFalse}
        enterpriseId={enterpriseId}
        plans={plans}
        onDone={load}
      />

      <ConfirmDialog
        open={confirmCancel.value}
        onClose={confirmCancel.onFalse}
        title={t('billing.cancelAtPeriodEnd')}
        content={t('billing.cancelConfirm')}
        action={
          <LoadingButton
            variant="contained"
            color="error"
            loading={cancelling}
            onClick={handleCancel}
          >
            {t('billing.cancelAtPeriodEnd')}
          </LoadingButton>
        }
      />
    </Stack>
  );
}

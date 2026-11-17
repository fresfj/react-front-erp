import type { Plan } from 'src/api/firestore/plans';
import type { BillingPaymentMethod } from 'src/api/firestore/billing';

import { useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LoadingButton from '@mui/lab/LoadingButton';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { startSubscription } from 'src/api/firestore/billing';

import { toast } from 'src/components/snackbar';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  onClose: () => void;
  enterpriseId: string;
  plans: Plan[];
  onDone: () => void;
};

// ----------------------------------------------------------------------

export function UpgradePlanDialog({ open, onClose, enterpriseId, plans, onDone }: Props) {
  const { t } = useTranslate('common');
  const paid = plans.filter((p) => p.active && p.code !== 'free' && p.priceMonthly > 0);
  const [planId, setPlanId] = useState(paid[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<BillingPaymentMethod>('pix');
  const [creditCardToken, setCreditCardToken] = useState('');
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!planId) return;
    setSubmitting(true);
    try {
      const result = await startSubscription({
        enterpriseId,
        planId,
        paymentMethod,
        creditCardToken: paymentMethod === 'credit_card' ? creditCardToken : undefined,
      });
      toast.success(t('billing.upgradeSuccess'));
      setPaymentUrl(result.paymentUrl || null);
      onDone();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.upgradeError')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('billing.upgrade')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {paid.map((plan) => (
            <Card
              key={plan.id}
              variant="outlined"
              onClick={() => setPlanId(plan.id)}
              sx={{
                p: 2,
                cursor: 'pointer',
                borderColor: planId === plan.id ? 'primary.main' : 'divider',
              }}
            >
              <Typography variant="subtitle1">
                {plan.name} — R$ {plan.priceMonthly.toFixed(2)}/mês
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {(plan.features || []).join(' · ')}
              </Typography>
            </Card>
          ))}
          <TextField
            select
            fullWidth
            label={t('billing.paymentMethod')}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as BillingPaymentMethod)}
          >
            <MenuItem value="pix">{t('billing.fields.pix')}</MenuItem>
            <MenuItem value="boleto">{t('billing.fields.boleto')}</MenuItem>
            <MenuItem value="credit_card">{t('billing.fields.credit_card')}</MenuItem>
          </TextField>
          {paymentMethod === 'credit_card' && (
            <TextField
              fullWidth
              label={t('billing.fields.creditCardToken')}
              value={creditCardToken}
              onChange={(e) => setCreditCardToken(e.target.value)}
            />
          )}
          {paymentUrl && (
            <Box>
              <Button href={paymentUrl} target="_blank" rel="noopener" variant="outlined">
                {t('billing.paymentUrl')}
              </Button>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <LoadingButton variant="contained" loading={submitting} onClick={handleSubmit}>
          {t('billing.upgrade')}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}

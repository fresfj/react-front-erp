import type { Plan } from 'src/api/firestore/plans';
import type { PixQrPayload, CreditCardInput } from 'src/api/firestore/billing';

import { useState } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { startSubscription } from 'src/api/firestore/billing';

import { toast } from 'src/components/snackbar';

import { AccountBillingPixDialog } from './account-billing-pix-dialog';
import { AccountBillingValidatingDialog } from './account-billing-validating-dialog';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  onClose: () => void;
  enterpriseId: string;
  plans: Plan[];
  onDone: () => void;
};

type PayMethod = 'pix' | 'credit_card';

const EMPTY_CARD: CreditCardInput = {
  holderName: '',
  number: '',
  expiryMonth: '',
  expiryYear: '',
  ccv: '',
};

// ----------------------------------------------------------------------

export function UpgradePlanDialog({ open, onClose, enterpriseId, plans, onDone }: Props) {
  const { t } = useTranslate('common');
  const paid = plans.filter((p) => p.active && p.code !== 'free' && p.priceMonthly > 0);
  const [planId, setPlanId] = useState(paid[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('pix');
  const [card, setCard] = useState<CreditCardInput>(EMPTY_CARD);
  const [pix, setPix] = useState<PixQrPayload | null>(null);
  const [pixOpen, setPixOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const patchCard = (partial: Partial<CreditCardInput>) => {
    setCard((prev) => ({ ...prev, ...partial }));
  };

  const handleSubmit = async () => {
    if (!planId) return;

    if (paymentMethod === 'credit_card') {
      if (
        !card.holderName.trim() ||
        card.number.replace(/\D/g, '').length < 13 ||
        !card.expiryMonth ||
        !card.expiryYear ||
        card.ccv.length < 3
      ) {
        toast.error('Preencha os dados do cartão corretamente');
        return;
      }
    }

    setSubmitting(true);
    setValidating(true);
    try {
      const payload =
        paymentMethod === 'credit_card'
          ? {
              enterpriseId,
              planId,
              paymentMethod: 'credit_card' as const,
              creditCard: { ...card, number: card.number.replace(/\D/g, '') },
            }
          : {
              enterpriseId,
              planId,
              paymentMethod: 'pix' as const,
            };

      const result = await startSubscription(payload);

      if (paymentMethod === 'pix') {
        setPix(result.pix || null);
        setValidating(false);
        setPixOpen(true);
        onDone();
        return;
      }

      if (result.subscription.status === 'active') {
        toast.success(t('billing.upgradeSuccess'));
        setCard(EMPTY_CARD);
        onDone();
        onClose();
      } else {
        toast.error('Cartão não aprovado pelo Asaas. Verifique os dados.');
      }
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.upgradeError')));
    } finally {
      setValidating(false);
      setSubmitting(false);
    }
  };

  return (
    <>
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
              onChange={(e) => setPaymentMethod(e.target.value as PayMethod)}
            >
              <MenuItem value="pix">{t('billing.fields.pix')}</MenuItem>
              <MenuItem value="credit_card">{t('billing.fields.credit_card')}</MenuItem>
            </TextField>

            {paymentMethod === 'credit_card' && (
              <Stack spacing={2}>
                <TextField
                  label="Número do cartão"
                  value={card.number}
                  onChange={(e) => patchCard({ number: e.target.value.replace(/\D/g, '') })}
                />
                <TextField
                  label="Nome impresso"
                  value={card.holderName}
                  onChange={(e) => patchCard({ holderName: e.target.value.toUpperCase() })}
                />
                <Stack direction="row" spacing={2}>
                  <TextField
                    fullWidth
                    label="Validade MM/AA"
                    value={
                      card.expiryMonth || card.expiryYear
                        ? `${card.expiryMonth}${card.expiryYear ? `/${String(card.expiryYear).slice(-2)}` : ''}`
                        : ''
                    }
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
                      patchCard({
                        expiryMonth: raw.slice(0, 2),
                        expiryYear: raw.slice(2, 4) ? `20${raw.slice(2, 4)}` : '',
                      });
                    }}
                  />
                  <TextField
                    fullWidth
                    label="CVV"
                    value={card.ccv}
                    onChange={(e) =>
                      patchCard({ ccv: e.target.value.replace(/\D/g, '').slice(0, 4) })
                    }
                  />
                </Stack>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <LoadingButton variant="contained" loading={submitting} onClick={handleSubmit}>
            {t('billing.upgrade')}
          </LoadingButton>
        </DialogActions>
      </Dialog>

      <AccountBillingValidatingDialog
        open={validating}
        title={
          paymentMethod === 'credit_card'
            ? 'Validando cartão e pagamento…'
            : 'Gerando cobrança PIX…'
        }
      />

      <AccountBillingPixDialog
        open={pixOpen}
        onClose={() => setPixOpen(false)}
        pix={pix}
        waiting
      />
    </>
  );
}

import type { Plan } from 'src/api/firestore/plans';
import type { Enterprise } from 'src/api/firestore/platform';
import type { PixQrPayload, SubscriptionInvoice } from 'src/api/firestore/billing';

import { useRef, useMemo, useState, useEffect, useCallback } from 'react';

import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Unstable_Grid2';
import LoadingButton from '@mui/lab/LoadingButton';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listPlans } from 'src/api/firestore/plans';
import { getEnterprise } from 'src/api/firestore/platform';
import {
  getCachedBilling,
  peekBillingCache,
  invalidateBillingCache,
} from 'src/api/firestore/billing-cache';
import {
  startSubscription,
  tokenizeBillingCard,
  getPublicBillingConfig,
  listSubscriptionInvoices,
  saveEnterpriseBillingCards,
  cancelSubscriptionAtPeriodEnd,
} from 'src/api/firestore/billing';

import { toast } from 'src/components/snackbar';
import { ConfirmDialog } from 'src/components/custom-dialog';

import { shouldDowngradeAfterGrace } from 'src/sections/billing/subscription-domain';

import { useAuthContext } from 'src/auth/hooks';

import { AccountBillingPlan } from './account-billing-plan';
import { AccountBillingPayment } from './account-billing-payment';
import { AccountBillingHistory } from './account-billing-history';
import { AccountBillingSkeleton } from './account-billing-skeleton';
import { AccountBillingPixDialog } from './account-billing-pix-dialog';
import { AccountBillingCardListDialog } from './account-billing-card-list-dialog';
import { AccountBillingValidatingDialog } from './account-billing-validating-dialog';
import {
  formatBillingAddressLine,
  AccountBillingNewCardDialog,
  extractCompanyBillingAddress,
} from './account-billing-new-card-dialog';

import type { BillingPayMethod } from './account-billing-payment';
import type { SavedBillingCard } from './account-billing-new-card-dialog';

// ----------------------------------------------------------------------

const LOCAL_CARDS_STORAGE_PREFIX = 'erp_billing_cards_v1:';

function readLocalCards(enterpriseId: string): SavedBillingCard[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_CARDS_STORAGE_PREFIX}${enterpriseId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedBillingCard[]) : [];
  } catch {
    return [];
  }
}

function writeLocalCards(enterpriseId: string, cards: SavedBillingCard[]) {
  try {
    localStorage.setItem(`${LOCAL_CARDS_STORAGE_PREFIX}${enterpriseId}`, JSON.stringify(cards));
  } catch {
    // ignore storage quota errors
  }
}

function mergeEnterpriseAndLocalCards(
  enterpriseId: string,
  ent: Enterprise | null
): SavedBillingCard[] {
  const firestoreCards = ent?.billingCards || [];
  const localCards = readLocalCards(enterpriseId);
  const subToken = ent?.subscription?.asaasCreditCardToken || null;

  if (!firestoreCards.length && !localCards.length) {
    return [];
  }

  const localMap = new Map(localCards.map((c) => [c.id, c]));
  const merged: SavedBillingCard[] = firestoreCards.map((fc) => {
    const local = localMap.get(fc.id);
    const token =
      fc.creditCardToken || local?.creditCardToken || (fc.primary ? subToken : null) || null;
    return {
      ...fc,
      creditCardToken: token,
      creditCard: token ? undefined : local?.creditCard,
    };
  });

  localCards.forEach((lc) => {
    if (!merged.some((m) => m.id === lc.id)) {
      merged.push({
        ...lc,
        creditCardToken: lc.creditCardToken || (lc.primary ? subToken : null) || null,
      });
    }
  });

  if (merged.length > 0 && !merged.some((c) => c.primary)) {
    merged[0] = { ...merged[0], primary: true };
  }

  return merged;
}

function isInvoicePaidStatus(status: string | null | undefined): boolean {
  const upper = String(status || '').toUpperCase();
  return upper === 'RECEIVED' || upper === 'CONFIRMED' || upper === 'RECEIVED_IN_CASH';
}

function resolveConfirmedPlanCode(
  ent: Enterprise | null,
  invRows: SubscriptionInvoice[],
  fallbackBeforePending: string
): string {
  const sub = ent?.subscription;
  if (!sub || sub.status === 'incomplete' || sub.status === 'canceled') {
    return fallbackBeforePending || 'free';
  }

  // Se houver faturas e a fatura mais recente do ciclo atual ainda estiver PENDING,
  // mantém o plano anterior confirmado até que a fatura seja paga.
  if (invRows.length > 0) {
    const sorted = [...invRows].sort((a, b) =>
      String(b.createdAt || b.dueDate || '').localeCompare(String(a.createdAt || a.dueDate || ''))
    );
    const latest = sorted[0];
    if (latest && String(latest.status || '').toUpperCase() === 'PENDING') {
      const hasPreviousPaid = sorted.slice(1).some((inv) => isInvoicePaidStatus(inv.status));
      if (!hasPreviousPaid) {
        return 'free';
      }
      if (fallbackBeforePending) {
        return fallbackBeforePending;
      }
    }
  }

  return sub.planCode || 'free';
}

function graceDaysLeft(pastDueSince: string | null, graceDays: number, now: Date): number {
  if (!pastDueSince) return 0;
  const start = Date.parse(pastDueSince);
  if (Number.isNaN(start)) return 0;
  const elapsed = (now.getTime() - start) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(graceDays - elapsed));
}

type BillingBundle = {
  ent: Enterprise | null;
  planRows: Plan[];
  invRows: SubscriptionInvoice[];
  cfg: { graceDays: number };
};

// ----------------------------------------------------------------------

export function AccountBillingView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const confirmCancel = useBoolean();
  const pixOpen = useBoolean();
  const validating = useBoolean();
  const paymentModalOpen = useBoolean();
  const newCardModalOpen = useBoolean();

  const [loading, setLoading] = useState(true);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [graceDays, setGraceDays] = useState(7);
  const [confirmedPlanCode, setConfirmedPlanCode] = useState<string>('free');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<BillingPayMethod>('pix');
  const [cards, setCards] = useState<SavedBillingCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [pix, setPix] = useState<PixQrPayload | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [waitingPix, setWaitingPix] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preUpgradePlanCodeRef = useRef<string>('free');

  const stopPixPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWaitingPix(false);
  }, []);

  const persistCards = useCallback(
    async (nextCards: SavedBillingCard[]) => {
      if (!enterpriseId) return;
      writeLocalCards(enterpriseId, nextCards);
      try {
        await saveEnterpriseBillingCards(enterpriseId, nextCards);
        invalidateBillingCache(`billing-account:${enterpriseId}`);
      } catch (err) {
        console.warn('Could not save billingCards to Firestore:', err);
      }
    },
    [enterpriseId]
  );

  const applyBundle = useCallback(
    (data: BillingBundle) => {
      setEnterprise(data.ent);
      setPlans(data.planRows);
      setInvoices(data.invRows);
      setGraceDays(data.cfg.graceDays);

      const resolvedConfirmed = resolveConfirmedPlanCode(
        data.ent,
        data.invRows,
        preUpgradePlanCodeRef.current
      );
      setConfirmedPlanCode(resolvedConfirmed);
      if (data.ent?.subscription?.status === 'active') {
        preUpgradePlanCodeRef.current = resolvedConfirmed;
      }

      if (enterpriseId) {
        const mergedCards = mergeEnterpriseAndLocalCards(enterpriseId, data.ent);
        setCards(mergedCards);
        setSelectedCardId((prev) => {
          if (prev && mergedCards.some((c) => c.id === prev)) return prev;
          const primary = mergedCards.find((c) => c.primary) || mergedCards[0];
          return primary ? primary.id : '';
        });
      }

      const fallbackPaid = data.planRows.find(
        (p) => p.code !== 'free' && p.priceMonthly > 0 && p.code !== resolvedConfirmed
      )?.id;
      const confirmedPlanId = data.planRows.find((p) => p.code === resolvedConfirmed)?.id;
      setSelectedPlanId(
        (prev) => prev || fallbackPaid || confirmedPlanId || data.planRows[0]?.id || ''
      );
    },
    [enterpriseId]
  );

  const load = useCallback(
    async (force = false) => {
      if (!enterpriseId) return;
      const cacheKey = `billing-account:${enterpriseId}`;

      if (!force) {
        const peek = peekBillingCache<BillingBundle>(cacheKey, 45_000);
        if (peek) {
          applyBundle(peek);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      try {
        const data = await getCachedBilling(
          cacheKey,
          async () => {
            const [ent, planRows, invRows, cfg] = await Promise.all([
              getEnterprise(enterpriseId),
              listPlans({ activeOnly: true }),
              listSubscriptionInvoices(enterpriseId),
              getPublicBillingConfig().catch(() => ({ graceDays: 7 })),
            ]);
            return { ent, planRows, invRows, cfg };
          },
          { force, ttlMs: 45_000 }
        );
        applyBundle(data);
      } catch (error) {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, t('billing.loadError')));
      } finally {
        setLoading(false);
      }
    },
    [applyBundle, enterpriseId, t]
  );

  useEffect(() => {
    load(false);
    return () => stopPixPoll();
  }, [load, stopPixPoll]);

  const sortedPlans = useMemo(
    () =>
      [...plans].sort((a, b) => {
        const order = { free: 0, pro: 1, ultra: 2 } as Record<string, number>;
        return (order[a.code] ?? 9) - (order[b.code] ?? 9) || a.sortOrder - b.sortOrder;
      }),
    [plans]
  );

  const selectedCard = useMemo(
    () =>
      cards.find((c) => c.id === selectedCardId) ||
      cards.find((c) => c.primary) ||
      cards[0] ||
      null,
    [cards, selectedCardId]
  );

  const companyAddr = useMemo(() => extractCompanyBillingAddress(enterprise), [enterprise]);
  const activeAddr =
    paymentMethod === 'credit_card' && selectedCard?.billingAddress
      ? selectedCard.billingAddress
      : companyAddr;

  const billingName = activeAddr.name || enterprise?.name || enterprise?.tradeName;
  const billingAddress = formatBillingAddressLine(activeAddr);
  const billingPhone = activeAddr.phone || enterprise?.phone;
  const isCustomAddress = Boolean(
    paymentMethod === 'credit_card' && selectedCard && !selectedCard.useCompanyAddress
  );

  const sub = enterprise?.subscription;
  const pastDue = sub?.status === 'past_due';
  const now = new Date();
  const daysLeft = pastDue ? graceDaysLeft(sub?.pastDueSince ?? null, graceDays, now) : 0;
  const willDowngrade =
    pastDue && shouldDowngradeAfterGrace(sub?.pastDueSince, graceDays, now);

  const handleAddCard = useCallback(
    async (newCard: SavedBillingCard) => {
      if (!enterpriseId) return;

      let cardWithToken: SavedBillingCard = { ...newCard, primary: true };

      // Tenta tokenizar imediatamente no Asaas se a Cloud Function tokenizeBillingCard estiver disponível
      if (newCard.creditCard) {
        try {
          const tokRes = await tokenizeBillingCard({
            enterpriseId,
            creditCard: newCard.creditCard,
            billingAddress: newCard.billingAddress,
          });
          if (tokRes?.creditCardToken) {
            cardWithToken = {
              ...cardWithToken,
              creditCardToken: tokRes.creditCardToken,
              creditCard: undefined,
            };
          }
        } catch {
          // Se a função tokenizeBillingCard ainda não estiver publicada ou falhar,
          // o token será obtido e salvo na primeira cobrança em startSubscription
        }
      }

      const nextCards = [
        ...cards.map((c) => ({ ...c, primary: false })),
        cardWithToken,
      ];

      setCards(nextCards);
      setSelectedCardId(cardWithToken.id);
      setPaymentMethod('credit_card');
      await persistCards(nextCards);
      toast.success('Cartão salvo com sucesso.');
    },
    [cards, enterpriseId, persistCards]
  );

  const handleSelectCard = useCallback((card: SavedBillingCard) => {
    setSelectedCardId(card.id);
    setPaymentMethod('credit_card');
  }, []);

  const handleSetPrimaryCard = useCallback(
    async (id: string) => {
      const nextCards = cards.map((c) => ({ ...c, primary: c.id === id }));
      setCards(nextCards);
      setSelectedCardId(id);
      setPaymentMethod('credit_card');
      await persistCards(nextCards);
    },
    [cards, persistCards]
  );

  const handleDeleteCard = useCallback(
    async (id: string) => {
      const remaining = cards.filter((c) => c.id !== id);
      if (remaining.length > 0 && !remaining.some((c) => c.primary)) {
        remaining[0] = { ...remaining[0], primary: true };
      }
      setCards(remaining);
      if (selectedCardId === id) {
        const nextCard = remaining[0] || null;
        setSelectedCardId(nextCard ? nextCard.id : '');
        if (!nextCard) {
          setPaymentMethod('pix');
        }
      }
      await persistCards(remaining);
    },
    [cards, persistCards, selectedCardId]
  );

  const startPixPoll = useCallback(
    (targetPaymentId?: string | null, targetPlanCode?: string) => {
      if (!enterpriseId) return;
      stopPixPoll();
      setWaitingPix(true);
      pollRef.current = setInterval(async () => {
        try {
          const [ent, invRows] = await Promise.all([
            getEnterprise(enterpriseId),
            listSubscriptionInvoices(enterpriseId),
          ]);
          setInvoices(invRows);

          const matchingInv = targetPaymentId
            ? invRows.find(
                (inv) => inv.id === targetPaymentId || inv.asaasPaymentId === targetPaymentId
              )
            : invRows[0];

          const invoiceConfirmed = matchingInv ? isInvoicePaidStatus(matchingInv.status) : false;

          if (ent?.subscription?.status === 'active' && invoiceConfirmed) {
            stopPixPoll();
            pixOpen.onFalse();
            if (targetPlanCode) {
              preUpgradePlanCodeRef.current = targetPlanCode;
              setConfirmedPlanCode(targetPlanCode);
            }
            invalidateBillingCache(`billing-account:${enterpriseId}`);
            toast.success(t('billing.upgradeSuccess'));
            await load(true);
          }
        } catch {
          // keep polling
        }
      }, 3500);
    },
    [enterpriseId, load, pixOpen, stopPixPoll, t]
  );

  const handleUpgrade = async () => {
    if (!enterpriseId || !selectedPlanId) return;
    const plan = plans.find((p) => p.id === selectedPlanId);
    if (!plan || plan.code === 'free' || !(plan.priceMonthly > 0)) return;

    if (paymentMethod === 'credit_card') {
      if (!selectedCard) {
        toast.error('Selecione ou adicione um cartão de crédito para continuar.');
        paymentModalOpen.onTrue();
        return;
      }
      if (!selectedCard.creditCardToken && !selectedCard.creditCard) {
        toast.error(
          'Este cartão ainda não possui token salvo. Remova-o e cadastre novamente.'
        );
        paymentModalOpen.onTrue();
        return;
      }
    }

    preUpgradePlanCodeRef.current = confirmedPlanCode;
    validating.onTrue();
    try {
      const payload =
        paymentMethod === 'credit_card' && selectedCard
          ? {
              enterpriseId,
              planId: selectedPlanId,
              paymentMethod: 'credit_card' as const,
              ...(selectedCard.creditCardToken
                ? { creditCardToken: selectedCard.creditCardToken }
                : {
                    creditCard: selectedCard.creditCard,
                    billingAddress: selectedCard.billingAddress,
                  }),
            }
          : {
              enterpriseId,
              planId: selectedPlanId,
              paymentMethod: 'pix' as const,
            };

      const result = await startSubscription(payload);

      invalidateBillingCache(`billing-account:${enterpriseId}`);
      invalidateBillingCache('enterprises-list');

      // Se a cobrança no cartão retornou o token do Asaas, salva o token junto ao cartão!
      if (paymentMethod === 'credit_card' && selectedCard) {
        const returnedToken =
          result.creditCardToken || result.subscription?.asaasCreditCardToken || null;
        if (returnedToken && returnedToken !== selectedCard.creditCardToken) {
          const updatedCards = cards.map((c) =>
            c.id === selectedCard.id
              ? { ...c, creditCardToken: returnedToken, creditCard: undefined }
              : c
          );
          setCards(updatedCards);
          await persistCards(updatedCards);
        }
      }

      if (paymentMethod === 'pix') {
        setPix(result.pix || null);
        setPaymentUrl(result.paymentUrl || null);
        setLastPaymentId(result.asaasPaymentId || null);
        validating.onFalse();
        pixOpen.onTrue();
        // Atualiza apenas a lista de faturas, mantendo o plano atual até a confirmação do PIX
        const invRows = await listSubscriptionInvoices(enterpriseId).catch(() => invoices);
        setInvoices(invRows);
        startPixPoll(result.asaasPaymentId, plan.code);
        return;
      }

      const paymentConfirmed =
        result.subscription.status === 'active' &&
        (!result.paymentStatus || isInvoicePaidStatus(result.paymentStatus));

      if (paymentConfirmed) {
        preUpgradePlanCodeRef.current = plan.code;
        setConfirmedPlanCode(plan.code);
        toast.success(t('billing.upgradeSuccess'));
        await load(true);
      } else if (result.subscription.status === 'active') {
        // Assinatura criada, aguardando confirmação da fatura do cartão
        const invRows = await listSubscriptionInvoices(enterpriseId).catch(() => invoices);
        setInvoices(invRows);
        toast.info(
          'Cobrança gerada no cartão. O plano será atualizado assim que a fatura for confirmada.'
        );
      } else {
        toast.error(
          'Cartão não aprovado pelo Asaas. Verifique os dados ou tente outro cartão.'
        );
      }
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.upgradeError')));
    } finally {
      validating.onFalse();
    }
  };

  const handleCancel = async () => {
    if (!enterpriseId) return;
    setCancelling(true);
    try {
      await cancelSubscriptionAtPeriodEnd(enterpriseId);
      toast.success(t('billing.cancelSuccess'));
      confirmCancel.onFalse();
      invalidateBillingCache(`billing-account:${enterpriseId}`);
      await load(true);
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

  if (loading && !enterprise) {
    return <AccountBillingSkeleton />;
  }

  return (
    <>
      {pastDue && (
        <Alert severity={willDowngrade ? 'error' : 'warning'} sx={{ mb: 3 }}>
          {t('billing.pastDueBanner', { days: daysLeft })}
        </Alert>
      )}
      {sub?.cancelAtPeriodEnd && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('billing.cancelAtPeriodEnd')}
        </Alert>
      )}

      <Grid container spacing={5}>
        <Grid xs={12} md={8}>
          <AccountBillingPlan
            plans={sortedPlans}
            enterprise={enterprise}
            confirmedPlanCode={confirmedPlanCode}
            selectedPlanId={selectedPlanId}
            paymentMethod={paymentMethod}
            selectedCard={selectedCard}
            onSelectPlan={setSelectedPlanId}
            onOpenPaymentModal={paymentModalOpen.onTrue}
            onUpgrade={handleUpgrade}
            onCancel={confirmCancel.onTrue}
            upgrading={validating.value}
            paymentUrl={null}
          />

          <AccountBillingPayment
            paymentMethod={paymentMethod}
            cards={cards}
            selectedCardId={selectedCard?.id || ''}
            billingName={billingName}
            billingAddress={billingAddress}
            billingPhone={billingPhone}
            isCustomAddress={isCustomAddress}
            onPaymentMethodChange={setPaymentMethod}
            onSelectCard={handleSelectCard}
            onOpenPaymentModal={paymentModalOpen.onTrue}
            onOpenNewCard={newCardModalOpen.onTrue}
            onSetPrimaryCard={handleSetPrimaryCard}
            onDeleteCard={handleDeleteCard}
          />
        </Grid>

        <Grid xs={12} md={4}>
          <AccountBillingHistory invoices={invoices} />
        </Grid>
      </Grid>

      <AccountBillingCardListDialog
        open={paymentModalOpen.value}
        onClose={paymentModalOpen.onFalse}
        list={cards}
        paymentMethod={paymentMethod}
        selectedCardId={selectedCard?.id || ''}
        onSelectPix={() => setPaymentMethod('pix')}
        onSelectCard={handleSelectCard}
        onOpenNewCard={() => {
          paymentModalOpen.onFalse();
          newCardModalOpen.onTrue();
        }}
        onSetPrimaryCard={handleSetPrimaryCard}
        onDeleteCard={handleDeleteCard}
      />

      <AccountBillingNewCardDialog
        open={newCardModalOpen.value}
        onClose={newCardModalOpen.onFalse}
        enterprise={enterprise}
        onAddCard={handleAddCard}
      />

      <AccountBillingValidatingDialog
        open={validating.value}
        title={
          paymentMethod === 'credit_card'
            ? 'Validando cartão e pagamento…'
            : 'Gerando cobrança PIX…'
        }
        subtitle="Comunicando com o Asaas. Aguarde o retorno."
      />

      <AccountBillingPixDialog
        open={pixOpen.value}
        onClose={() => {
          stopPixPoll();
          pixOpen.onFalse();
        }}
        pix={pix}
        paymentUrl={paymentUrl}
        amount={plans.find((p) => p.id === selectedPlanId)?.priceMonthly}
        enterpriseName={enterprise?.name}
        enterpriseDocument={enterprise?.document}
        enterpriseCity={enterprise?.city}
        asaasPaymentId={lastPaymentId || invoices[0]?.asaasPaymentId || null}
        waiting={waitingPix}
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
    </>
  );
}

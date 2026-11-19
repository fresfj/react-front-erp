import type { CardProps } from '@mui/material/Card';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { useTranslate } from 'src/locales';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';

import { BillingCardItem } from './account-billing-card-list-dialog';

import type { SavedBillingCard } from './account-billing-new-card-dialog';

// ----------------------------------------------------------------------

export type BillingPayMethod = 'pix' | 'credit_card';

type Props = CardProps & {
  paymentMethod: BillingPayMethod;
  cards: SavedBillingCard[];
  selectedCardId: string;
  billingName?: string;
  billingAddress?: string;
  billingPhone?: string;
  isCustomAddress?: boolean;
  onPaymentMethodChange: (method: BillingPayMethod) => void;
  onSelectCard: (card: SavedBillingCard) => void;
  onOpenPaymentModal: () => void;
  onOpenNewCard: () => void;
  onSetPrimaryCard: (id: string) => void;
  onDeleteCard: (id: string) => void;
};

export function AccountBillingPayment({
  paymentMethod,
  cards,
  selectedCardId,
  billingName,
  billingAddress,
  billingPhone,
  isCustomAddress,
  onPaymentMethodChange,
  onSelectCard,
  onOpenPaymentModal,
  onOpenNewCard,
  onSetPrimaryCard,
  onDeleteCard,
  sx,
  ...other
}: Props) {
  const { t } = useTranslate('common');

  const selectedCard = cards.find((c) => c.id === selectedCardId) || null;

  return (
    <Card sx={{ my: 3, ...sx }} {...other}>
      <CardHeader
        title={t('billing.paymentMethod')}
        action={
          <Button
            size="small"
            color="primary"
            startIcon={<Iconify icon="mingcute:add-line" />}
            onClick={onOpenNewCard}
          >
            {t('billing.newCard')}
          </Button>
        }
      />

      <Stack spacing={2.5} sx={{ p: 3 }}>
        <Box
          sx={{
            gap: 2,
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          <Paper
            variant="outlined"
            onClick={() => onPaymentMethodChange('pix')}
            sx={{
              p: 2,
              minWidth: 0,
              overflow: 'hidden',
              cursor: 'pointer',
              borderWidth: 2,
              borderColor: paymentMethod === 'pix' ? 'primary.main' : 'divider',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Iconify icon="thesvg-color:pix" width={28} sx={{ flexShrink: 0 }} />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>
                  {t('billing.fields.pix')}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                  {t('billing.pixSubtitle')}
                </Typography>
              </Box>
              {paymentMethod === 'pix' && <Label color="info">{t('billing.currentBadge')}</Label>}
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            onClick={() => {
              // Sempre abre o modal com a lista de cartões (ou opção de adicionar caso não tenha)
              onOpenPaymentModal();
            }}
            sx={{
              p: 2,
              minWidth: 0,
              overflow: 'hidden',
              cursor: 'pointer',
              borderWidth: 2,
              borderColor: paymentMethod === 'credit_card' ? 'primary.main' : 'divider',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Iconify icon="logos:visa" width={36} sx={{ flexShrink: 0 }} />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>
                  {t('billing.fields.credit_card')}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                  {selectedCard
                    ? `${selectedCard.cardNumber} (${selectedCard.holderName})`
                    : t('billing.cardSubtitle')}
                </Typography>
              </Box>
              <Iconify
                width={18}
                icon="eva:arrow-ios-downward-fill"
                sx={{ color: 'text.secondary', flexShrink: 0 }}
              />
            </Stack>
          </Paper>
        </Box>

        {/* Grid de cartões cadastrados no padrão da referência minimals-v6-2 */}
        {cards.length > 0 ? (
          <Box
            sx={{
              rowGap: 2.5,
              columnGap: 2,
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
            }}
          >
            {cards.map((card) => (
              <BillingCardItem
                key={card.id}
                card={card}
                selected={paymentMethod === 'credit_card' && selectedCardId === card.id}
                onClick={() => onSelectCard(card)}
                onSetPrimary={onSetPrimaryCard}
                onDelete={onDeleteCard}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        ) : (
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              borderStyle: 'dashed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1.5,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {t('billing.noCardsRegistered')}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Iconify icon="mingcute:add-line" />}
              onClick={onOpenNewCard}
            >
              {t('billing.addNewCard')}
            </Button>
          </Paper>
        )}

        <Card variant="outlined">
          <CardHeader
            title={t('billing.billingAddress')}
            subheader={
              isCustomAddress
                ? t('billing.customBillingAddress')
                : t('billing.companyAddressRegistered')
            }
          />
          <Stack spacing={1} sx={{ px: 3, pb: 3, typography: 'body2' }}>
            <Typography>
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {t('billing.billingName')}:{' '}
              </Box>
              {billingName || '—'}
            </Typography>
            <Typography>
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {t('billing.billingAddress')}:{' '}
              </Box>
              {billingAddress || '—'}
            </Typography>
            <Typography>
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {t('billing.billingPhone')}:{' '}
              </Box>
              {billingPhone || '—'}
            </Typography>
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}

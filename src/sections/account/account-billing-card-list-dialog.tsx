import type { PaperProps } from '@mui/material/Paper';

import { useState, useCallback } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

import { useTranslate } from 'src/locales';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { SearchNotFound } from 'src/components/search-not-found';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

import type { SavedBillingCard } from './account-billing-new-card-dialog';

// ----------------------------------------------------------------------

type BillingCardItemProps = PaperProps & {
  card: SavedBillingCard;
  selected?: boolean;
  onSetPrimary?: (id: string) => void;
  onDelete?: (id: string) => void;
};

export function BillingCardItem({
  card,
  selected,
  onSetPrimary,
  onDelete,
  sx,
  ...other
}: BillingCardItemProps) {
  const { t } = useTranslate('common');
  const popover = usePopover();

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          pr: 5,
          width: 1,
          minWidth: 0,
          overflow: 'hidden',
          position: 'relative',
          transition: (theme) => theme.transitions.create(['box-shadow', 'border-color']),
          ...(selected && {
            borderColor: 'text.primary',
            boxShadow: (theme) => `0 0 0 2px ${theme.vars.palette.text.primary}`,
          }),
          ...sx,
        }}
        {...other}
      >
        <Box gap={1} display="flex" alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
          <Iconify
            width={36}
            icon={(card.cardType === 'visa' && 'logos:visa') || 'logos:mastercard'}
          />

          {card.primary && <Label color="info">{t('billing.defaultBadge')}</Label>}

          {card.creditCardToken && <Label color="success">Token ativo</Label>}
        </Box>

        <Typography variant="subtitle2" noWrap>
          {card.cardNumber}
        </Typography>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }} noWrap>
          {card.holderName} · {card.expiryMonth}/{String(card.expiryYear).slice(-2)}
        </Typography>

        {(onSetPrimary || onDelete) && (
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              popover.onOpen(e);
            }}
            sx={{ top: 8, right: 8, position: 'absolute' }}
          >
            <Iconify icon="eva:more-vertical-fill" />
          </IconButton>
        )}
      </Paper>

      <CustomPopover open={popover.open} anchorEl={popover.anchorEl} onClose={popover.onClose}>
        <MenuList>
          {onSetPrimary && !card.primary && (
            <MenuItem
              onClick={() => {
                popover.onClose();
                onSetPrimary(card.id);
              }}
            >
              <Iconify icon="eva:star-fill" />
              {t('billing.setAsPrimary')}
            </MenuItem>
          )}

          {onDelete && (
            <MenuItem
              onClick={() => {
                popover.onClose();
                onDelete(card.id);
              }}
              sx={{ color: 'error.main' }}
            >
              <Iconify icon="solar:trash-bin-trash-bold" />
              {t('billing.deleteCard')}
            </MenuItem>
          )}
        </MenuList>
      </CustomPopover>
    </>
  );
}

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  onClose: () => void;
  list: SavedBillingCard[];
  paymentMethod: 'pix' | 'credit_card';
  selectedCardId: string;
  onSelectPix: () => void;
  onSelectCard: (card: SavedBillingCard) => void;
  onOpenNewCard: () => void;
  onSetPrimaryCard?: (id: string) => void;
  onDeleteCard?: (id: string) => void;
};

export function AccountBillingCardListDialog({
  open,
  onClose,
  list,
  paymentMethod,
  selectedCardId,
  onSelectPix,
  onSelectCard,
  onOpenNewCard,
  onSetPrimaryCard,
  onDeleteCard,
}: Props) {
  const { t } = useTranslate('common');
  const [searchCard, setSearchCard] = useState('');

  const dataFiltered = applyFilter({ inputData: list, query: searchCard });

  const notFound = !dataFiltered.length && !!searchCard;

  const handleSearchCard = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchCard(event.target.value);
  }, []);

  const handlePickPix = useCallback(() => {
    onSelectPix();
    setSearchCard('');
    onClose();
  }, [onClose, onSelectPix]);

  const handlePickCard = useCallback(
    (card: SavedBillingCard) => {
      onSelectCard(card);
      setSearchCard('');
      onClose();
    },
    [onClose, onSelectCard]
  );

  return (
    <Dialog fullWidth maxWidth="xs" open={open} onClose={onClose}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ p: 3, pr: 1.5 }}
      >
        <Typography variant="h6">{t('billing.paymentMethod')}</Typography>

        <Button
          size="small"
          color="primary"
          startIcon={<Iconify icon="mingcute:add-line" />}
          onClick={onOpenNewCard}
          sx={{ alignSelf: 'flex-end' }}
        >
          {t('billing.newCard')}
        </Button>
      </Stack>

      {list.length > 0 && (
        <Stack sx={{ px: 3, pb: 2 }}>
          <TextField
            size="small"
            autoComplete="off"
            value={searchCard}
            onChange={handleSearchCard}
            placeholder={t('billing.searchPlaceholder')}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Iconify icon="eva:search-fill" sx={{ color: 'text.disabled' }} />
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      )}

      <Stack spacing={2} sx={{ px: 3, pb: 3 }}>
        {/* Opção PIX */}
        <Paper
          variant="outlined"
          onClick={handlePickPix}
          sx={{
            p: 2,
            cursor: 'pointer',
            transition: (theme) => theme.transitions.create(['box-shadow', 'border-color']),
            ...(paymentMethod === 'pix' && {
              borderColor: 'text.primary',
              boxShadow: (theme) => `0 0 0 2px ${theme.vars.palette.text.primary}`,
            }),
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Iconify icon="thesvg-color:pix" width={28} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="subtitle2">{t('billing.fields.pix')}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {t('billing.pixSubtitle')}
              </Typography>
            </Box>
            {paymentMethod === 'pix' && <Label color="info">{t('billing.currentBadge')}</Label>}
          </Stack>
        </Paper>

        <Divider sx={{ borderStyle: 'dashed' }} />

        <Typography variant="overline" color="text.secondary">
          {t('billing.cardsTitle')}
        </Typography>

        {list.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              borderStyle: 'dashed',
              bgcolor: 'background.neutral',
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('billing.noCardsRegistered')}
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<Iconify icon="mingcute:add-line" />}
              onClick={onOpenNewCard}
            >
              {t('billing.addNewCard')}
            </Button>
          </Paper>
        ) : notFound ? (
          <SearchNotFound query={searchCard} sx={{ py: 4 }} />
        ) : (
          <Stack spacing={2}>
            {dataFiltered.map((card) => (
              <BillingCardItem
                key={card.id}
                card={card}
                selected={paymentMethod === 'credit_card' && selectedCardId === card.id}
                onClick={() => handlePickCard(card)}
                onSetPrimary={onSetPrimaryCard}
                onDelete={onDeleteCard}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Dialog>
  );
}

// ----------------------------------------------------------------------

type ApplyFilterProps = {
  query: string;
  inputData: SavedBillingCard[];
};

function applyFilter({ inputData, query }: ApplyFilterProps) {
  if (!query) return inputData;

  const q = query.toLowerCase();
  return inputData.filter(
    (card) =>
      card.cardNumber.toLowerCase().includes(q) || card.holderName.toLowerCase().includes(q)
  );
}

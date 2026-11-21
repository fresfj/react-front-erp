import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { useState, useEffect } from 'react';

import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { useTranslate } from 'src/locales';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  order: OnlineOrder | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
};

export function OnlineOrderRejectDialog({ open, order, busy, onClose, onConfirm }: Props) {
  const { t } = useTranslate('common');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
    }
  }, [open, order?.id]);

  const quickReasons = [
    t('onlineOrders.kanban.rejectDialog.quickReasons.outOfStock'),
    t('onlineOrders.kanban.rejectDialog.quickReasons.outsideArea'),
    t('onlineOrders.kanban.rejectDialog.quickReasons.highDemand'),
    t('onlineOrders.kanban.rejectDialog.quickReasons.storeClosing'),
  ];

  const handleConfirm = () => {
    const trimmed = reason.trim();
    onConfirm(trimmed || undefined);
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t('onlineOrders.kanban.rejectDialog.title')}
        {order?.code ? ` · ${order.code}` : ''}
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('onlineOrders.kanban.rejectDialog.subtitle')}
        </Typography>

        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
          {quickReasons.map((item) => {
            const selected = reason === item;
            return (
              <Chip
                key={item}
                label={item}
                size="small"
                color={selected ? 'error' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                onClick={() => setReason(selected ? '' : item)}
              />
            );
          })}
        </Stack>

        <TextField
          fullWidth
          multiline
          rows={3}
          label={t('onlineOrders.kanban.rejectDialog.reasonLabel')}
          placeholder={t('onlineOrders.kanban.rejectDialog.reasonPlaceholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
        />
      </DialogContent>

      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={busy}>
          {t('actions.cancel', { defaultValue: 'Cancelar' })}
        </Button>
        <LoadingButton
          variant="contained"
          color="error"
          loading={busy}
          onClick={handleConfirm}
        >
          {t('onlineOrders.kanban.rejectDialog.confirm')}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}

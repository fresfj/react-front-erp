import type { PixQrPayload } from 'src/api/firestore/billing';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import CircularProgress from '@mui/material/CircularProgress';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

function emvField(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16Ccitt(payload: string): string {
  /* eslint-disable no-bitwise */
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  /* eslint-enable no-bitwise */
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function sanitizeAscii(text: string, maxLen: number, fallback: string): string {
  const clean = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
  return clean || fallback;
}

export function buildFallbackPixBrCode(params: {
  key?: string;
  merchantName?: string;
  merchantCity?: string;
  amount?: number;
  txid?: string;
}): string {
  const pixKey = (params.key || '').replace(/\D/g, '') || '00000000000191';
  const name = sanitizeAscii(params.merchantName || 'ERP MINIMALS', 25, 'ERP MINIMALS');
  const city = sanitizeAscii(params.merchantCity || 'BRASIL', 15, 'BRASIL');
  const txid =
    (params.txid || 'ERP').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'ASSINATURA';
  const amountStr =
    params.amount && params.amount > 0 ? Number(params.amount).toFixed(2) : undefined;

  const merchantAccount = emvField(
    '26',
    `${emvField('00', 'br.gov.bcb.pix')}${emvField('01', pixKey)}`
  );
  const additionalData = emvField('62', emvField('05', txid));

  const body = [
    emvField('00', '01'),
    merchantAccount,
    emvField('52', '0000'),
    emvField('53', '986'),
    ...(amountStr ? [emvField('54', amountStr)] : []),
    emvField('58', 'BR'),
    emvField('59', name),
    emvField('60', city),
    additionalData,
    '6304',
  ].join('');

  return `${body}${crc16Ccitt(body)}`;
}

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  onClose: () => void;
  pix: PixQrPayload | null;
  paymentUrl?: string | null;
  amount?: number;
  enterpriseName?: string;
  enterpriseDocument?: string;
  enterpriseCity?: string;
  asaasPaymentId?: string | null;
  waiting?: boolean;
};

export function AccountBillingPixDialog({
  open,
  onClose,
  pix,
  paymentUrl,
  amount,
  enterpriseName,
  enterpriseDocument,
  enterpriseCity,
  asaasPaymentId,
  waiting,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (open) {
      setImgError(false);
      setCopied(false);
    }
  }, [open, pix]);

  const effectivePayload = useMemo(() => {
    if (pix?.payload && pix.payload.trim()) {
      return pix.payload.trim();
    }
    return buildFallbackPixBrCode({
      key: enterpriseDocument,
      merchantName: enterpriseName,
      merchantCity: enterpriseCity,
      amount,
      txid: asaasPaymentId || undefined,
    });
  }, [amount, asaasPaymentId, enterpriseCity, enterpriseDocument, enterpriseName, pix?.payload]);

  const qrImageSrc = useMemo(() => {
    if (pix?.encodedImage && pix.encodedImage.trim()) {
      const raw = pix.encodedImage.trim();
      return raw.startsWith('data:image') ? raw : `data:image/png;base64,${raw}`;
    }
    if (effectivePayload) {
      return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(
        effectivePayload
      )}`;
    }
    return '';
  }, [effectivePayload, pix?.encodedImage]);

  const handleCopy = useCallback(async () => {
    if (!effectivePayload) return;
    try {
      await navigator.clipboard.writeText(effectivePayload);
      setCopied(true);
      toast.success('Código PIX copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar');
    }
  }, [effectivePayload]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Pagamento PIX</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} alignItems="center" sx={{ pt: 1 }}>
          {waiting && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Aguardando confirmação do pagamento…
              </Typography>
            </Stack>
          )}

          {qrImageSrc && !imgError ? (
            <Box
              component="img"
              alt="PIX QR Code"
              src={qrImageSrc}
              onError={() => setImgError(true)}
              sx={{
                width: 220,
                height: 220,
                borderRadius: 1.5,
                bgcolor: 'common.white',
                p: 1,
                border: (theme) => `1px solid ${theme.vars.palette.divider}`,
              }}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              QR Code indisponível. Use o código copia e cola abaixo.
            </Typography>
          )}

          {pix?.expirationDate && (
            <Typography variant="caption" color="text.secondary">
              Expira em: {pix.expirationDate}
            </Typography>
          )}

          <TextField
            fullWidth
            multiline
            minRows={3}
            label="PIX copia e cola"
            value={effectivePayload}
            InputProps={{ readOnly: true }}
          />

          <Stack direction="row" spacing={1.5} flexWrap="wrap" justifyContent="center">
            <Button
              variant="contained"
              startIcon={<Iconify icon={copied ? 'eva:checkmark-fill' : 'solar:copy-bold'} />}
              onClick={handleCopy}
              disabled={!effectivePayload}
            >
              {copied ? 'Copiado' : 'Copiar código'}
            </Button>

            {paymentUrl && (
              <Button
                variant="outlined"
                color="inherit"
                href={paymentUrl}
                target="_blank"
                rel="noopener"
                startIcon={<Iconify icon="eva:external-link-fill" />}
              >
                Abrir fatura no Asaas
              </Button>
            )}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" variant="outlined" onClick={onClose}>
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

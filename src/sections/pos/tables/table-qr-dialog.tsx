import type { DiningTable } from 'src/api/firestore/tables';

import { QRCodeSVG } from 'qrcode.react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  table: DiningTable | null;
  storeSlug?: string;
  storeName?: string;
  onClose: () => void;
};

export function TableQrDialog({ open, table, storeSlug, storeName, onClose }: Props) {
  if (!table) {
    return <Dialog open={false} onClose={onClose} />;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const tableUrl = storeSlug ? `${origin}/p/${storeSlug}/mesa/${table.qrCodeSlug}` : '';

  const handleCopyLink = async () => {
    if (!tableUrl) return;
    try {
      await navigator.clipboard.writeText(tableUrl);
      toast.success('Link da mesa copiado!');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <style>
        {`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #table-qr-printable-area,
            #table-qr-printable-area * {
              visibility: visible !important;
            }
            #table-qr-printable-area {
              position: fixed !important;
              left: 0 !important;
              top: 0 !important;
              width: 73.5mm !important;
              max-width: 73.5mm !important;
              box-sizing: border-box !important;
              margin: 0 !important;
              padding: 2mm !important;
              border: 1px dashed #222 !important;
              border-radius: 4px !important;
              background: #FFFFFF !important;
              color: #000000 !important;
              box-shadow: none !important;
            }
            @page {
              margin: 3mm;
            }
          }
        `}
      </style>

      <DialogTitle sx={{ textAlign: 'center' }}>
        QR Code · Mesa {table.number}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} alignItems="center" sx={{ pt: 1 }}>
          {!storeSlug ? (
            <Alert severity="warning" sx={{ width: '100%' }}>
              Configure o slug da <strong>Loja Online</strong> em Conta → Loja Online para gerar o
              QR Code exclusivo das mesas.
            </Alert>
          ) : (
            <>
              <Box
                id="table-qr-printable-area"
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  bgcolor: 'common.white',
                  color: 'grey.900',
                  border: (theme) => `2px dashed ${theme.vars.palette.divider}`,
                  textAlign: 'center',
                  width: '100%',
                }}
              >
                {storeName && (
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.25 }}>
                    {storeName}
                  </Typography>
                )}
                <Typography variant="h5" color="primary.main" sx={{ fontWeight: 800, mb: 1.25 }}>
                  MESA {table.number}
                </Typography>

                <Box sx={{ display: 'inline-block', p: 0.5, bgcolor: 'common.white' }}>
                  <QRCodeSVG value={tableUrl} size={184} includeMargin={false} />
                </Box>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 1, lineHeight: 1.1 }}
                >
                  Aponte a câmera do celular para ver o cardápio e fazer seu pedido direto da mesa!
                </Typography>
              </Box>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ wordBreak: 'break-all', textAlign: 'center' }}
              >
                {tableUrl}
              </Typography>
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" color="inherit" onClick={onClose}>
          Fechar
        </Button>
        {tableUrl && (
          <>
            <Button
              variant="soft"
              color="primary"
              onClick={handleCopyLink}
              startIcon={<Iconify icon="solar:copy-bold" />}
            >
              Copiar link
            </Button>
            <Button
              variant="contained"
              onClick={() => window.print()}
              startIcon={<Iconify icon="solar:printer-minimalistic-bold" />}
            >
              Imprimir placa
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

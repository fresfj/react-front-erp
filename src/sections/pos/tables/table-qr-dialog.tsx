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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" className="table-qr-dialog-root">
      <style>
        {`
          @media print {
            html, body {
              width: auto !important;
              height: auto !important;
              min-height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #FFFFFF !important;
              overflow: visible !important;
            }
            body > *:not(.table-qr-dialog-root) {
              display: none !important;
            }
            .table-qr-dialog-root,
            .table-qr-dialog-root .MuiDialog-container,
            .table-qr-dialog-root .MuiDialog-paper,
            .table-qr-dialog-root .MuiDialogContent-root {
              position: static !important;
              display: block !important;
              width: auto !important;
              height: auto !important;
              min-height: 0 !important;
              max-height: none !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              background: #FFFFFF !important;
              box-shadow: none !important;
              transform: none !important;
            }
            .table-qr-dialog-root .MuiBackdrop-root,
            .table-qr-no-print {
              display: none !important;
            }
            #table-qr-printable-area {
              position: static !important;
              width: 73.5mm !important;
              max-width: 73.5mm !important;
              min-height: 0 !important;
              box-sizing: border-box !important;
              margin: 0 !important;
              padding: 2mm !important;
              border: 1px dashed #222 !important;
              border-radius: 4px !important;
              background: #FFFFFF !important;
              color: #000000 !important;
              box-shadow: none !important;
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
            @page {
              margin: 3mm;
            }
          }
        `}
      </style>

      <DialogTitle className="table-qr-no-print" sx={{ textAlign: 'center' }}>
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
                className="table-qr-no-print"
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

      <DialogActions className="table-qr-no-print" sx={{ px: 3, pb: 3 }}>
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

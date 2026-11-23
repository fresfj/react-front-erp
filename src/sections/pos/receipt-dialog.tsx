import type { Sale } from 'src/api/firestore/sales';
import type { Enterprise, ReceiptModelType } from 'src/api/firestore/platform';

import { QRCodeSVG } from 'qrcode.react';
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer';
import { useRef, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import NoSsr from '@mui/material/NoSsr';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import DialogContent from '@mui/material/DialogContent';
import CircularProgress from '@mui/material/CircularProgress';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { formatCpf, formatCnpj } from 'src/utils/br-docs';
import { fNumber, fCurrency } from 'src/utils/format-number';

import { Iconify } from 'src/components/iconify';

import { resolveNfceQrCodeDisplay } from 'src/sections/fiscal/sefaz-simulator-client';

import { ReceiptPDF } from './receipt-pdf';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  onClose: () => void;
  sale: Sale;
  enterprise?: Enterprise | null;
  onOpenEmail?: () => void;
  initialPdfView?: boolean;
  autoPrint?: boolean;
  onAutoPrintDone?: () => void;
};

export function ReceiptDialog({
  open,
  onClose,
  sale,
  enterprise,
  onOpenEmail,
  initialPdfView,
  autoPrint,
  onAutoPrintDone,
}: Props) {
  const [model, setModel] = useState<ReceiptModelType>(
    enterprise?.receiptDefaultModel || '58mm'
  );
  const [bold, setBold] = useState<boolean>(enterprise?.receiptBold ?? true);
  const [showLogo, setShowLogo] = useState<boolean>(enterprise?.receiptShowLogo ?? true);

  const pdfView = useBoolean();
  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && initialPdfView) {
      pdfView.onTrue();
    }
  }, [open, initialPdfView, pdfView]);

  // Sync enterprise preferences when enterprise changes
  useEffect(() => {
    if (enterprise?.receiptDefaultModel) {
      setModel(enterprise.receiptDefaultModel);
    }
    if (enterprise?.receiptBold !== undefined) {
      setBold(enterprise.receiptBold);
    }
    if (enterprise?.receiptShowLogo !== undefined) {
      setShowLogo(enterprise.receiptShowLogo);
    }
  }, [enterprise]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Auto-print immediately when triggered via Quick Print (F9 / Ctrl+P)
  useEffect(() => {
    if (!open || !autoPrint || pdfView.value) {
      return undefined;
    }

    const handleAfterPrint = () => {
      onAutoPrintDone?.();
    };

    window.addEventListener('afterprint', handleAfterPrint, { once: true });
    const timer = window.setTimeout(() => {
      window.print();
    }, 180);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [open, autoPrint, pdfView.value, onAutoPrintDone]);

  // Keyboard shortcuts when dialog is open
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Print: Enter or 'p' or Ctrl+P
      if (e.key === 'Enter' || key === 'p') {
        if (!e.ctrlKey && !e.metaKey && key === 'p') {
          e.preventDefault();
          handlePrint();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          handlePrint();
          return;
        }
      }

      // Switch models with 1, 2, 3
      if (key === '1') {
        e.preventDefault();
        setModel('58mm');
      } else if (key === '2') {
        e.preventDefault();
        setModel('80mm');
      } else if (key === '3') {
        e.preventDefault();
        setModel('a5');
      } else if (key === 'b') {
        e.preventDefault();
        setBold((prev) => !prev);
      } else if (key === 'l') {
        e.preventDefault();
        setShowLogo((prev) => !prev);
      } else if (key === 'v') {
        e.preventDefault();
        pdfView.onTrue();
      } else if (key === 'e' && onOpenEmail) {
        e.preventDefault();
        onClose();
        onOpenEmail();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handlePrint, pdfView, onClose, onOpenEmail]);

  const is58 = model === '58mm';
  const is80 = model === '80mm';
  const isA5 = model === 'a5';

  const previewWidth = is58 ? 360 : is80 ? 460 : 640;

  const enterpriseAddress = [
    enterprise?.address ? `${enterprise.address}${enterprise.addressNumber ? `, ${enterprise.addressNumber}` : ''}` : '',
    enterprise?.neighborhood,
    enterprise?.city ? `${enterprise.city}${enterprise.state ? ` - ${enterprise.state}` : ''}` : '',
  ]
    .filter(Boolean)
    .join(' - ');

  const enterpriseCnpj = enterprise?.document ? formatCnpj(enterprise.document) : '';
  const customerDoc = sale.customerDocument
    ? sale.customerDocument.length === 11
      ? formatCpf(sale.customerDocument)
      : formatCnpj(sale.customerDocument)
    : '';

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen
        PaperProps={{
          sx: {
            bgcolor: '#1E1E24',
            color: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Style injection for exact thermal and A5 receipt printing */}
        <style>
          {`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #receipt-printable-area, #receipt-printable-area * {
                visibility: visible !important;
              }
              #receipt-printable-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: ${is58 ? '58mm' : is80 ? '80mm' : '148mm'} !important;
                margin: 0 !important;
                padding: ${isA5 ? '8mm' : '2mm'} !important;
                background: #FFFFFF !important;
                color: #000000 !important;
                box-shadow: none !important;
              }
              @page {
                size: ${is58 ? '58mm auto' : is80 ? '80mm auto' : '148mm 210mm'};
                margin: ${isA5 ? '5mm' : '0mm'};
              }
            }
          `}
        </style>

        {/* Top Control Bar (Styled exactly like user reference image) */}
        <Box
          sx={{
            px: { xs: 2, md: 3 },
            py: 1.5,
            bgcolor: '#111317',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          {/* Left: Toggles (Negrito, Logo) */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              size="small"
              variant={bold ? 'contained' : 'outlined'}
              color={bold ? 'inherit' : 'inherit'}
              startIcon={
                <Iconify
                  icon={bold ? 'solar:text-bold' : 'solar:text-cross-bold'}
                  width={18}
                />
              }
              onClick={() => setBold((prev) => !prev)}
              sx={{
                bgcolor: bold ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                borderColor: 'rgba(255, 255, 255, 0.25)',
                color: '#FFFFFF',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.25)',
                },
              }}
            >
              Negrito: {bold ? 'Forte' : 'Normal'}
            </Button>

            <Button
              size="small"
              variant={showLogo ? 'contained' : 'outlined'}
              color="inherit"
              startIcon={
                <Iconify
                  icon={showLogo ? 'solar:gallery-bold' : 'solar:gallery-cross-bold'}
                  width={18}
                />
              }
              onClick={() => setShowLogo((prev) => !prev)}
              sx={{
                bgcolor: showLogo ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                borderColor: 'rgba(255, 255, 255, 0.25)',
                color: '#FFFFFF',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.25)',
                },
              }}
            >
              {showLogo ? 'Com logo' : 'Sem logo'}
            </Button>
          </Stack>

          {/* Right: Model Selector + Action Buttons */}
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="receipt-model-label" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                Modelo
              </InputLabel>
              <Select
                labelId="receipt-model-label"
                value={model}
                label="Modelo"
                onChange={(e) => setModel(e.target.value as ReceiptModelType)}
                sx={{
                  color: '#FFFFFF',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  bgcolor: 'rgba(255, 255, 255, 0.08)',
                  '.MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                  },
                  '.MuiSvgIcon-root': { color: '#FFFFFF' },
                }}
              >
                <MenuItem value="58mm">🧾 Cupom 58mm (Térmica)</MenuItem>
                <MenuItem value="80mm">🧾 Cupom 80mm (Térmica)</MenuItem>
                <MenuItem value="a5">📄 Recibo A5 (Meia A4)</MenuItem>
              </Select>
            </FormControl>

            {/* Print Direct */}
            <Button
              variant="contained"
              color="primary"
              size="medium"
              startIcon={<Iconify icon="solar:printer-minimalistic-bold" />}
              onClick={handlePrint}
            >
              Imprimir
            </Button>

            {/* View PDF (Minimals standard PDFViewer like Invoice) */}
            <Tooltip title="Visualizar em PDF">
              <IconButton
                onClick={pdfView.onTrue}
                sx={{
                  color: '#FFFFFF',
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                  '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' },
                }}
              >
                <Iconify icon="solar:eye-bold" />
              </IconButton>
            </Tooltip>

            {/* Download PDF */}
            <NoSsr>
              <PDFDownloadLink
                document={
                  <ReceiptPDF
                    sale={sale}
                    enterprise={enterprise}
                    model={model}
                    bold={bold}
                    showLogo={showLogo}
                  />
                }
                fileName={`Cupom-${sale.code}-${model}.pdf`}
                style={{ textDecoration: 'none' }}
              >
                {({ loading }) => (
                  <Tooltip title="Baixar PDF">
                    <IconButton
                      disabled={loading}
                      sx={{
                        color: '#FFFFFF',
                        bgcolor: 'rgba(255, 255, 255, 0.1)',
                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' },
                      }}
                    >
                      {loading ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <Iconify icon="eva:cloud-download-fill" />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
              </PDFDownloadLink>
            </NoSsr>

            {/* Send Email */}
            {onOpenEmail && (
              <Tooltip title="Enviar por E-mail">
                <IconButton
                  onClick={() => {
                    onClose();
                    onOpenEmail();
                  }}
                  sx={{
                    color: '#FFFFFF',
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                    '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.2)' },
                  }}
                >
                  <Iconify icon="iconamoon:send-fill" />
                </IconButton>
              </Tooltip>
            )}

            {/* Close */}
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              onClick={onClose}
              sx={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}
            >
              Fechar
            </Button>
          </Stack>
        </Box>

        {/* Receipt Content Area */}
        <DialogContent
          sx={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            p: { xs: 2, md: 4 },
            overflowY: 'auto',
            bgcolor: '#282A36',
          }}
        >
          {/* The Printable White Paper */}
          <Box
            id="receipt-printable-area"
            ref={printAreaRef}
            sx={{
              width: { xs: '100%', sm: previewWidth },
              maxWidth: previewWidth,
              bgcolor: '#FFFFFF',
              color: '#000000',
              p: isA5 ? 4 : is58 ? 2 : 2.5,
              borderRadius: 0.5,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: isA5 ? 13 : is58 ? 11 : 12,
              lineHeight: 1.35,
              fontWeight: bold ? 700 : 500,
              wordBreak: 'break-word',
            }}
          >
            {/* Logo */}
            {showLogo && (
              <Box sx={{ textAlign: 'center', mb: 1.5 }}>
                <Box
                  component="img"
                  src="/logo/logo-single.png"
                  alt="Logo"
                  sx={{
                    width: isA5 ? 54 : is58 ? 36 : 42,
                    height: isA5 ? 54 : is58 ? 36 : 42,
                    mx: 'auto',
                    display: 'block',
                  }}
                />
              </Box>
            )}

            {/* Enterprise Header */}
            <Box sx={{ textAlign: 'center', mb: 1 }}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontFamily: 'inherit',
                  fontWeight: 'bold',
                  fontSize: isA5 ? 16 : is58 ? 13 : 14,
                  textTransform: 'uppercase',
                }}
              >
                {enterprise?.tradeName || enterprise?.name || 'ERP MINIMALS'}
              </Typography>
              {enterprise?.name && enterprise?.tradeName && (
                <Box sx={{ fontSize: is58 ? 9 : 10 }}>{enterprise.name}</Box>
              )}
              {enterpriseCnpj && (
                <Box sx={{ fontSize: is58 ? 9 : 10 }}>
                  CNPJ: {enterpriseCnpj}
                  {enterprise?.stateRegistration ? ` • IE: ${enterprise.stateRegistration}` : ''}
                </Box>
              )}
              {enterpriseAddress && (
                <Box sx={{ fontSize: is58 ? 8.5 : 9.5 }}>{enterpriseAddress}</Box>
              )}
              {enterprise?.phone && (
                <Box sx={{ fontSize: is58 ? 8.5 : 9.5 }}>Tel: {enterprise.phone}</Box>
              )}
            </Box>

            <Box sx={{ textAlign: 'center', my: 0.5 }}>
              --------------------------------------------------
            </Box>

            {/* Receipt / NFC-e Title */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontFamily: 'inherit',
                  fontWeight: 'bold',
                  fontSize: isA5 ? 14 : is58 ? 12 : 13,
                  textTransform: 'uppercase',
                }}
              >
                {sale.nfceStatus === 'authorized'
                  ? 'DANFE NFC-e - DOCUMENTO AUXILIAR'
                  : 'CUPOM NÃO FISCAL'}
              </Typography>
              <Box sx={{ fontSize: is58 ? 9.5 : 10.5 }}>
                {sale.nfceStatus === 'authorized'
                  ? `NFC-e Nº ${sale.nfceNumber || sale.code} • Série ${enterprise?.nfceSeries || '1'}`
                  : `Venda: ${sale.code}`}
              </Box>
            </Box>

            <Box sx={{ textAlign: 'center', my: 0.5 }}>
              --------------------------------------------------
            </Box>

            {/* Meta: Data, Hora, Status */}
            <Stack direction="row" justifyContent="space-between" sx={{ fontSize: is58 ? 9.5 : 10.5 }}>
              <span>Data: {fDateTime(sale.createdAt)}</span>
              <span>{sale.status === 'completed' ? 'CONCLUÍDO' : 'CANCELADO'}</span>
            </Stack>

            <Box sx={{ textAlign: 'center', my: 0.5 }}>
              --------------------------------------------------
            </Box>

            {/* Cliente */}
            <Box sx={{ fontSize: is58 ? 9.5 : 10.5 }}>
              <div>CLIENTE: {sale.customerName || 'CONSUMIDOR FINAL'}</div>
              {customerDoc && <div>CPF/CNPJ: {customerDoc}</div>}
              {sale.customerAddress && <div>Endereço: {sale.customerAddress}</div>}
            </Box>

            <Box sx={{ textAlign: 'center', my: 0.5 }}>
              --------------------------------------------------
            </Box>

            {/* Itens */}
            <Box sx={{ fontSize: is58 ? 9.5 : 10.5 }}>
              <Box sx={{ fontWeight: 'bold', mb: 0.5 }}>ITENS</Box>
              {sale.items.map((item, idx) => (
                <Box key={idx} sx={{ mb: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <span>
                      {idx + 1}. {item.productName}
                    </span>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" sx={{ color: '#222' }}>
                    <span>
                      Cód: {item.productSku || '—'}{' '}
                      {item.lotCode ? `[Lote: ${item.lotCode}]` : ''}
                    </span>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" sx={{ fontWeight: 'bold' }}>
                    <span>
                      {fNumber(item.qty)} {item.unit} x {fCurrency(item.unitPrice)}
                    </span>
                    <span>{fCurrency(item.lineTotal)}</span>
                  </Stack>
                </Box>
              ))}
            </Box>

            <Box sx={{ textAlign: 'center', my: 0.5 }}>
              --------------------------------------------------
            </Box>

            {/* Totais */}
            <Stack spacing={0.5} sx={{ fontSize: is58 ? 10 : 11 }}>
              <Stack direction="row" justifyContent="space-between">
                <span>QTD ITENS:</span>
                <span>{sale.items.reduce((acc, cur) => acc + cur.qty, 0)}</span>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <span>SUBTOTAL:</span>
                <span>{fCurrency(sale.subtotal)}</span>
              </Stack>
              {sale.discountAmount > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <span>DESCONTO:</span>
                  <span>- {fCurrency(sale.discountAmount)}</span>
                </Stack>
              )}
              {sale.deliveryFee != null && sale.deliveryFee > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <span>TAXA DE ENTREGA:</span>
                  <span>+ {fCurrency(sale.deliveryFee)}</span>
                </Stack>
              )}
              {sale.feesPassedToCustomer && sale.surchargeAmount != null && sale.surchargeAmount > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <span>ACRÉSCIMO TAXA CARTÃO:</span>
                  <span>+ {fCurrency(sale.surchargeAmount)}</span>
                </Stack>
              )}
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{
                  fontWeight: 'bold',
                  fontSize: isA5 ? 16 : is58 ? 13 : 14,
                  py: 0.5,
                  borderTop: '2px solid #000',
                  borderBottom: '2px solid #000',
                  my: 0.5,
                }}
              >
                <span>TOTAL:</span>
                <span>{fCurrency(sale.total)}</span>
              </Stack>
            </Stack>

            <Box sx={{ textAlign: 'center', my: 0.5 }}>
              --------------------------------------------------
            </Box>

            {/* Pagamentos */}
            <Box sx={{ fontSize: is58 ? 9.5 : 10.5 }}>
              <Box sx={{ fontWeight: 'bold', mb: 0.5 }}>PAGAMENTO</Box>
              {sale.payments.map((p, idx) => {
                const methodLabel =
                  p.method === 'cash'
                    ? 'DINHEIRO'
                    : p.method === 'pix'
                      ? 'PIX'
                      : p.method === 'credit_card'
                        ? 'CARTÃO DE CRÉDITO'
                        : p.method === 'debit_card'
                          ? 'CARTÃO DE DÉBITO'
                          : p.method === 'credit_tab'
                            ? 'CREDIÁRIO / FIADO'
                            : p.method.toUpperCase();
                const installmentSuffix =
                  p.installments && p.installments > 1
                    ? ` (${p.installments}x de ${fCurrency(p.amount / p.installments)})`
                    : '';
                return (
                  <Stack key={idx} direction="row" justifyContent="space-between">
                    <span>
                      {methodLabel}
                      {installmentSuffix}:
                    </span>
                    <span>{fCurrency(p.amount)}</span>
                  </Stack>
                );
              })}
              {sale.changeAmount > 0 && (
                <Stack direction="row" justifyContent="space-between" sx={{ fontWeight: 'bold' }}>
                  <span>TROCO:</span>
                  <span>{fCurrency(sale.changeAmount)}</span>
                </Stack>
              )}
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                <span>ENTREGA:</span>
                <span>
                  {sale.deliveryType === 'delivery' ? 'ENTREGA / DELIVERY' : 'RETIRADO NO LOCAL'}
                </span>
              </Stack>
              {sale.deliveryType === 'delivery' && sale.deliveryAddress && (
                <Box sx={{ fontSize: is58 ? 8.5 : 9.5, mt: 0.25 }}>
                  End. Entrega: {sale.deliveryAddress}
                </Box>
              )}
            </Box>

            {/* Dados NFC-e + QR Code padrão DANFE NFC-e */}
            {sale.nfceKey && (() => {
              const qrDisplay = resolveNfceQrCodeDisplay(sale, enterprise);
              const isHomologOrSim =
                sale.nfceSimulated || enterprise?.nfceEnvironment !== 'production';
              return (
                <>
                  <Box sx={{ textAlign: 'center', my: 0.5 }}>
                    --------------------------------------------------
                  </Box>
                  <Box sx={{ fontSize: is58 ? 8.5 : 9.5, textAlign: 'center' }}>
                    {qrDisplay && (
                      <Box sx={{ fontSize: is58 ? 7.5 : 8.5, mb: 0.5 }}>
                        Consulte pela Chave de Acesso em:
                        <br />
                        <Box component="span" sx={{ wordBreak: 'break-all' }}>
                          {qrDisplay.consultaUrl}
                        </Box>
                      </Box>
                    )}
                    <Box sx={{ fontWeight: 'bold' }}>CHAVE DE ACESSO</Box>
                    <Box sx={{ wordBreak: 'break-all', my: 0.5, letterSpacing: 0.5 }}>
                      {sale.nfceKey.replace(/(\d{4})/g, '$1 ').trim()}
                    </Box>
                    {sale.nfceNumber && (
                      <Box sx={{ mb: 0.25 }}>
                        NFC-e nº {sale.nfceNumber} • Série {enterprise?.nfceSeries || '1'}
                      </Box>
                    )}
                    {sale.nfceProtocol && (
                      <Box>
                        Protocolo de Autorização: {sale.nfceProtocol}
                        <br />
                        Emissão: {fDateTime(sale.nfceIssuedAt || sale.createdAt)}
                      </Box>
                    )}
                    {qrDisplay && (
                      <Box
                        sx={{
                          mt: 1,
                          mb: 0.5,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                        }}
                      >
                        <QRCodeSVG
                          value={qrDisplay.qrValue}
                          size={is58 ? 116 : 140}
                          level="M"
                          includeMargin
                        />
                        <Box sx={{ fontSize: is58 ? 7.5 : 8.5, mt: 0.25 }}>
                          Consulta via leitor de QR Code
                        </Box>
                      </Box>
                    )}
                    {isHomologOrSim && (
                      <Box sx={{ fontSize: is58 ? 7.5 : 8, fontWeight: 'bold', mt: 0.5 }}>
                        EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL
                      </Box>
                    )}
                  </Box>
                </>
              );
            })()}

            <Box sx={{ textAlign: 'center', my: 0.5 }}>
              --------------------------------------------------
            </Box>

            {/* Mensagem Rodapé */}
            <Box sx={{ textAlign: 'center', mt: 1, fontSize: is58 ? 9 : 10 }}>
              <Box sx={{ fontWeight: 'bold' }}>
                {enterprise?.receiptFooterMessage || 'OBRIGADO PELA PREFERÊNCIA!'}
              </Box>
              <Box>VOLTE SEMPRE</Box>
              {sale.nfceStatus !== 'authorized' && (
                <Box sx={{ fontSize: is58 ? 8 : 8.5, color: '#444', mt: 0.5 }}>
                  Este não é um documento fiscal
                </Box>
              )}
              <Box sx={{ fontSize: is58 ? 7.5 : 8.5, color: '#666', mt: 0.5 }}>
                Emitido em {fDateTime(new Date().toISOString())}
              </Box>
            </Box>

            {/* Assinatura */}
            {(isA5 || sale.payments.some((p) => p.method === 'credit_tab')) && (
              <Box sx={{ mt: 3, pt: 1, textAlign: 'center' }}>
                <Box
                  sx={{
                    width: '80%',
                    mx: 'auto',
                    borderBottom: '1px solid #000',
                    mb: 0.5,
                  }}
                />
                <Box sx={{ fontSize: is58 ? 8.5 : 9.5 }}>Assinatura do Cliente</Box>
              </Box>
            )}
          </Box>

          {/* Keyboard Shortcuts Chips Helper at bottom */}
          <Stack
            direction="row"
            spacing={1}
            justifyContent="center"
            flexWrap="wrap"
            sx={{ mt: 3, opacity: 0.85 }}
          >
            <Chip size="small" label="[Enter / P] Imprimir" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF' }} />
            <Chip size="small" label="[1] 58mm" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF' }} />
            <Chip size="small" label="[2] 80mm" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF' }} />
            <Chip size="small" label="[3] Recibo A5" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF' }} />
            <Chip size="small" label="[B] Negrito" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF' }} />
            <Chip size="small" label="[L] Logo" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF' }} />
            <Chip size="small" label="[V] PDF" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF' }} />
            <Chip size="small" label="[Esc] Fechar" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFF' }} />
          </Stack>
        </DialogContent>
      </Dialog>

      {/* PDF Fullscreen Viewer Dialog (Minimals standard, matching Invoice) */}
      <Dialog fullScreen open={pdfView.value} onClose={pdfView.onFalse}>
        <Box sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              p: 1.5,
              bgcolor: '#111317',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography variant="subtitle1" sx={{ color: '#FFFFFF' }}>
              Visualizador de PDF — Cupom / NFC-e ({model})
            </Typography>
            <Button color="inherit" variant="contained" onClick={pdfView.onFalse}>
              Fechar
            </Button>
          </Box>

          <Box sx={{ flexGrow: 1, height: 'calc(100% - 60px)', overflow: 'hidden' }}>
            <PDFViewer width="100%" height="100%" style={{ border: 'none' }}>
              <ReceiptPDF
                sale={sale}
                enterprise={enterprise}
                model={model}
                bold={bold}
                showLogo={showLogo}
              />
            </PDFViewer>
          </Box>
        </Box>
      </Dialog>
    </>
  );
}

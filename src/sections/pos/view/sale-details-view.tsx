import type { Sale } from 'src/api/firestore/sales';
import type { Enterprise } from 'src/api/firestore/platform';

import { QRCodeSVG } from 'qrcode.react';
import { doc, updateDoc } from 'firebase/firestore';
import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import Grid from '@mui/material/Unstable_Grid2';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import ListItemText from '@mui/material/ListItemText';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fCurrency } from 'src/utils/format-number';
import { formatCnpj , formatPhoneBr } from 'src/utils/br-docs';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { cancelSaleNfceCf } from 'src/api/firestore/nfce';
import { getEnterprise } from 'src/api/firestore/platform';
import { enterpriseCollection } from 'src/api/firestore/paths';
import { sendSaleReceiptWhatsappCf } from 'src/api/firestore/whatsapp';
import {
  getSale,
  cancelSale,
  issueSaleNfce,
  recordSaleEmailSent,
} from 'src/api/firestore/sales';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

import {
  resolveNfceQrCodeDisplay,
  simulateSefazNfceForSale,
} from 'src/sections/fiscal/sefaz-simulator-client';

import { useAuthContext } from 'src/auth/hooks';

import { ReceiptDialog } from '../receipt-dialog';

// ----------------------------------------------------------------------

type Props = {
  saleId: string;
};

export function SaleDetailsView({ saleId }: Props) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const popover = usePopover();
  const emailDialog = useBoolean();
  const whatsappDialog = useBoolean();
  const cupomDialog = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [sale, setSale] = useState<Sale | null>(null);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [openInPdf, setOpenInPdf] = useState(false);
  const [autoPrint, setAutoPrint] = useState(false);
  const [issuingNfce, setIssuingNfce] = useState(false);
  const [lastSimulatedXml, setLastSimulatedXml] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  const loadSale = useCallback(async () => {
    if (!enterpriseId || !saleId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [data, entData] = await Promise.all([
        getSale(enterpriseId, saleId),
        getEnterprise(enterpriseId),
      ]);
      setSale(data);
      setEnterprise(entData);
      if (data?.customerEmail) {
        setRecipientEmail(data.customerEmail);
      }
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('pos.loadError')));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, saleId, t]);

  useEffect(() => {
    loadSale();
  }, [loadSale]);

  const handleIssueNfce = useCallback(async () => {
    if (!enterpriseId || !sale) return;
    setIssuingNfce(true);
    try {
      const shouldSimulate =
        !enterprise ||
        enterprise.fiscalIssuerProvider === 'sefaz-simulator' ||
        !enterprise.hasFiscalSecrets;

      if (shouldSimulate && enterprise) {
        const sim = await simulateSefazNfceForSale(enterpriseId, sale, enterprise);
        setLastSimulatedXml(sim.xmlPreview);
        toast.success(
          `NFC-e simulada #${sim.nfceNumber} gerada (UF ${enterprise.state || 'PR'} — sem A1)!`
        );
      } else {
        await issueSaleNfce(enterpriseId, sale);
        toast.success(t('fiscal.issueSuccess'));
      }
      await loadSale();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('fiscal.issueError')));
      await loadSale();
    } finally {
      setIssuingNfce(false);
    }
  }, [enterpriseId, sale, enterprise, loadSale, t]);

  const handleDownloadSimulatedXml = useCallback(() => {
    if (!lastSimulatedXml || !sale?.nfceKey) return;
    const blob = new Blob([lastSimulatedXml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NFCe-${sale.nfceKey}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  }, [lastSimulatedXml, sale?.nfceKey]);

  const handleCancelNfce = useCallback(async () => {
    if (!enterpriseId || !sale) return;
    if (!window.confirm(t('fiscal.cancel'))) return;
    setIssuingNfce(true);
    try {
      if (sale.nfceSimulated) {
        const ref = doc(enterpriseCollection(enterpriseId, 'sales'), sale.id);
        await updateDoc(ref, {
          nfceStatus: 'cancelled',
          updatedAt: new Date().toISOString(),
        });
      } else {
        await cancelSaleNfceCf({ enterpriseId, saleId: sale.id });
      }
      toast.success(t('fiscal.cancel'));
      await loadSale();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('fiscal.issueError')));
    } finally {
      setIssuingNfce(false);
    }
  }, [enterpriseId, sale, loadSale, t]);

  const handlePrintCupom = useCallback(() => {
    setOpenInPdf(false);
    setAutoPrint(false);
    cupomDialog.onTrue();
  }, [cupomDialog]);

  const handleQuickPrint = useCallback(() => {
    setOpenInPdf(false);
    setAutoPrint(true);
    cupomDialog.onTrue();
  }, [cupomDialog]);

  const handleOpenPdf = useCallback(() => {
    setOpenInPdf(true);
    setAutoPrint(false);
    cupomDialog.onTrue();
  }, [cupomDialog]);

  // Global keyboard shortcuts on SaleDetailsView
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      // If a modal is open, let modal handle shortcuts
      if (cupomDialog.value || emailDialog.value || whatsappDialog.value) return;

      const key = e.key.toLowerCase();
      // Quick Print: F9 or Ctrl+P / Cmd+P
      if (e.key === 'F9' || ((e.ctrlKey || e.metaKey) && key === 'p')) {
        e.preventDefault();
        handleQuickPrint();
      } else if (key === 'p' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handlePrintCupom();
      } else if (key === 'v') {
        e.preventDefault();
        handleOpenPdf();
      } else if (key === 'e') {
        e.preventDefault();
        emailDialog.onTrue();
      } else if (key === 'n' && sale?.nfceStatus !== 'authorized' && sale?.status === 'completed') {
        e.preventDefault();
        handleIssueNfce();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cupomDialog,
    emailDialog,
    whatsappDialog,
    sale,
    handleIssueNfce,
    handleOpenPdf,
    handlePrintCupom,
    handleQuickPrint,
  ]);

  const handleSendEmail = async () => {
    if (!enterpriseId || !sale) return;
    const cleanEmail = recipientEmail.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error('Informe um e-mail válido para envio da NFC-e / Cupom');
      return;
    }

    setSendingEmail(true);
    try {
      await recordSaleEmailSent(enterpriseId, sale.id, cleanEmail);

      const enterpriseHeader = [
        enterprise?.tradeName || enterprise?.name || 'ERP MINIMALS',
        enterprise?.document ? `CNPJ: ${formatCnpj(enterprise.document)}` : '',
        enterprise?.stateRegistration ? `IE: ${enterprise.stateRegistration}` : '',
        enterprise?.address
          ? `${enterprise.address}${enterprise.addressNumber ? `, ${enterprise.addressNumber}` : ''} - ${enterprise.city || ''}/${enterprise.state || ''}`
          : '',
        enterprise?.phone ? `Tel: ${enterprise.phone}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      // Prepare mailto fallback + confirmation
      const subject = encodeURIComponent(
        `Cupom Fiscal / NFC-e - Pedido ${sale.code} (${fCurrency(sale.total)}) - ${enterprise?.tradeName || enterprise?.name || 'ERP'}`
      );
      const itemsLines = sale.items
        .map(
          (i) =>
            `- ${i.productName} (${i.qty} ${i.unit} x ${fCurrency(i.unitPrice)}) = ${fCurrency(
              i.lineTotal
            )} [Lote: ${i.lotCode || 'N/A'}]`
        )
        .join('\n');
      const body = encodeURIComponent(
        `EMPRESA EMISSORA:\n${enterpriseHeader}\n\n` +
          `Olá ${sale.customerName || 'Cliente'},\n\nSegue o resumo do seu Cupom Fiscal / NFC-e:\n\n` +
          `Venda: ${sale.code}\nData: ${fDateTime(sale.createdAt)}\n${
            sale.nfceKey
              ? `Chave de Acesso NFC-e: ${sale.nfceKey}\nProtocolo SEFAZ: ${sale.nfceProtocol}\nSérie: ${enterprise?.nfceSeries || '1'}\n`
              : ''
          }\nItens:\n${itemsLines}\n\n` +
          `Subtotal: ${fCurrency(sale.subtotal)}\n` +
          `Desconto: ${fCurrency(sale.discountAmount)}\n` +
          `Total Pago: ${fCurrency(sale.total)}\n\n` +
          `Formas de Pagamento:\n${
          sale.payments.map((p) => `- ${p.method.toUpperCase()}: ${fCurrency(p.amount)}`).join('\n')
          }${sale.changeAmount > 0 ? `\n- Troco: ${fCurrency(sale.changeAmount)}` : ''
          }\n\n${emailMessage ? `${emailMessage}\n\n` : ''}` +
          `${enterprise?.receiptFooterMessage || 'Obrigado pela preferência! Volte sempre.'}`
      );

      window.open(`mailto:${cleanEmail}?subject=${subject}&body=${body}`, '_blank');

      toast.success(`NFC-e / Cupom Fiscal enviado para ${cleanEmail}!`);
      emailDialog.onFalse();
      await loadSale();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao registrar envio de e-mail'));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleChangeStatus = async (newStatus: 'completed' | 'cancelled') => {
    if (!enterpriseId || !sale || sale.status === newStatus) return;
    if (newStatus === 'cancelled') {
      try {
        await cancelSale(enterpriseId, sale);
        toast.success(t('pos.cancelSuccess'));
        await loadSale();
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, t('pos.cancelError')));
      }
    }
  };

  if (!loading && !sale) {
    return (
      <DashboardContent maxWidth="xl">
        <EmptyContent filled title={t('pos.notFound')} sx={{ py: 10 }} />
      </DashboardContent>
    );
  }

  const renderTotal = sale && (
    <Stack
      spacing={2}
      alignItems="flex-end"
      sx={{ p: 3, textAlign: 'right', typography: 'body2' }}
    >
      <Stack direction="row">
        <Box sx={{ color: 'text.secondary' }}>{t('pos.fields.subtotal')}</Box>
        <Box sx={{ width: 160, typography: 'subtitle2' }}>{fCurrency(sale.subtotal)}</Box>
      </Stack>

      <Stack direction="row">
        <Box sx={{ color: 'text.secondary' }}>{t('pos.fields.discountAmount')}</Box>
        <Box sx={{ width: 160, ...(sale.discountAmount > 0 && { color: 'error.main' }) }}>
          {sale.discountAmount > 0 ? `- ${fCurrency(sale.discountAmount)}` : '—'}
        </Box>
      </Stack>

      <Stack direction="row">
        <Box sx={{ color: 'text.secondary' }}>{t('pos.fields.totalCost')}</Box>
        <Box sx={{ width: 160 }}>{fCurrency(sale.totalCost)}</Box>
      </Stack>

      <Stack direction="row">
        <Box sx={{ color: 'text.secondary' }}>{t('pos.fields.grossProfit')}</Box>
        <Box sx={{ width: 160, color: 'success.main', typography: 'subtitle2' }}>
          {fCurrency(sale.grossProfit)}
        </Box>
      </Stack>

      <Stack direction="row" sx={{ typography: 'subtitle1' }}>
        <div>{t('pos.fields.total')}</div>
        <Box sx={{ width: 160 }}>{fCurrency(sale.total)}</Box>
      </Stack>
    </Stack>
  );

  return (
    <>
      <DashboardContent maxWidth="xl">
        {/* OrderDetailsToolbar Exact Pattern */}
        {sale && (
          <Stack
            spacing={3}
            direction={{ xs: 'column', md: 'row' }}
            sx={{ mb: { xs: 3, md: 5 } }}
          >
            <Stack spacing={1} direction="row" alignItems="flex-start">
              <IconButton component={RouterLink} href={paths.dashboard.pos.sales}>
                <Iconify icon="eva:arrow-ios-back-fill" />
              </IconButton>

              <Stack spacing={0.5}>
                <Stack spacing={1} direction="row" alignItems="center" flexWrap="wrap">
                  <Typography variant="h4">Venda {sale.code}</Typography>
                  <Label
                    variant="soft"
                    color={sale.status === 'completed' ? 'success' : 'error'}
                  >
                    {sale.status === 'completed'
                      ? t('pos.status.completed')
                      : t('pos.status.cancelled')}
                  </Label>
                  <Label
                    variant="soft"
                    color={
                      sale.nfceStatus === 'authorized'
                        ? 'info'
                        : sale.nfceStatus === 'error'
                          ? 'error'
                          : sale.nfceStatus === 'cancelled'
                            ? 'default'
                            : 'warning'
                    }
                  >
                    {sale.nfceStatus === 'authorized'
                      ? `NFC-e #${sale.nfceNumber}`
                      : sale.nfceStatus === 'error'
                        ? t('fiscal.issueError')
                        : sale.nfceStatus === 'pending'
                          ? t('fiscal.pending')
                          : sale.nfceStatus === 'cancelled'
                            ? t('fiscal.cancel')
                            : 'Cupom Não-Fiscal'}
                  </Label>
                </Stack>

                <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                  {fDateTime(sale.createdAt)}
                </Typography>
              </Stack>
            </Stack>

            <Stack
              flexGrow={1}
              spacing={1.5}
              direction="row"
              alignItems="center"
              justifyContent="flex-end"
              flexWrap="wrap"
            >
              <Button
                color="inherit"
                variant="outlined"
                endIcon={<Iconify icon="eva:arrow-ios-downward-fill" />}
                onClick={popover.onOpen}
              >
                {sale.status === 'completed'
                  ? t('pos.status.completed')
                  : t('pos.status.cancelled')}
              </Button>

              {sale.nfceStatus !== 'authorized' &&
                sale.nfceStatus !== 'cancelled' &&
                sale.status === 'completed' && (
                  <Tooltip title="Emitir NFC-e na SEFAZ [Atalho: N]">
                    <LoadingButton
                      color="info"
                      variant="soft"
                      loading={issuingNfce}
                      startIcon={<Iconify icon="solar:document-add-bold" />}
                      onClick={handleIssueNfce}
                    >
                      {sale.nfceStatus === 'error' || sale.nfceStatus === 'pending'
                        ? t('fiscal.retry')
                        : t('fiscal.title')}
                    </LoadingButton>
                  </Tooltip>
                )}
              {sale.nfceStatus === 'authorized' && sale.status === 'completed' && (
                <LoadingButton
                  color="error"
                  variant="soft"
                  loading={issuingNfce}
                  onClick={handleCancelNfce}
                >
                  {t('fiscal.cancel')}
                </LoadingButton>
              )}

              <Tooltip title="Impressão Térmica Direta 80mm / 58mm [Atalho: F9 ou Ctrl+P | P: visualizar]">
                <Button
                  color="primary"
                  variant="contained"
                  startIcon={<Iconify icon="solar:printer-bold" />}
                  onClick={handleQuickPrint}
                >
                  Impressão Rápida (F9)
                </Button>
              </Tooltip>

              <Tooltip title="Enviar Comprovante por E-mail [Atalho: E]">
                <Button
                  color="inherit"
                  variant="outlined"
                  startIcon={<Iconify icon="iconamoon:send-fill" />}
                  onClick={() => {
                    setRecipientEmail(sale.customerEmail || '');
                    emailDialog.onTrue();
                  }}
                >
                  Enviar E-mail
                </Button>
              </Tooltip>

              <Tooltip title="Enviar Comprovante via WhatsApp (Plano Ultra)">
                <Button
                  color="success"
                  variant="soft"
                  startIcon={<Iconify icon="ic:baseline-whatsapp" />}
                  onClick={() => {
                    setWhatsappPhone(sale.customerPhone ? formatPhoneBr(sale.customerPhone) : '');
                    whatsappDialog.onTrue();
                  }}
                >
                  Enviar WhatsApp
                </Button>
              </Tooltip>

              <Button
                component={RouterLink}
                href={paths.dashboard.pos.checkout}
                color="inherit"
                variant="outlined"
                startIcon={<Iconify icon="mingcute:add-line" />}
              >
                {t('pos.newSale')}
              </Button>
            </Stack>
          </Stack>
        )}

        <CustomPopover
          open={popover.open}
          anchorEl={popover.anchorEl}
          onClose={popover.onClose}
          slotProps={{ arrow: { placement: 'top-right' } }}
        >
          <MenuList>
            <MenuItem
              selected={sale?.status === 'completed'}
              onClick={() => {
                popover.onClose();
                handleChangeStatus('completed');
              }}
            >
              {t('pos.status.completed')}
            </MenuItem>
            <MenuItem
              selected={sale?.status === 'cancelled'}
              onClick={() => {
                popover.onClose();
                handleChangeStatus('cancelled');
              }}
            >
              {t('pos.status.cancelled')}
            </MenuItem>
          </MenuList>
        </CustomPopover>

        {sale && (
          <Grid container spacing={3}>
            {/* Left column (md=8): OrderDetailsItems style */}
            <Grid xs={12} md={8}>
              <Stack spacing={3}>
                <Card>
                  <CardHeader title="Detalhes dos Itens" sx={{ mb: 3 }} />

                  <Divider />

                  <Scrollbar>
                    {sale.items.map((item, idx) => (
                      <Stack
                        key={`${item.productId}-${idx}`}
                        direction="row"
                        alignItems="center"
                        sx={{
                          p: 3,
                          minWidth: 640,
                          borderBottom: (theme) =>
                            `dashed 2px ${theme.vars.palette.background.neutral}`,
                        }}
                      >
                        <Avatar
                          variant="rounded"
                          sx={{
                            width: 48,
                            height: 48,
                            mr: 2,
                            bgcolor: 'background.neutral',
                            color: 'text.secondary',
                          }}
                        >
                          <Iconify icon="solar:box-minimalistic-bold" width={24} />
                        </Avatar>

                        <ListItemText
                          primary={item.productName}
                          secondary={`${item.productSku} • Lote: ${item.lotCode || '—'} • CMV: ${fCurrency(item.unitCost)}`}
                          primaryTypographyProps={{ typography: 'body2', fontWeight: 600 }}
                          secondaryTypographyProps={{
                            component: 'span',
                            color: 'text.disabled',
                            mt: 0.5,
                          }}
                        />

                        <Box sx={{ typography: 'body2' }}>
                          {fNumber(item.qty)} {item.unit} × {fCurrency(item.unitPrice)}
                        </Box>

                        <Box sx={{ width: 110, textAlign: 'right', typography: 'subtitle2' }}>
                          {fCurrency(item.lineTotal)}
                        </Box>
                      </Stack>
                    ))}
                  </Scrollbar>

                  {renderTotal}
                </Card>

                {(sale.nfceStatus === 'error' || sale.nfceLastError) && (
                  <Card sx={{ p: 3 }}>
                    <Typography variant="subtitle2" color="error" sx={{ mb: 1 }}>
                      {t('fiscal.issueError')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {sale.nfceLastError}
                    </Typography>
                  </Card>
                )}

                {/* NFC-e / Fiscal Traceability Card */}
                {sale.nfceStatus === 'authorized' && (() => {
                  const qrDisplay = resolveNfceQrCodeDisplay(sale, enterprise);
                  return (
                    <Card sx={{ p: 3 }}>
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1.5}
                        flexWrap="wrap"
                        sx={{ mb: 2 }}
                      >
                        <Iconify
                          icon="solar:verified-check-bold"
                          width={24}
                          sx={{ color: 'success.main' }}
                        />
                        <Typography variant="h6">
                          DANFE NFC-e — Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
                        </Typography>
                        {sale.nfceSimulated && (
                          <Label variant="soft" color="warning">
                            Simulação SEFAZ (Sem valor fiscal)
                          </Label>
                        )}
                      </Stack>

                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={3}
                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                        justifyContent="space-between"
                      >
                        <Stack spacing={1} sx={{ typography: 'body2', color: 'text.secondary', flex: 1 }}>
                          <div>
                            <strong>Número NFC-e:</strong> {sale.nfceNumber} (Série{' '}
                            {enterprise?.nfceSeries || '1'})
                          </div>
                          <div>
                            <strong>Chave de Acesso (44 dígitos):</strong>{' '}
                            <Box component="span" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                              {sale.nfceKey}
                            </Box>
                          </div>
                          <div>
                            <strong>Protocolo de Autorização:</strong> {sale.nfceProtocol} em{' '}
                            {fDateTime(sale.nfceIssuedAt)}
                          </div>
                          {qrDisplay && (
                            <div>
                              <strong>Consulta pública:</strong>{' '}
                              <Box component="span" sx={{ wordBreak: 'break-all' }}>
                                {qrDisplay.consultaUrl}
                              </Box>
                            </div>
                          )}
                          <Stack direction="row" spacing={1.5} flexWrap="wrap" sx={{ pt: 1 }}>
                            {qrDisplay && (
                              <Button
                                component="a"
                                href={qrDisplay.qrValue}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="soft"
                                color="info"
                                size="small"
                                startIcon={<Iconify icon="solar:qr-code-bold" />}
                              >
                                Consultar QR Code SEFAZ
                              </Button>
                            )}
                            {sale.nfceDanfeUrl && (
                              <Button
                                component="a"
                                href={sale.nfceDanfeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="outlined"
                                size="small"
                              >
                                Abrir DANFE
                              </Button>
                            )}
                            {lastSimulatedXml && (
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={<Iconify icon="solar:download-bold" />}
                                onClick={handleDownloadSimulatedXml}
                              >
                                Baixar XML NFC-e (4.00)
                              </Button>
                            )}
                          </Stack>
                        </Stack>

                        {qrDisplay && (
                          <Stack
                            alignItems="center"
                            spacing={0.75}
                            sx={{
                              p: 1.5,
                              borderRadius: 1.5,
                              bgcolor: 'common.white',
                              border: (theme) => `1px dashed ${theme.vars.palette.divider}`,
                              flexShrink: 0,
                            }}
                          >
                            <QRCodeSVG value={qrDisplay.qrValue} size={136} level="M" includeMargin />
                            <Typography variant="caption" color="text.secondary">
                              QR Code NFC-e
                            </Typography>
                          </Stack>
                        )}
                      </Stack>
                    </Card>
                  );
                })()}
              </Stack>
            </Grid>

            {/* Right column (md=4): OrderDetailsInfo style */}
            <Grid xs={12} md={4}>
              <Card>
                <CardHeader title={t('customers.customerInfo', { defaultValue: 'Cliente' })} />
                <Stack direction="row" sx={{ p: 3 }}>
                  <Avatar
                    alt={sale.customerName || 'Consumidor'}
                    sx={{ width: 48, height: 48, mr: 2 }}
                  >
                    {(sale.customerName || 'C').charAt(0).toUpperCase()}
                  </Avatar>

                  <Stack spacing={0.5} alignItems="flex-start" sx={{ typography: 'body2' }}>
                    <Typography variant="subtitle2">
                      {sale.customerName || 'Consumidor Final'}
                    </Typography>
                    {sale.customerDocument && (
                      <Box sx={{ color: 'text.secondary' }}>CPF/CNPJ: {sale.customerDocument}</Box>
                    )}
                    {sale.customerPhone && (
                      <Box sx={{ color: 'text.secondary' }}>Tel: {sale.customerPhone}</Box>
                    )}
                    {sale.customerEmail && (
                      <Box sx={{ color: 'text.secondary' }}>{sale.customerEmail}</Box>
                    )}
                    {sale.customerAddress && (
                      <Box sx={{ color: 'text.disabled', typography: 'caption' }}>
                        {sale.customerAddress}
                      </Box>
                    )}
                    {sale.lastEmailSentTo && (
                      <Label color="info" variant="soft" sx={{ mt: 1 }}>
                        Enviado p/ {sale.lastEmailSentTo}
                      </Label>
                    )}
                  </Stack>
                </Stack>

                <Divider sx={{ borderStyle: 'dashed' }} />

                <CardHeader title={t('customers.delivery', { defaultValue: 'Entrega' })} />
                <Stack spacing={1} sx={{ p: 3, typography: 'body2' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      Modalidade
                    </Box>
                    <Label
                      color={sale.deliveryType === 'delivery' ? 'info' : 'default'}
                      variant="soft"
                    >
                      {sale.deliveryType === 'delivery' ? 'Entrega / Delivery' : 'Retirado no local'}
                    </Label>
                  </Stack>
                  {sale.deliveryType === 'delivery' && sale.deliveryAddress && (
                    <Box sx={{ color: 'text.secondary', typography: 'caption' }}>
                      {sale.deliveryAddress}
                    </Box>
                  )}
                </Stack>

                <Divider sx={{ borderStyle: 'dashed' }} />

                <CardHeader
                  title={t('customers.payment_methods', { defaultValue: 'Formas de pagamento' })}
                />
                <Stack spacing={1.5} sx={{ p: 3, typography: 'body2' }}>
                  {sale.payments.map((p, idx) => (
                    <Stack key={idx} direction="row" justifyContent="space-between">
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        {t(`pos.paymentMethods.${p.method}`, {
                          defaultValue:
                            p.method === 'credit_tab' ? 'Crediário / Fiado' : p.method,
                        })}
                        {p.installments && p.installments > 1
                          ? ` (${p.installments}x de ${fCurrency(p.amount / p.installments)})`
                          : ''}
                      </Box>
                      <Typography variant="subtitle2">{fCurrency(p.amount)}</Typography>
                    </Stack>
                  ))}

                  {sale.changeAmount > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Box component="span" sx={{ color: 'success.main' }}>
                        {t('pos.fields.changeAmount')}
                      </Box>
                      <Typography variant="subtitle2" color="success.main">
                        {fCurrency(sale.changeAmount)}
                      </Typography>
                    </Stack>
                  )}

                  {sale.sellerEmail && (
                    <Stack direction="row" justifyContent="space-between" sx={{ pt: 1 }}>
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        {t('pos.fields.seller')}
                      </Box>
                      <Typography variant="caption">{sale.sellerEmail}</Typography>
                    </Stack>
                  )}
                </Stack>
              </Card>
            </Grid>
          </Grid>
        )}
      </DashboardContent>

      {/* Modal: Imprimir Cupom Fiscal / DANFE NFC-e (Térmica 58mm / 80mm / Recibo A5) */}
      {sale && (
        <ReceiptDialog
          open={cupomDialog.value}
          onClose={() => {
            cupomDialog.onFalse();
            setOpenInPdf(false);
          }}
          sale={sale}
          enterprise={enterprise}
          initialPdfView={openInPdf}
          autoPrint={autoPrint}
          onAutoPrintDone={() => setAutoPrint(false)}
          onOpenEmail={() => {
            setRecipientEmail(sale.customerEmail || '');
            emailDialog.onTrue();
          }}
        />
      )}

      {/* Modal: Enviar NFC-e / Cupom Fiscal por E-mail */}
      {sale && (
        <Dialog open={emailDialog.value} onClose={emailDialog.onFalse} fullWidth maxWidth="xs">
          <DialogTitle>Enviar NFC-e / Cupom por E-mail</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <TextField
                fullWidth
                label="E-mail do destinatário (Cliente)"
                placeholder="cliente@email.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
              <TextField
                fullWidth
                label="Mensagem adicional (opcional)"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                multiline
                rows={3}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" variant="outlined" onClick={emailDialog.onFalse}>
              Cancelar
            </Button>
            <LoadingButton
              variant="contained"
              color="primary"
              loading={sendingEmail}
              startIcon={<Iconify icon="iconamoon:send-fill" />}
              onClick={handleSendEmail}
            >
              Enviar Comprovante
            </LoadingButton>
          </DialogActions>
        </Dialog>
      )}

      {/* Dialog: Enviar Comprovante via WhatsApp (Plano Ultra / Evolution API) */}
      {sale && (
        <Dialog open={whatsappDialog.value} onClose={whatsappDialog.onFalse} maxWidth="xs" fullWidth>
          <DialogTitle>Enviar Comprovante via WhatsApp</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                label="WhatsApp do Cliente (com DDD)"
                placeholder="(91) 98888-7777"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(formatPhoneBr(e.target.value))}
                helperText="O envio será disparado pela instância WhatsApp conectada da sua loja."
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" variant="outlined" onClick={whatsappDialog.onFalse}>
              Cancelar
            </Button>
            <LoadingButton
              variant="contained"
              color="success"
              loading={sendingWhatsapp}
              startIcon={<Iconify icon="ic:baseline-whatsapp" />}
              onClick={async () => {
                if (!enterpriseId || !whatsappPhone.trim()) {
                  toast.error('Informe o número de WhatsApp do cliente.');
                  return;
                }
                setSendingWhatsapp(true);
                try {
                  await sendSaleReceiptWhatsappCf(enterpriseId, sale.id, whatsappPhone.trim());
                  toast.success('Comprovante enviado no WhatsApp com sucesso!');
                  whatsappDialog.onFalse();
                } catch (err) {
                  toast.error(
                    getFirebaseErrorMessage(err, 'Não foi possível enviar no WhatsApp.')
                  );
                } finally {
                  setSendingWhatsapp(false);
                }
              }}
            >
              Enviar agora
            </LoadingButton>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

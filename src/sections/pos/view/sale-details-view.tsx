import type { Sale } from 'src/api/firestore/sales';

import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Unstable_Grid2';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import ListItemText from '@mui/material/ListItemText';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency, fNumber } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
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

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type Props = {
  saleId: string;
};

export function SaleDetailsView({ saleId }: Props) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const popover = usePopover();
  const emailDialog = useBoolean();
  const cupomDialog = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [sale, setSale] = useState<Sale | null>(null);
  const [issuingNfce, setIssuingNfce] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState('');

  const loadSale = useCallback(async () => {
    if (!enterpriseId || !saleId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getSale(enterpriseId, saleId);
      setSale(data);
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

  const handleIssueNfce = async () => {
    if (!enterpriseId || !sale) return;
    setIssuingNfce(true);
    try {
      await issueSaleNfce(enterpriseId, sale);
      toast.success('NFC-e autorizada com sucesso na SEFAZ!');
      await loadSale();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao emitir NFC-e'));
    } finally {
      setIssuingNfce(false);
    }
  };

  const handlePrintCupom = () => {
    cupomDialog.onTrue();
  };

  const handleTriggerBrowserPrint = () => {
    window.print();
  };

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

      // Prepare mailto fallback + confirmation
      const subject = encodeURIComponent(
        `Cupom Fiscal / NFC-e - Pedido ${sale.code} (${fCurrency(sale.total)})`
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
        `Olá ${sale.customerName || 'Cliente'},\n\nSegue o resumo do seu Cupom Fiscal / NFC-e:\n\n` +
          `Venda: ${sale.code}\nData: ${fDateTime(sale.createdAt)}\n` +
          (sale.nfceKey ? `Chave de Acesso NFC-e: ${sale.nfceKey}\nProtocolo: ${sale.nfceProtocol}\n` : '') +
          `\nItens:\n${itemsLines}\n\n` +
          `Subtotal: ${fCurrency(sale.subtotal)}\n` +
          `Desconto: ${fCurrency(sale.discountAmount)}\n` +
          `Total Pago: ${fCurrency(sale.total)}\n\n` +
          (emailMessage ? `${emailMessage}\n\n` : '') +
          `Obrigado pela preferência!`
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
      <DashboardContent>
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
      <DashboardContent>
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
                    color={sale.nfceStatus === 'authorized' ? 'info' : 'warning'}
                  >
                    {sale.nfceStatus === 'authorized'
                      ? `NFC-e #${sale.nfceNumber}`
                      : 'Cupom Não-Fiscal / Pendente NFC-e'}
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

              {sale.nfceStatus !== 'authorized' && sale.status === 'completed' && (
                <LoadingButton
                  color="info"
                  variant="soft"
                  loading={issuingNfce}
                  startIcon={<Iconify icon="solar:document-add-bold" />}
                  onClick={handleIssueNfce}
                >
                  Emitir NFC-e
                </LoadingButton>
              )}

              <Button
                color="inherit"
                variant="outlined"
                startIcon={<Iconify icon="solar:printer-minimalistic-bold" />}
                onClick={handlePrintCupom}
              >
                Imprimir
              </Button>

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

              <Button
                component={RouterLink}
                href={paths.dashboard.pos.checkout}
                color="inherit"
                variant="contained"
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

                {/* NFC-e / Fiscal Traceability Card */}
                {sale.nfceStatus === 'authorized' && (
                  <Card sx={{ p: 3 }}>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                      <Iconify icon="solar:verified-check-bold" width={24} sx={{ color: 'success.main' }} />
                      <Typography variant="h6">
                        DANFE NFC-e — Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
                      </Typography>
                    </Stack>
                    <Stack spacing={1} sx={{ typography: 'body2', color: 'text.secondary' }}>
                      <div>
                        <strong>Número NFC-e:</strong> {sale.nfceNumber} (Série 1)
                      </div>
                      <div>
                        <strong>Chave de Acesso (44 dígitos):</strong>{' '}
                        <Box component="span" sx={{ fontFamily: 'monospace' }}>
                          {sale.nfceKey}
                        </Box>
                      </div>
                      <div>
                        <strong>Protocolo de Autorização:</strong> {sale.nfceProtocol} em{' '}
                        {fDateTime(sale.nfceIssuedAt)}
                      </div>
                    </Stack>
                  </Card>
                )}
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

                <CardHeader title="Pagamento" />
                <Stack spacing={1.5} sx={{ p: 3, typography: 'body2' }}>
                  {sale.payments.map((p, idx) => (
                    <Stack key={idx} direction="row" justifyContent="space-between">
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        {t(`pos.paymentMethods.${p.method}`, {
                          defaultValue:
                            p.method === 'credit_tab' ? 'Crediário / Fiado' : p.method,
                        })}
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

      {/* Modal: Imprimir Cupom Fiscal / DANFE NFC-e (Térmica 80mm / A4) */}
      {sale && (
        <Dialog open={cupomDialog.value} onClose={cupomDialog.onFalse} fullWidth maxWidth="xs">
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Cupom Fiscal / NFC-e</span>
            <Button
              variant="contained"
              size="small"
              startIcon={<Iconify icon="solar:printer-minimalistic-bold" />}
              onClick={handleTriggerBrowserPrint}
            >
              Imprimir Agora
            </Button>
          </DialogTitle>
          <DialogContent dividers>
            <Box
              sx={{
                p: 2,
                fontFamily: 'monospace',
                fontSize: 12,
                bgcolor: 'background.neutral',
                borderRadius: 1,
              }}
            >
              <Typography variant="subtitle2" align="center" sx={{ fontFamily: 'monospace' }}>
                ERP MINIMALS — COMPROVANTE / NFC-E
              </Typography>
              <Typography variant="caption" display="block" align="center" sx={{ mb: 1 }}>
                {sale.nfceStatus === 'authorized'
                  ? `DANFE NFC-e Nº ${sale.nfceNumber} • Série 1`
                  : 'CUPOM DE VENDA / EXTRATO'}
              </Typography>
              <Divider sx={{ borderStyle: 'dashed', my: 1 }} />
              <div>VENDA: {sale.code}</div>
              <div>DATA: {fDateTime(sale.createdAt)}</div>
              <div>CLIENTE: {sale.customerName || 'CONSUMIDOR FINAL'}</div>
              {sale.customerDocument && <div>CPF/CNPJ: {sale.customerDocument}</div>}
              <Divider sx={{ borderStyle: 'dashed', my: 1 }} />
              {sale.items.map((item, idx) => (
                <Box key={idx} sx={{ mb: 0.75 }}>
                  <div>
                    {idx + 1}. {item.productName} {item.lotCode ? `[${item.lotCode}]` : ''}
                  </div>
                  <Stack direction="row" justifyContent="space-between">
                    <span>
                      {item.qty} {item.unit} x {fCurrency(item.unitPrice)}
                    </span>
                    <strong>{fCurrency(item.lineTotal)}</strong>
                  </Stack>
                </Box>
              ))}
              <Divider sx={{ borderStyle: 'dashed', my: 1 }} />
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
              <Stack direction="row" justifyContent="space-between" sx={{ fontWeight: 700, my: 0.5 }}>
                <span>TOTAL A PAGAR:</span>
                <span>{fCurrency(sale.total)}</span>
              </Stack>
              <Divider sx={{ borderStyle: 'dashed', my: 1 }} />
              {sale.payments.map((p, idx) => (
                <Stack key={idx} direction="row" justifyContent="space-between">
                  <span>{t(`pos.paymentMethods.${p.method}`).toUpperCase()}:</span>
                  <span>{fCurrency(p.amount)}</span>
                </Stack>
              ))}
              {sale.changeAmount > 0 && (
                <Stack direction="row" justifyContent="space-between">
                  <span>TROCO:</span>
                  <span>{fCurrency(sale.changeAmount)}</span>
                </Stack>
              )}
              {sale.nfceKey && (
                <>
                  <Divider sx={{ borderStyle: 'dashed', my: 1 }} />
                  <div style={{ wordBreak: 'break-all' }}>CHAVE: {sale.nfceKey}</div>
                  <div>PROT.: {sale.nfceProtocol}</div>
                </>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" variant="outlined" onClick={cupomDialog.onFalse}>
              Fechar
            </Button>
          </DialogActions>
        </Dialog>
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
    </>
  );
}

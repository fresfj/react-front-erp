import type {
  WhatsappLogEntry,
  WhatsappEventKey,
  WhatsappEventsConfig,
  WhatsappWebhookConfig,
  EnterpriseWhatsappStatusResponse,
} from 'src/api/firestore/whatsapp';

import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControlLabel from '@mui/material/FormControlLabel';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useBoolean } from 'src/hooks/use-boolean';

import { formatPhoneBr } from 'src/utils/br-docs';
import { fDateTime } from 'src/utils/format-time';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import {
  EVOLUTION_WEBHOOK_EVENTS,
  sendTestWhatsappMessageCf,
  connectEnterpriseWhatsappCf,
  listEnterpriseWhatsappLogsCf,
  getEnterpriseWhatsappStatusCf,
  disconnectEnterpriseWhatsappCf,
  saveEnterpriseWhatsappWebhookCf,
  saveEnterpriseWhatsappSettingsCf,
  pollEvolutionConnectionStateDirect,
} from 'src/api/firestore/whatsapp';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const EVENT_LABELS: Record<string, string> = {
  orderReceived: 'Pedido recebido (cliente)',
  orderAccepted: 'Pedido aceito',
  orderPreparing: 'Em preparação',
  orderOutForDelivery: 'Saiu p/ entrega / Pronto p/ retirada',
  orderDelivered: 'Pedido finalizado',
  orderRejected: 'Pedido recusado',
  storeOwnerNewOrder: 'Alerta novo pedido (loja)',
  saleReceipt: 'Comprovante de venda (PDV)',
  test: 'Mensagem de teste',
};

const TEMPLATE_FIELDS: Array<{ key: WhatsappEventKey; label: string; varsHint: string }> = [
  {
    key: 'orderReceived',
    label: 'Template: Pedido Recebido',
    varsHint: 'Variáveis: {{cliente}}, {{codigo}}, {{loja}}, {{itens}}, {{total}}, {{modalidade}}, {{link}}',
  },
  {
    key: 'orderAccepted',
    label: 'Template: Pedido Aceito',
    varsHint: 'Variáveis: {{cliente}}, {{codigo}}, {{loja}}, {{tempo}}, {{link}}',
  },
  {
    key: 'orderPreparing',
    label: 'Template: Em Preparação',
    varsHint: 'Variáveis: {{cliente}}, {{codigo}}, {{loja}}',
  },
  {
    key: 'orderOutForDelivery',
    label: 'Template: Saiu p/ Entrega / Pronto p/ Retirada',
    varsHint: 'Variáveis: {{cliente}}, {{codigo}}, {{loja}}, {{statusEntrega}}',
  },
  {
    key: 'orderDelivered',
    label: 'Template: Pedido Finalizado',
    varsHint: 'Variáveis: {{cliente}}, {{codigo}}, {{loja}}, {{avaliacao}}',
  },
  {
    key: 'orderRejected',
    label: 'Template: Pedido Recusado',
    varsHint: 'Variáveis: {{cliente}}, {{codigo}}, {{loja}}, {{motivo}}',
  },
  {
    key: 'saleReceipt',
    label: 'Template: Comprovante de Venda (PDV)',
    varsHint: 'Variáveis: {{loja}}, {{codigo}}, {{cliente}}, {{itens}}, {{total}}, {{pagamento}}',
  },
];

// ----------------------------------------------------------------------

export function AccountWhatsappView() {
  const router = useRouter();
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const canEdit = Boolean(user?.platformAdmin) || user?.role === 'admin';

  const openConnection = useBoolean(true);
  const openWebhook = useBoolean(true);
  const openEvents = useBoolean(true);
  const openTemplates = useBoolean(false);
  const openLogs = useBoolean(true);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<EnterpriseWhatsappStatusResponse | null>(null);
  const [logs, setLogs] = useState<WhatsappLogEntry[]>([]);

  const [enabled, setEnabled] = useState(true);
  const [events, setEvents] = useState<WhatsappEventsConfig>({
    orderReceived: true,
    orderAccepted: true,
    orderPreparing: true,
    orderOutForDelivery: true,
    orderDelivered: true,
    orderRejected: true,
    notifyStoreOwner: true,
    sendReceiptOnSale: false,
  });
  const [ownerAlertPhone, setOwnerAlertPhone] = useState('');
  const [templates, setTemplates] = useState<Partial<Record<WhatsappEventKey, string>>>({});
  const [webhook, setWebhook] = useState<WhatsappWebhookConfig>({
    enabled: false,
    url: '',
    webhookByEvents: false,
    webhookBase64: false,
    events: [],
  });

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      if (!enterpriseId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const [st, logsRes] = await Promise.all([
          getEnterpriseWhatsappStatusCf(enterpriseId),
          listEnterpriseWhatsappLogsCf(enterpriseId).catch(() => ({ logs: [] })),
        ]);
        setStatus(st);
        setEnabled(st.enabled);
        setEvents(st.events);
        setOwnerAlertPhone(st.ownerAlertPhone ? formatPhoneBr(st.ownerAlertPhone) : '');
        setTemplates(st.templates || {});
        if (st.webhook) {
          setWebhook({
            enabled: Boolean(st.webhook.enabled),
            url: st.webhook.url || '',
            webhookByEvents: Boolean(st.webhook.webhookByEvents),
            webhookBase64: Boolean(st.webhook.webhookBase64),
            events: Array.isArray(st.webhook.events) ? st.webhook.events : [],
          });
        }
        setLogs(logsRes.logs || []);
        if (st.state === 'open' && qrDialogOpen) {
          setQrDialogOpen(false);
          setQrCodeBase64(null);
          toast.success('WhatsApp conectado com sucesso!');
        }
      } catch (error) {
        if (!silent) {
          toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar status do WhatsApp.'));
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [enterpriseId, qrDialogOpen]
  );

  useEffect(() => {
    loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterpriseId]);

  // Polling automático direto na Evolution API (Axios) enquanto o modal de QR Code estiver aberto
  useEffect(() => {
    if (!qrDialogOpen || !enterpriseId) return undefined;
    const timer = setInterval(async () => {
      const directState = await pollEvolutionConnectionStateDirect(enterpriseId);
      if (directState === 'open') {
        setQrDialogOpen(false);
        setQrCodeBase64(null);
        setStatus((prev) => (prev ? { ...prev, state: 'open' } : prev));
        toast.success('WhatsApp conectado com sucesso!');
      } else if (directState === null) {
        loadData(true);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [qrDialogOpen, enterpriseId, loadData]);

  const handleConnect = async () => {
    if (!enterpriseId) return;
    setConnecting(true);
    try {
      const res = await connectEnterpriseWhatsappCf(enterpriseId);
      if (res.state === 'open') {
        toast.success(`Instância ${res.instanceName} já está conectada!`);
        await loadData(true);
      } else {
        setQrCodeBase64(res.qrcodeBase64);
        setPairingCode(res.pairingCode);
        setQrDialogOpen(true);
        await loadData(true);
      }
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Não foi possível gerar o QR Code.'));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!enterpriseId) return;
    setDisconnecting(true);
    try {
      await disconnectEnterpriseWhatsappCf(enterpriseId);
      toast.success('WhatsApp desconectado.');
      await loadData(true);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao desconectar WhatsApp.'));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!enterpriseId) return;
    setSaving(true);
    try {
      await saveEnterpriseWhatsappSettingsCf(enterpriseId, {
        enabled,
        events,
        ownerAlertPhone: ownerAlertPhone.trim(),
        templates,
      });
      toast.success('Configurações de WhatsApp salvas com sucesso!');
      await loadData(true);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao salvar configurações.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!enterpriseId || !testPhone.trim()) {
      toast.error('Informe um número de WhatsApp com DDD para teste.');
      return;
    }
    setSendingTest(true);
    try {
      await sendTestWhatsappMessageCf(enterpriseId, testPhone);
      toast.success('Mensagem de teste enviada!');
      await loadData(true);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Falha ao enviar mensagem de teste.'));
    } finally {
      setSendingTest(false);
    }
  };

  const handleSaveWebhook = async () => {
    if (!enterpriseId) return;
    if (webhook.enabled && !/^https?:\/\/.+/i.test(webhook.url.trim())) {
      toast.error('Informe uma URL válida (http:// ou https://) para ativar o webhook.');
      return;
    }
    setSavingWebhook(true);
    try {
      const res = await saveEnterpriseWhatsappWebhookCf(enterpriseId, {
        ...webhook,
        url: webhook.url.trim(),
      });
      if (res.syncWarning) {
        toast.info(res.syncWarning);
      } else {
        toast.success('Configuração de Webhook salva e sincronizada na Evolution API!');
      }
      await loadData(true);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao salvar configuração de webhook.'));
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleToggleWebhookEvent = (eventName: string) => {
    setWebhook((prev) => {
      const exists = prev.events.includes(eventName);
      return {
        ...prev,
        events: exists
          ? prev.events.filter((item) => item !== eventName)
          : [...prev.events, eventName],
      };
    });
  };

  const handleSelectAllWebhookEvents = () => {
    setWebhook((prev) => ({
      ...prev,
      events: [...EVOLUTION_WEBHOOK_EVENTS],
    }));
  };

  const handleDeselectAllWebhookEvents = () => {
    setWebhook((prev) => ({
      ...prev,
      events: [],
    }));
  };

  if (loading) {
    return (
      <Stack spacing={3} sx={{ mx: 'auto', width: 1, maxWidth: { xs: 720, xl: 880 } }}>
        <Card sx={{ p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Skeleton animation="wave" width="38%" height={28} sx={{ mb: 0.75 }} />
              <Skeleton animation="wave" width="62%" height={18} />
            </Box>
            <Skeleton animation="wave" variant="circular" width={32} height={32} />
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Skeleton animation="wave" variant="rounded" height={92} sx={{ mb: 2 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Skeleton animation="wave" variant="rounded" height={56} sx={{ flex: 1 }} />
            <Skeleton animation="wave" variant="rounded" height={56} width={190} />
          </Stack>
        </Card>
        <Card sx={{ p: 3 }}>
          <Skeleton animation="wave" width="32%" height={28} sx={{ mb: 0.75 }} />
          <Skeleton animation="wave" width="58%" height={18} sx={{ mb: 2 }} />
          <Divider sx={{ my: 2 }} />
          <Skeleton animation="wave" variant="rounded" height={56} sx={{ mb: 2 }} />
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: '1fr 1fr' }} gap={1.5}>
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} animation="wave" variant="rounded" height={40} />
            ))}
          </Box>
        </Card>
        <Card sx={{ p: 3 }}>
          <Skeleton animation="wave" width="42%" height={28} sx={{ mb: 0.75 }} />
          <Skeleton animation="wave" width="60%" height={18} sx={{ mb: 2 }} />
          <Divider sx={{ my: 2 }} />
          <Skeleton animation="wave" variant="rounded" height={160} />
        </Card>
      </Stack>
    );
  }

  if (status && !status.eligible) {
    return (
      <Card
        sx={{
          p: { xs: 3, sm: 5 },
          mx: 'auto',
          width: 1,
          maxWidth: { xs: 720, xl: 880 },
        }}
      >
        <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center' }}>
          <Iconify icon="ic:baseline-whatsapp" width={64} sx={{ color: '#25D366' }} />
          <Label color="warning" variant="soft">
            Exclusivo Plano Ultra
          </Label>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Notificações Automáticas no WhatsApp
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, pb: 1.5 }}>
            Conecte o WhatsApp oficial da sua loja e envie automaticamente confirmações de pedido,
            atualizações de preparo, aviso de saída para entrega, finalização e comprovantes de venda
            direto para seus clientes.
          </Typography>
          <Button
            size="large"
            variant="contained"
            color="primary"
            onClick={() => router.push(paths.dashboard.account.billing)}
            startIcon={<Iconify icon="solar:crown-bold" />}
          >
            Fazer upgrade para o Plano Ultra
          </Button>
        </Stack>
      </Card>
    );
  }

  const isConnected = status?.state === 'open';
  const isConnecting = status?.state === 'connecting';

  return (
    <Stack spacing={3} sx={{ mx: 'auto', width: 1, maxWidth: { xs: 720, xl: 880 } }}>
      {!canEdit && (
        <Alert severity="info">
          Visualização somente leitura. Apenas o administrador da empresa ou da plataforma possui
          permissão para alterar ou salvar configurações do WhatsApp.
        </Alert>
      )}

      {/* Card 1: Conexão da Instância WhatsApp */}
      <Card>
        <CardHeader
          title="Conexão WhatsApp (Plano Ultra)"
          subheader="Instância dedicada com envio automático e grupos ignorados por padrão"
          action={
            <IconButton onClick={openConnection.onToggle}>
              <Iconify
                icon={
                  openConnection.value
                    ? 'eva:arrow-ios-upward-fill'
                    : 'eva:arrow-ios-downward-fill'
                }
              />
            </IconButton>
          }
          sx={{ mb: 3 }}
        />
        <Collapse in={openConnection.value}>
          <Divider />
          <Stack spacing={3} sx={{ p: 3 }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              alignItems={{ md: 'center' }}
              justifyContent="space-between"
              sx={{
                p: 2,
                borderRadius: 1.5,
                bgcolor: 'background.neutral',
              }}
            >
              <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, wordBreak: 'break-word' }}
                  >
                    {status?.instanceName || 'ULTRA_LOJA'}
                  </Typography>
                  <Label
                    variant="soft"
                    color={isConnected ? 'success' : isConnecting ? 'warning' : 'error'}
                  >
                    {isConnected
                      ? 'Conectado'
                      : isConnecting
                        ? 'Aguardando QR Code'
                        : 'Desconectado'}
                  </Label>
                  <Label variant="soft" color="default">
                    Ignora grupos
                  </Label>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {isConnected
                    ? 'Sua instância está ativa e pronta para disparar mensagens automáticas.'
                    : 'Clique em Conectar WhatsApp e escaneie o QR Code com o celular da loja.'}
                </Typography>
              </Stack>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
                {!isConnected && canEdit && (
                  <LoadingButton
                    variant="contained"
                    color="success"
                    loading={connecting}
                    onClick={handleConnect}
                    startIcon={<Iconify icon="solar:qr-code-bold" />}
                  >
                    Conectar WhatsApp
                  </LoadingButton>
                )}

                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={() => loadData(false)}
                  startIcon={<Iconify icon="solar:refresh-bold" />}
                >
                  Atualizar
                </Button>

                {isConnected && canEdit && (
                  <LoadingButton
                    variant="outlined"
                    color="error"
                    loading={disconnecting}
                    onClick={handleDisconnect}
                  >
                    Desconectar
                  </LoadingButton>
                )}
              </Stack>
            </Stack>

            {/* Envio de Mensagem de Teste */}
            {canEdit && (
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                alignItems={{ sm: 'stretch' }}
              >
                <TextField
                  fullWidth
                  label="Testar envio (WhatsApp com DDD)"
                  placeholder="(91) 98888-7777"
                  value={testPhone}
                  onChange={(e) => setTestPhone(formatPhoneBr(e.target.value))}
                />
                <LoadingButton
                  variant="soft"
                  color="primary"
                  loading={sendingTest}
                  disabled={!isConnected || !testPhone.trim()}
                  onClick={handleSendTest}
                  startIcon={<Iconify icon="solar:plain-bold" />}
                  sx={{ minWidth: 190 }}
                >
                  Enviar teste
                </LoadingButton>
              </Stack>
            )}
          </Stack>
        </Collapse>
      </Card>

      {/* Card 2: Webhook Evolution API */}
      <Card>
        <CardHeader
          title="Webhook"
          subheader="Integre sua instância Evolution API com n8n, Typebot, CRM ou automações externas"
          action={
            <Stack direction="row" spacing={1} alignItems="center">
              <Label variant="soft" color={webhook.enabled ? 'success' : 'default'}>
                {webhook.enabled ? 'Ativo' : 'Inativo'}
              </Label>
              <IconButton onClick={openWebhook.onToggle}>
                <Iconify
                  icon={
                    openWebhook.value
                      ? 'eva:arrow-ios-upward-fill'
                      : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            </Stack>
          }
          sx={{ mb: 3 }}
        />
        <Collapse in={openWebhook.value}>
          <Divider />
          <Stack spacing={2.5} sx={{ p: 3 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={2}
              sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}
            >
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Ativo
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Ativar ou desativar o webhook
                </Typography>
              </Box>
              <Switch
                checked={webhook.enabled}
                onChange={(e) => setWebhook((prev) => ({ ...prev, enabled: e.target.checked }))}
                disabled={!canEdit}
              />
            </Stack>

            <TextField
              fullWidth
              label="URL"
              placeholder="https://webhook.ds3i.com.br/webhook/..."
              value={webhook.url}
              onChange={(e) => setWebhook((prev) => ({ ...prev, url: e.target.value }))}
              disabled={!canEdit}
            />

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={2}
              sx={{
                p: 2,
                borderRadius: 1.5,
                border: (theme) => `1px solid ${theme.vars.palette.divider}`,
              }}
            >
              <Box>
                <Typography variant="subtitle2">Webhook por Eventos</Typography>
                <Typography variant="caption" color="text.secondary">
                  Criar uma rota para cada evento adicionando o nome do evento ao final da URL
                </Typography>
              </Box>
              <Switch
                checked={webhook.webhookByEvents}
                onChange={(e) =>
                  setWebhook((prev) => ({ ...prev, webhookByEvents: e.target.checked }))
                }
                disabled={!canEdit}
              />
            </Stack>

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={2}
              sx={{
                p: 2,
                borderRadius: 1.5,
                border: (theme) => `1px solid ${theme.vars.palette.divider}`,
              }}
            >
              <Box>
                <Typography variant="subtitle2">Webhook Base64</Typography>
                <Typography variant="caption" color="text.secondary">
                  Enviar dados de mídia em base64 no webhook
                </Typography>
              </Box>
              <Switch
                checked={webhook.webhookBase64}
                onChange={(e) =>
                  setWebhook((prev) => ({ ...prev, webhookBase64: e.target.checked }))
                }
                disabled={!canEdit}
              />
            </Stack>

            <Divider sx={{ borderStyle: 'dashed' }} />

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ sm: 'center' }}
              justifyContent="space-between"
              spacing={1.5}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Eventos
                </Typography>
                <Label variant="soft" color="info">
                  {webhook.events.length}/{EVOLUTION_WEBHOOK_EVENTS.length}
                </Label>
              </Stack>

              {canEdit && (
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    onClick={handleSelectAllWebhookEvents}
                  >
                    Marcar Todos
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    onClick={handleDeselectAllWebhookEvents}
                  >
                    Desmarcar Todos
                  </Button>
                </Stack>
              )}
            </Stack>

            <Box
              display="grid"
              gridTemplateColumns={{ xs: '1fr', sm: '1fr 1fr' }}
              gap={1}
            >
              {EVOLUTION_WEBHOOK_EVENTS.map((eventName) => {
                const checked = webhook.events.includes(eventName);
                return (
                  <Stack
                    key={eventName}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1}
                    sx={{
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 1,
                      border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                      bgcolor: checked ? 'action.selected' : 'transparent',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: 'monospace',
                        fontWeight: checked ? 700 : 500,
                        wordBreak: 'break-all',
                      }}
                    >
                      {eventName}
                    </Typography>
                    <Switch
                      size="small"
                      checked={checked}
                      onChange={() => handleToggleWebhookEvent(eventName)}
                      disabled={!canEdit}
                    />
                  </Stack>
                );
              })}
            </Box>

            {canEdit && (
              <Stack direction="row" justifyContent="flex-end" sx={{ pt: 1 }}>
                <LoadingButton
                  variant="contained"
                  color="primary"
                  loading={savingWebhook}
                  onClick={handleSaveWebhook}
                  startIcon={<Iconify icon="solar:diskette-bold" />}
                >
                  Salvar Webhook
                </LoadingButton>
              </Stack>
            )}
          </Stack>
        </Collapse>
      </Card>

      {/* Card 2: Eventos Automáticos */}
      <Card>
        <CardHeader
          title="Notificações Automáticas"
          subheader="Escolha quais etapas do pedido online e PDV disparam mensagem no WhatsApp"
          action={
            <IconButton onClick={openEvents.onToggle}>
              <Iconify
                icon={
                  openEvents.value
                    ? 'eva:arrow-ios-upward-fill'
                    : 'eva:arrow-ios-downward-fill'
                }
              />
            </IconButton>
          }
          sx={{ mb: 3 }}
        />
        <Collapse in={openEvents.value}>
          <Divider />
          <Stack spacing={2.5} sx={{ p: 3 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  disabled={!canEdit}
                />
              }
              label={
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Ativar envios automáticos via WhatsApp
                </Typography>
              }
            />

            <Divider sx={{ borderStyle: 'dashed' }} />

            <Box
              display="grid"
              gridTemplateColumns={{ xs: '1fr', sm: '1fr 1fr' }}
              gap={1}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={events.orderReceived}
                    onChange={(e) => setEvents({ ...events, orderReceived: e.target.checked })}
                    disabled={!canEdit || !enabled}
                  />
                }
                label="Pedido recebido (cliente)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={events.orderAccepted}
                    onChange={(e) => setEvents({ ...events, orderAccepted: e.target.checked })}
                    disabled={!canEdit || !enabled}
                  />
                }
                label="Pedido aceito (cliente)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={events.orderPreparing}
                    onChange={(e) => setEvents({ ...events, orderPreparing: e.target.checked })}
                    disabled={!canEdit || !enabled}
                  />
                }
                label="Em preparação (cliente)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={events.orderOutForDelivery}
                    onChange={(e) =>
                      setEvents({ ...events, orderOutForDelivery: e.target.checked })
                    }
                    disabled={!canEdit || !enabled}
                  />
                }
                label="Saiu p/ entrega / Pronto p/ retirada"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={events.orderDelivered}
                    onChange={(e) => setEvents({ ...events, orderDelivered: e.target.checked })}
                    disabled={!canEdit || !enabled}
                  />
                }
                label="Pedido finalizado + avaliação"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={events.orderRejected}
                    onChange={(e) => setEvents({ ...events, orderRejected: e.target.checked })}
                    disabled={!canEdit || !enabled}
                  />
                }
                label="Pedido recusado (cliente)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={events.notifyStoreOwner}
                    onChange={(e) => setEvents({ ...events, notifyStoreOwner: e.target.checked })}
                    disabled={!canEdit || !enabled}
                  />
                }
                label="Alertar WhatsApp da loja em novos pedidos"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={events.sendReceiptOnSale}
                    onChange={(e) => setEvents({ ...events, sendReceiptOnSale: e.target.checked })}
                    disabled={!canEdit || !enabled}
                  />
                }
                label="Habilitar comprovante no PDV"
              />
            </Box>

            <TextField
              fullWidth
              label="WhatsApp interno da loja para alertas (opcional)"
              placeholder="(91) 98888-7777"
              value={ownerAlertPhone}
              onChange={(e) => setOwnerAlertPhone(formatPhoneBr(e.target.value))}
              helperText="Se ficar em branco, usa o WhatsApp principal configurado em Loja online."
              disabled={!canEdit || !enabled}
            />
          </Stack>
        </Collapse>
      </Card>

      {/* Card 3: Templates de Mensagens (Opcional / Recolhido por padrão) */}
      <Card>
        <CardHeader
          title="Personalizar Mensagens (Templates)"
          subheader="Edite os textos enviados aos clientes utilizando variáveis dinâmicas"
          action={
            <IconButton onClick={openTemplates.onToggle}>
              <Iconify
                icon={
                  openTemplates.value
                    ? 'eva:arrow-ios-upward-fill'
                    : 'eva:arrow-ios-downward-fill'
                }
              />
            </IconButton>
          }
          sx={{ mb: 3 }}
        />
        <Collapse in={openTemplates.value}>
          <Divider />
          <Stack spacing={2.5} sx={{ p: 3 }}>
            {TEMPLATE_FIELDS.map((field) => (
              <TextField
                key={field.key}
                fullWidth
                multiline
                minRows={3}
                label={field.label}
                value={templates[field.key] || ''}
                onChange={(e) =>
                  setTemplates((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                helperText={field.varsHint}
                disabled={!canEdit}
              />
            ))}
          </Stack>
        </Collapse>
      </Card>

      {canEdit && (
        <Stack direction="row" justifyContent="flex-end">
          <LoadingButton
            variant="contained"
            size="large"
            loading={saving}
            onClick={handleSaveSettings}
          >
            Salvar configurações do WhatsApp
          </LoadingButton>
        </Stack>
      )}

      {/* Card 4: Histórico de Envios */}
      <Card>
        <CardHeader
          title="Histórico de Envios"
          subheader="Últimos 30 disparos automáticos e manuais desta empresa"
          action={
            <IconButton onClick={openLogs.onToggle}>
              <Iconify
                icon={
                  openLogs.value
                    ? 'eva:arrow-ios-upward-fill'
                    : 'eva:arrow-ios-downward-fill'
                }
              />
            </IconButton>
          }
          sx={{ mb: 3 }}
        />
        <Collapse in={openLogs.value}>
          <Divider />
          <Stack spacing={1.5} sx={{ p: 3 }}>
            {logs.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                Nenhum envio registrado ainda.
              </Typography>
            ) : (
              logs.map((log) => (
                <Stack
                  key={log.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ sm: 'center' }}
                  spacing={1}
                  sx={{
                    p: 1.5,
                    borderRadius: 1.25,
                    bgcolor: 'background.neutral',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="subtitle2">
                        {EVENT_LABELS[log.event] || log.event}
                      </Typography>
                      <Label
                        variant="soft"
                        color={log.status === 'sent' ? 'success' : 'error'}
                      >
                        {log.status === 'sent' ? 'Enviado' : 'Falha'}
                      </Label>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" component="div">
                      Para: {log.recipientPhone} • {log.createdAt ? fDateTime(log.createdAt) : ''}
                    </Typography>
                    {log.errorMessage && (
                      <Typography variant="caption" color="error.main" component="div">
                        {log.errorMessage}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              ))
            )}
          </Stack>
        </Collapse>
      </Card>

      {/* Modal de QR Code Evolution API */}
      <Dialog
        open={qrDialogOpen}
        onClose={() => setQrDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ wordBreak: 'break-word' }}>
          Conectar WhatsApp ({status?.instanceName})
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Abra o WhatsApp no celular da loja → <strong>Dispositivos conectados</strong> →{' '}
            <strong>Conectar dispositivo</strong> e escaneie o QR Code abaixo.
          </Typography>

          {qrCodeBase64 ? (
            <Box
              component="img"
              src={qrCodeBase64}
              alt="QR Code WhatsApp"
              sx={{
                width: 260,
                height: 260,
                mx: 'auto',
                display: 'block',
                borderRadius: 2,
                border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                p: 1,
                bgcolor: '#fff',
              }}
            />
          ) : (
            <Alert severity="info" sx={{ my: 2 }}>
              Aguardando geração do QR Code. Clique em &quot;Atualizar QR&quot; se necessário.
            </Alert>
          )}

          {pairingCode && (
            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              Código de pareamento: <strong>{pairingCode}</strong>
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConnect} disabled={connecting}>
            Atualizar QR
          </Button>
          <Button variant="contained" onClick={() => setQrDialogOpen(false)}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

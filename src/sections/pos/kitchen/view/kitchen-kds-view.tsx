import type { ColorType } from 'src/theme/core/palette';
import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { useRef, useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { paths } from 'src/routes/paths';

import { fTime } from 'src/utils/format-time';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  subscribeOnlineOrders,
  updateOnlineOrderStatusCf,
} from 'src/api/firestore/online-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { CustomTabs } from 'src/components/custom-tabs';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import {
  formatKitchenTimer,
  getKitchenSlaLevel,
  computeElapsedSeconds,
  buildProductionSummary,
  filterAndSortKitchenOrders,
  computeKitchenDemandSummary,
} from '../kitchen-kds-domain';

import type { KitchenSlaLevel, KitchenDemandLevel } from '../kitchen-kds-domain';

// ----------------------------------------------------------------------

type ChannelFilter = 'all' | 'table' | 'delivery' | 'pickup';

const SLA_COLOR: Record<KitchenSlaLevel, 'success' | 'warning' | 'error'> = {
  on_time: 'success',
  warning: 'warning',
  delayed: 'error',
};

const SLA_LABEL: Record<KitchenSlaLevel, string> = {
  on_time: 'No prazo',
  warning: 'Atenção',
  delayed: 'Atrasado',
};

const DEMAND_CONFIG: Record<
  KitchenDemandLevel,
  { label: string; color: 'success' | 'warning' | 'error'; icon: string }
> = {
  calm: { label: 'Demanda normal', color: 'success', icon: 'solar:check-circle-bold' },
  moderate: { label: 'Demanda moderada', color: 'warning', icon: 'solar:clock-circle-bold' },
  high: { label: 'Alta demanda', color: 'error', icon: 'solar:flame-bold' },
};

function playKitchenBell() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // ignore audio autoplay restrictions
  }
}

// ----------------------------------------------------------------------

export function KitchenKdsView() {
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [targetMinutes, setTargetMinutes] = useState<number>(20);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const knownIdsRef = useRef<Set<string> | null>(null);

  // Cronômetro ao vivo (1 segundo)
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Assinatura em tempo real dos pedidos
  useEffect(() => {
    if (!enterpriseId) return undefined;
    return subscribeOnlineOrders(enterpriseId, (list) => {
      const activeQueue = filterAndSortKitchenOrders(list);
      if (knownIdsRef.current !== null) {
        const hasNew = activeQueue.some((o) => !knownIdsRef.current?.has(o.id));
        if (hasNew && soundEnabled) {
          playKitchenBell();
          toast.info('Novo pedido chegou na cozinha!');
        }
      }
      knownIdsRef.current = new Set(activeQueue.map((o) => o.id));
      setOrders(list);
    });
  }, [enterpriseId, soundEnabled]);

  const allKitchenOrders = useMemo(() => filterAndSortKitchenOrders(orders), [orders]);

  const visibleOrders = useMemo(() => {
    if (channelFilter === 'all') return allKitchenOrders;
    return allKitchenOrders.filter((o) => o.deliveryType === channelFilter);
  }, [allKitchenOrders, channelFilter]);

  const demand = useMemo(
    () => computeKitchenDemandSummary(allKitchenOrders, nowMs, targetMinutes),
    [allKitchenOrders, nowMs, targetMinutes]
  );

  const productionSummary = useMemo(
    () => buildProductionSummary(visibleOrders),
    [visibleOrders]
  );

  const handleToggleItemCheck = (orderId: string, idx: number) => {
    const key = `${orderId}:${idx}`;
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAdvanceOrder = useCallback(
    async (order: OnlineOrder) => {
      if (!enterpriseId) return;
      const nextStatus =
        order.fulfillmentStatus === 'accepted'
          ? 'preparing'
          : order.deliveryType === 'delivery'
            ? 'out_for_delivery'
            : 'delivered';

      setUpdatingId(order.id);
      try {
        await updateOnlineOrderStatusCf(enterpriseId, order.id, nextStatus);
        toast.success(
          nextStatus === 'preparing'
            ? `Pedido ${order.code} em preparo!`
            : `Pedido ${order.code} marcado como pronto!`
        );
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Não foi possível atualizar o status.'));
      } finally {
        setUpdatingId(null);
      }
    },
    [enterpriseId]
  );

  const demandCfg = DEMAND_CONFIG[demand.demandLevel];

  const kdsMetricCards: Array<{
    label: string;
    value: string;
    sub: string;
    color: ColorType;
    icon: string;
  }> = [
    {
      label: 'Na fila',
      value: String(demand.queueCount),
      sub:
        demand.delayedCount > 0
          ? `${demand.delayedCount} pedido(s) atrasado(s)`
          : 'Aguardando início do preparo',
      color: demand.delayedCount > 0 ? 'error' : 'warning',
      icon: 'solar:hourglass-line-bold-duotone',
    },
    {
      label: 'Em preparo',
      value: String(demand.preparingCount),
      sub: 'Pedidos ativos na cozinha',
      color: 'info',
      icon: 'solar:chef-hat-heart-bold-duotone',
    },
    {
      label: 'Itens a preparar',
      value: String(demand.totalItems),
      sub:
        productionSummary.length > 0
          ? `${productionSummary.length} item(ns) distinto(s)`
          : 'Nenhum item pendente',
      color: 'primary',
      icon: 'material-symbols-light:restaurant-rounded',
    },
    {
      label: 'Tempo médio espera',
      value: `${demand.avgWaitMinutes} min`,
      sub: `Meta SLA: ${targetMinutes} min`,
      color: demand.avgWaitMinutes >= targetMinutes * 0.8 ? 'error' : 'success',
      icon: 'solar:stopwatch-bold-duotone',
    },
  ];

  return (
    <DashboardContent maxWidth={false}>
      <CustomBreadcrumbs
        heading="Cozinha (KDS)"
        links={[
          { name: 'Dashboard', href: paths.dashboard.root },
          { name: 'PDV', href: paths.dashboard.pos.root },
          { name: 'Cozinha (KDS)' },
        ]}
        action={
          <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
            <Label
              variant="filled"
              color={demandCfg.color}
              startIcon={<Iconify icon={demandCfg.icon} width={16} />}
              sx={{ px: 1.5, py: 2, fontSize: 13 }}
            >
              {demandCfg.label}
            </Label>

            <TextField
              select
              size="small"
              label="Meta SLA"
              value={targetMinutes}
              onChange={(e) => setTargetMinutes(Number(e.target.value))}
              sx={{ width: 120 }}
            >
              {[10, 15, 20, 30, 45].map((min) => (
                <MenuItem key={min} value={min}>
                  {min} min
                </MenuItem>
              ))}
            </TextField>

            <Button
              size="small"
              variant={soundEnabled ? 'soft' : 'outlined'}
              color={soundEnabled ? 'primary' : 'inherit'}
              startIcon={
                <Iconify
                  icon={soundEnabled ? 'solar:volume-loud-bold' : 'solar:volume-cross-bold'}
                />
              }
              onClick={() => setSoundEnabled((prev) => !prev)}
            >
              {soundEnabled ? 'Som ativo' : 'Som mudo'}
            </Button>
          </Stack>
        }
        sx={{ mb: 2.5 }}
      />

        {!enterpriseId ? (
          <EmptyContent filled title="Nenhuma empresa vinculada" />
        ) : (
          <Stack spacing={2.5}>
            {/* 4 KPIs de Demanda da Cozinha — padrão CourseWidgetSummary (Minimals v6) */}
            <Box
              display="grid"
              gridTemplateColumns={{
                xs: 'repeat(1, 1fr)',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(4, 1fr)',
              }}
              sx={{ gap: 2.5 }}
            >
              {kdsMetricCards.map((item) => (
                <Card
                  key={item.label}
                  sx={{
                    py: 3,
                    pl: 3,
                    pr: 2.5,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <Box sx={{ flexGrow: 1, pr: 4 }}>
                    <Box sx={{ typography: 'h3', mb: 0.5 }}>{item.value}</Box>
                    <Typography
                      noWrap
                      variant="subtitle2"
                      component="div"
                      sx={{ color: 'text.secondary' }}
                    >
                      {item.label}
                    </Typography>
                    <Typography
                      noWrap
                      variant="caption"
                      component="div"
                      sx={{
                        mt: 0.5,
                        color: item.color === 'error' ? 'error.main' : 'text.disabled',
                      }}
                    >
                      {item.sub}
                    </Typography>
                  </Box>

                  <Iconify
                    icon={item.icon}
                    width={36}
                    sx={{
                      top: 24,
                      right: 20,
                      position: 'absolute',
                      color: `${item.color}.main`,
                    }}
                  />

                  <Box
                    sx={{
                      top: -44,
                      width: 160,
                      zIndex: 0,
                      height: 160,
                      right: -104,
                      opacity: 0.14,
                      borderRadius: 3,
                      position: 'absolute',
                      pointerEvents: 'none',
                      transform: 'rotate(40deg)',
                      background: (th) =>
                        `linear-gradient(to right, ${th.vars.palette[item.color].main} 0%, ${varAlpha(th.vars.palette[item.color].mainChannel, 0)} 100%)`,
                    }}
                  />
                </Card>
              ))}
            </Box>

            {/* Barra de filtro por canal */}
            <Card sx={{ p: 1.5 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
              >
                <CustomTabs
                  value={channelFilter}
                  onChange={(_, val: ChannelFilter) => {
                    if (val) setChannelFilter(val);
                  }}
                  sx={{
                    borderRadius: 1.25,
                    bgcolor: 'background.neutral',
                    minHeight: 42,
                  }}
                  slotProps={{
                    indicator: {
                      borderRadius: 1,
                      boxShadow: (th) => th.customShadows.z4,
                    },
                    tab: {
                      minHeight: 36,
                      py: 0.5,
                      px: 1.5,
                      typography: 'subtitle2',
                    },
                  }}
                >
                  <Tab value="all" label={`Todos (${allKitchenOrders.length})`} />
                  <Tab
                    value="table"
                    label={`Mesas (${allKitchenOrders.filter((o) => o.deliveryType === 'table').length})`}
                    icon={<Iconify icon="ic:round-table-restaurant" width={18} />}
                    iconPosition="start"
                  />
                  <Tab
                    value="delivery"
                    label={`Delivery (${allKitchenOrders.filter((o) => o.deliveryType === 'delivery').length})`}
                    icon={<Iconify icon="solar:scooter-bold" width={16} />}
                    iconPosition="start"
                  />
                  <Tab
                    value="pickup"
                    label={`Retirada (${allKitchenOrders.filter((o) => o.deliveryType === 'pickup').length})`}
                    icon={<Iconify icon="solar:shop-bold" width={16} />}
                    iconPosition="start"
                  />
                </CustomTabs>

                {demand.delayedCount > 0 && (
                  <Label
                    variant="soft"
                    color="error"
                    startIcon={<Iconify icon="solar:danger-triangle-bold" width={16} />}
                    sx={{ px: 1.5, py: 2 }}
                  >
                    {demand.delayedCount} pedido(s) acima do SLA ({targetMinutes} min)
                  </Label>
                )}
              </Stack>
            </Card>

            {/* Resumo de Produção em Lote */}
            {productionSummary.length > 0 && (
              <Card
                sx={{
                  px: 2,
                  py: 1.5,
                  bgcolor: (theme) => varAlpha(theme.vars.palette.primary.mainChannel, 0.06),
                  border: (theme) =>
                    `1px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.2)}`,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography
                    variant="subtitle2"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mr: 1 }}
                  >
                    <Iconify icon="solar:chef-hat-bold-duotone" width={20} color="primary.main" />
                    Resumo de produção:
                  </Typography>
                  {productionSummary.map((item) => (
                    <Chip
                      key={item.key}
                      size="small"
                      color="primary"
                      variant="filled"
                      label={`${item.totalQty}x ${item.productName}`}
                      sx={{ fontWeight: 700 }}
                    />
                  ))}
                </Stack>
              </Card>
            )}

            {/* Fila de Comandas em Ordem de Chegada (FIFO) */}
            {visibleOrders.length === 0 ? (
              <Card sx={{ py: 8 }}>
                <EmptyContent
                  title="Cozinha em dia!"
                  description="Nenhum pedido aguardando preparo no momento. Assim que novos pedidos forem aceitos ou enviados pelas mesas, aparecerão aqui automaticamente por ordem de chegada."
                />
              </Card>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gap: 2.5,
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, 1fr)',
                    lg: 'repeat(3, 1fr)',
                    xl: 'repeat(4, 1fr)',
                  },
                  alignItems: 'stretch',
                }}
              >
                {visibleOrders.map((order, index) => {
                  const elapsedSec = computeElapsedSeconds(order, nowMs);
                  const sla = getKitchenSlaLevel(elapsedSec / 60, targetMinutes);
                  const slaColor = SLA_COLOR[sla];
                  const isPreparing = order.fulfillmentStatus === 'preparing';

                  const channelMeta =
                    order.deliveryType === 'table'
                      ? {
                          label: order.tableNumber ? `Mesa ${order.tableNumber}` : 'Mesa',
                          color: 'warning' as const,
                          icon: 'solar:plate-bold-duotone',
                        }
                      : order.deliveryType === 'delivery'
                        ? {
                            label: 'Delivery',
                            color: 'info' as const,
                            icon: 'solar:scooter-bold-duotone',
                          }
                        : {
                            label: 'Retirada',
                            color: 'secondary' as const,
                            icon: 'solar:bag-check-bold-duotone',
                          };

                  return (
                    <Card
                      key={order.id}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        borderWidth: sla === 'delayed' ? 2 : 1,
                        borderStyle: 'solid',
                        borderColor: (theme) =>
                          sla === 'delayed'
                            ? theme.vars.palette.error.main
                            : sla === 'warning'
                              ? theme.vars.palette.warning.main
                              : theme.vars.palette.divider,
                      }}
                    >
                      {/* Cabeçalho do Card (Ordem de Chegada + Canal + Cronômetro) */}
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: (theme) =>
                            varAlpha(theme.vars.palette[slaColor].mainChannel, 0.12),
                          borderBottom: (theme) => `1px solid ${theme.vars.palette.divider}`,
                        }}
                      >
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          spacing={1}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="h6" sx={{ fontWeight: 900 }}>
                              #{index + 1}
                            </Typography>
                            <Label
                              variant="filled"
                              color={channelMeta.color}
                              startIcon={<Iconify icon={channelMeta.icon} width={15} />}
                            >
                              {channelMeta.label}
                            </Label>
                          </Stack>

                          <Stack alignItems="flex-end">
                            <Typography
                              variant="h5"
                              color={`${slaColor}.main`}
                              sx={{ fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}
                            >
                              {formatKitchenTimer(elapsedSec)}
                            </Typography>
                            <Typography variant="caption" color={`${slaColor}.dark`} sx={{ fontWeight: 700 }}>
                              {SLA_LABEL[sla]}
                            </Typography>
                          </Stack>
                        </Stack>

                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{ mt: 1 }}
                        >
                          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
                            {order.customerName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {order.code} • {order.createdAt ? fTime(order.createdAt) : ''}
                          </Typography>
                        </Stack>
                      </Box>

                      {/* Lista de itens para preparo (com checklist) */}
                      <Stack spacing={1.25} sx={{ p: 2, flex: 1 }}>
                        <Label
                          variant="soft"
                          color={isPreparing ? 'info' : 'warning'}
                          sx={{ alignSelf: 'flex-start' }}
                        >
                          {isPreparing ? 'Em preparo na cozinha' : 'Aguardando iniciar preparo'}
                        </Label>

                        {order.items.map((item, itemIdx) => {
                          const checked = Boolean(checkedItems[`${order.id}:${itemIdx}`]);
                          return (
                            <Box
                              key={`${order.id}-${item.productId}-${itemIdx}`}
                              onClick={() => handleToggleItemCheck(order.id, itemIdx)}
                              sx={{
                                p: 1,
                                borderRadius: 1,
                                cursor: 'pointer',
                                bgcolor: checked ? 'action.hover' : 'background.neutral',
                                opacity: checked ? 0.58 : 1,
                              }}
                            >
                              <Stack direction="row" spacing={1} alignItems="flex-start">
                                <Checkbox
                                  size="small"
                                  checked={checked}
                                  sx={{ p: 0.25, mt: 0.25 }}
                                />
                                <Box sx={{ flex: 1 }}>
                                  <Typography
                                    variant="subtitle1"
                                    sx={{
                                      fontWeight: 700,
                                      textDecoration: checked ? 'line-through' : 'none',
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {item.qty}x {item.productName}
                                  </Typography>
                                  {item.notes && (
                                    <Alert
                                      severity="warning"
                                      icon={<Iconify icon="solar:danger-triangle-bold" width={16} />}
                                      sx={{ mt: 0.75, py: 0, px: 1, '& .MuiAlert-message': { py: 0.5 } }}
                                    >
                                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                        {item.notes}
                                      </Typography>
                                    </Alert>
                                  )}
                                </Box>
                              </Stack>
                            </Box>
                          );
                        })}

                        {order.notes && (
                          <Alert severity="info" sx={{ py: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700 }}>
                              Obs. do pedido: {order.notes}
                            </Typography>
                          </Alert>
                        )}
                      </Stack>

                      {/* Ação principal de 1 toque */}
                      <Box sx={{ p: 2, pt: 0 }}>
                        <LoadingButton
                          fullWidth
                          size="large"
                          variant="contained"
                          color={isPreparing ? 'success' : 'primary'}
                          loading={updatingId === order.id}
                          onClick={() => handleAdvanceOrder(order)}
                          startIcon={
                            <Iconify
                              icon={
                                isPreparing
                                  ? 'solar:check-circle-bold'
                                  : 'solar:fire-bold-duotone'
                              }
                            />
                          }
                          sx={{ fontWeight: 800, py: 1.25 }}
                        >
                          {isPreparing
                            ? order.deliveryType === 'delivery'
                              ? 'Pronto · Enviar entrega'
                              : 'Marcar como Pronto'
                            : 'Iniciar Preparo'}
                        </LoadingButton>
                      </Box>
                    </Card>
                  );
                })}
              </Box>
            )}
          </Stack>
        )}
    </DashboardContent>
  );
}

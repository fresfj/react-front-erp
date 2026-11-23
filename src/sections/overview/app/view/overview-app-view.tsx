import type { Sale } from 'src/api/firestore/sales';
import type { Batch } from 'src/api/firestore/batches';
import type { Product } from 'src/api/firestore/products';
import type { Payable } from 'src/api/firestore/payables';
import type { Customer } from 'src/api/firestore/customers';
import type { CashSession } from 'src/api/firestore/cash-sessions';
import type { OnlineOrder } from 'src/api/firestore/online-orders';
import type { ProcessingOrder } from 'src/api/firestore/processing-orders';

import dayjs from 'dayjs';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import TableRow from '@mui/material/TableRow';
import { useTheme } from '@mui/material/styles';
import Grid from '@mui/material/Unstable_Grid2';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fPercent, fCurrency } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';
import { listSales } from 'src/api/firestore/sales';
import { varAlpha, stylesMode } from 'src/theme/styles';
import { listBatches } from 'src/api/firestore/batches';
import { DashboardContent } from 'src/layouts/dashboard';
import { listPayables } from 'src/api/firestore/payables';
import { listProducts } from 'src/api/firestore/products';
import { SeoIllustration } from 'src/assets/illustrations';
import { listCustomers } from 'src/api/firestore/customers';
import { listCashSessions } from 'src/api/firestore/cash-sessions';
import { listOnlineOrders } from 'src/api/firestore/online-orders';
import { listProcessingOrders } from 'src/api/firestore/processing-orders';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { useDateRangePicker } from 'src/components/custom-date-range-picker';
import {
  PeriodFilterBar,
  resolvePeriodBounds,
  isIsoInPeriodBounds,
  type DateFilterPreset,
} from 'src/components/period-filter';

import { buildAccrualDre } from 'src/sections/cash/accrual-dre';
import { ErpKpiCard } from 'src/sections/overview/erp/components/erp-kpi-card';
import { ErpNfceOverviewCard } from 'src/sections/overview/erp/components/erp-nfce-overview-card';
import { ErpDashboardSkeleton } from 'src/sections/overview/erp/components/erp-dashboard-skeleton';
import { BankingBalanceStatistics } from 'src/sections/overview/banking/banking-balance-statistics';
import {
  calcGrowthPercent,
  computeTopProducts,
  computeFiscalSummary,
  computeInventoryAlerts,
  computeChannelBreakdown,
  computeProductionMetrics,
  resolvePreviousPeriodBounds,
  computeTodayAndMonthForecast,
  computeTopIdentifiedCustomers,
} from 'src/sections/overview/erp/erp-analytics';

import { useAuthContext } from 'src/auth/hooks';

import { AppWelcome } from '../app-welcome';
import { AppCurrentDownload } from '../app-current-download';

// ----------------------------------------------------------------------

export function OverviewAppView() {
  const { user } = useAuthContext();
  const theme = useTheme();
  const { t } = useTranslate('common');

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<DateFilterPreset>('7d');
  const rangePicker = useDateRangePicker(dayjs().subtract(6, 'day'), dayjs());

  const [sales, setSales] = useState<Sale[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [processingOrders, setProcessingOrders] = useState<ProcessingOrder[]>([]);
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>([]);

  const loadDashboardData = useCallback(async () => {
    if (!enterpriseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [
        salesRows,
        payableRows,
        custRows,
        batchRows,
        productRows,
        cashRows,
        procRows,
        onlineRows,
      ] = await Promise.all([
        listSales(enterpriseId),
        listPayables(enterpriseId),
        listCustomers(enterpriseId),
        listBatches(enterpriseId),
        listProducts(enterpriseId),
        listCashSessions(enterpriseId),
        listProcessingOrders(enterpriseId),
        listOnlineOrders(enterpriseId),
      ]);
      setSales(salesRows);
      setPayables(payableRows);
      setCustomers(custRows);
      setBatches(batchRows);
      setProducts(productRows);
      setCashSessions(cashRows);
      setProcessingOrders(procRows);
      setOnlineOrders(onlineRows);
    } catch (error) {
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const bounds = useMemo(
    () => resolvePeriodBounds(preset, rangePicker.startDate, rangePicker.endDate),
    [preset, rangePicker.startDate, rangePicker.endDate]
  );

  const prevBounds = useMemo(
    () => resolvePreviousPeriodBounds(preset, bounds),
    [bounds, preset]
  );

  const filteredSales = useMemo(
    () =>
      sales.filter((s) => {
        if (!s.createdAt) return preset === 'all';
        return isIsoInPeriodBounds(s.createdAt, bounds);
      }),
    [bounds, preset, sales]
  );

  const accrual = useMemo(
    () => buildAccrualDre({ sales, payables, bounds }),
    [sales, payables, bounds]
  );

  const prevAccrual = useMemo(
    () => (prevBounds ? buildAccrualDre({ sales, payables, bounds: prevBounds }) : null),
    [sales, payables, prevBounds]
  );

  const channels = useMemo(() => computeChannelBreakdown(sales, bounds), [bounds, sales]);
  const fiscal = useMemo(() => computeFiscalSummary(sales, bounds), [bounds, sales]);
  const prevChannels = useMemo(
    () => (prevBounds ? computeChannelBreakdown(sales, prevBounds) : null),
    [prevBounds, sales]
  );

  const forecast = useMemo(
    () => computeTodayAndMonthForecast({ sales, payables }),
    [payables, sales]
  );

  const prod = useMemo(
    () => computeProductionMetrics({ orders: processingOrders, sales, batches, bounds }),
    [batches, bounds, processingOrders, sales]
  );

  const prevProd = useMemo(
    () =>
      prevBounds
        ? computeProductionMetrics({ orders: processingOrders, sales, batches, bounds: prevBounds })
        : null,
    [batches, prevBounds, processingOrders, sales]
  );

  const topProducts = useMemo(() => computeTopProducts(sales, bounds, 5), [bounds, sales]);
  const topCustomers = useMemo(
    () => computeTopIdentifiedCustomers(sales, customers, bounds, 5),
    [bounds, customers, sales]
  );
  const alerts = useMemo(
    () => computeInventoryAlerts({ products, batches }),
    [batches, products]
  );

  const dailyCategories = useMemo(
    () =>
      accrual.dailySeries.length ? accrual.dailySeries.map((d) => d.date.slice(5)) : ['—'],
    [accrual.dailySeries]
  );

  const revenueSeries = useMemo(
    () => (accrual.dailySeries.length ? accrual.dailySeries.map((d) => Math.round(d.revenue)) : [0]),
    [accrual.dailySeries]
  );

  const expenseSeries = useMemo(
    () =>
      accrual.dailySeries.length
        ? accrual.dailySeries.map((d) => Math.round(d.operatingExpenses))
        : [0],
    [accrual.dailySeries]
  );

  const netProfitSeries = useMemo(
    () =>
      accrual.dailySeries.length
        ? accrual.dailySeries.map((d) => Math.round(d.netProfit))
        : [0],
    [accrual.dailySeries]
  );

  const prodDailyCats = useMemo(
    () => (prod.dailySeries.length ? prod.dailySeries.map((d) => d.date.slice(5)) : ['—']),
    [prod.dailySeries]
  );

  const prodDailySeries = useMemo(
    () =>
      prod.dailySeries.length
        ? prod.dailySeries.map((d) =>
            prod.litersProduced > 0 ? d.litersProduced : d.totalOutputQty
          )
        : [0],
    [prod.dailySeries, prod.litersProduced]
  );

  const balanceStatisticsChart = useMemo(
    () => ({
      colors: [
        theme.vars.palette.primary.dark,
        theme.vars.palette.warning.main,
        theme.vars.palette.info.main,
      ],
      series: [
        {
          name: t('overviewKpi.balancePeriod', { defaultValue: 'Período' }),
          categories: dailyCategories,
          data: [
            {
              name: t('overviewKpi.kpiNetRevenue', { defaultValue: 'Receita' }),
              data: revenueSeries,
            },
            {
              name: t('overviewKpi.kpiExpenses', { defaultValue: 'Despesas' }),
              data: expenseSeries,
            },
            {
              name: t('overviewKpi.kpiNetProfit', { defaultValue: 'Lucro' }),
              data: netProfitSeries,
            },
          ],
        },
      ],
    }),
    [dailyCategories, expenseSeries, netProfitSeries, revenueSeries, t, theme.vars.palette]
  );

  const channelDonutSeries = useMemo(() => {
    const entries = [
      { label: 'Loja Física (PDV)', value: channels.posRevenue },
      { label: 'Pedidos Online', value: channels.onlineRevenue },
    ].filter((e) => e.value > 0);
    return entries.length ? entries : [{ label: 'Sem vendas no período', value: 1 }];
  }, [channels.onlineRevenue, channels.posRevenue]);

  const openSession = useMemo(
    () => cashSessions.find((s) => s.status === 'open') || null,
    [cashSessions]
  );

  const pendingOnlineCount = useMemo(
    () => onlineOrders.filter((o) => o.status === 'pending').length,
    [onlineOrders]
  );

  const totalCustomerDebt = useMemo(
    () =>
      customers
        .filter((c) => c.active && c.currentDebt > 0)
        .reduce((acc, c) => acc + c.currentDebt, 0),
    [customers]
  );

  const mainProdValue = prod.litersProduced > 0 ? prod.litersProduced : prod.totalOutputQty;
  const prevProdValue = prevProd
    ? prevProd.litersProduced > 0
      ? prevProd.litersProduced
      : prevProd.totalOutputQty
    : null;

  return (
    <DashboardContent maxWidth="xl">
      <PeriodFilterBar
        preset={preset}
        onPresetChange={setPreset}
        rangePicker={rangePicker}
        title={t('periodFilter.overviewTitle', {
          defaultValue: 'Filtro de período — Visão Geral Executiva',
        })}
      />

      {loading ? (
        <ErpDashboardSkeleton />
      ) : (
        <Grid container spacing={3}>
          {/* Banner Executivo + Raio-X Rápido do Dia e Prévia do Mês */}
          <Grid xs={12} md={8}>
            <AppWelcome
              title={`Olá, ${user?.displayName || user?.email || 'Gestor'} 👋`}
              description={
                enterpriseId
                  ? `${openSession ? `Caixa Aberto (${openSession.code})` : 'Caixa fechado no momento'} • ${
                      pendingOnlineCount > 0
                        ? `${pendingOnlineCount} pedido(s) online aguardando aceite`
                        : 'Sem pedidos online pendentes'
                    }`
                  : 'Painel Administrativo SaaS Multi-Empresa'
              }
              img={<SeoIllustration hideBackground />}
              action={
                <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.pos.checkout}
                    variant="contained"
                    color="primary"
                    startIcon={<Iconify icon="solar:cart-large-2-bold" />}
                  >
                    Abrir PDV
                  </Button>
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.processing.create}
                    variant="soft"
                    color="info"
                    startIcon={<Iconify icon="solar:refresh-circle-bold" />}
                  >
                    Novo Beneficiamento
                  </Button>
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.general.salesFinance}
                    variant="outlined"
                    color="inherit"
                    startIcon={<Iconify icon="solar:chart-2-bold" />}
                  >
                    Vendas & Financeiro
                  </Button>
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.general.production}
                    variant="outlined"
                    color="inherit"
                    startIcon={<Iconify icon="solar:box-bold" />}
                  >
                    Produção
                  </Button>
                </Stack>
              }
            />
          </Grid>

          <Grid xs={12} md={4}>
            <Card
              sx={{
                p: 3,
                height: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
                border: `1px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.2)}`,
                [stylesMode.dark]: {
                  bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.14),
                },
              }}
            >
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: 'primary.darker',
                      [stylesMode.dark]: { color: 'primary.lighter' },
                    }}
                  >
                    Resumo de Hoje & Prévia do Mês
                  </Typography>
                  <Label
                    color={forecast.projectedGrowthPercent >= 0 ? 'success' : 'error'}
                    variant="soft"
                  >
                    {forecast.projectedGrowthPercent >= 0 ? '+' : ''}
                    {fPercent(forecast.projectedGrowthPercent)}
                  </Label>
                </Stack>

                <Typography variant="h3">{fCurrency(forecast.todayRevenue)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Hoje ({forecast.todaySalesCount} vendas) • Lucro est.:{' '}
                  {fCurrency(forecast.todayNetProfit)}
                </Typography>
              </Box>

              <Divider sx={{ borderStyle: 'dashed', my: 2 }} />

              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Acumulado no mês ({forecast.daysElapsedInMonth}/{forecast.daysInMonth}d)
                  </Typography>
                  <Typography variant="subtitle2">{fCurrency(forecast.monthRevenue)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Prévia de fechamento
                  </Typography>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: 'success.dark',
                      [stylesMode.dark]: { color: 'success.light' },
                    }}
                  >
                    {fCurrency(forecast.projectedMonthRevenue)}
                  </Typography>
                </Stack>
              </Stack>
            </Card>
          </Grid>

          {/* 4 KPIs Principais Simplificados */}
          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title="Receita no Período"
              value={fCurrency(accrual.netRevenue)}
              percent={
                prevAccrual ? calcGrowthPercent(accrual.netRevenue, prevAccrual.netRevenue) : null
              }
              subtitle={`Ticket médio: ${fCurrency(channels.avgTicket)}`}
              chart={{
                colors: [theme.palette.primary.light, theme.palette.primary.main],
                categories: dailyCategories,
                series: revenueSeries,
              }}
            />
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title="Lucro Líquido"
              value={fCurrency(accrual.netProfit)}
              percent={
                prevAccrual ? calcGrowthPercent(accrual.netProfit, prevAccrual.netProfit) : null
              }
              subtitle={`Margem líquida: ${accrual.netMarginPercent}%`}
              chart={{
                colors: [theme.palette.info.light, theme.palette.info.main],
                categories: dailyCategories,
                series: netProfitSeries,
              }}
            />
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title={prod.litersProduced > 0 ? 'Litros Processados' : 'Volume Produzido'}
              value={`${fNumber(mainProdValue)} ${prod.primaryOutputUnit}`}
              percent={
                prevProdValue !== null ? calcGrowthPercent(mainProdValue, prevProdValue) : null
              }
              subtitle={`Vendido: ${fNumber(prod.litersSoldInPeriod)} L • ${prod.ordersCount} ordens`}
              chartType="bar"
              chart={{
                colors: [theme.palette.success.light, theme.palette.success.main],
                categories: prodDailyCats,
                series: prodDailySeries,
              }}
            />
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title="Pedidos (Loja + Online)"
              value={fNumber(channels.totalCount)}
              percent={
                prevChannels ? calcGrowthPercent(channels.totalCount, prevChannels.totalCount) : null
              }
              subtitle={`PDV: ${channels.posCount} • Online: ${channels.onlineCount}`}
              chartType="bar"
              chart={{
                colors: [theme.palette.warning.light, theme.palette.warning.main],
                categories: dailyCategories,
                series: revenueSeries,
              }}
            />
          </Grid>

          {/* Gráfico Principal Financeiro + Canais de Venda */}
          <Grid xs={12} lg={8}>
            <BankingBalanceStatistics
              title="Fluxo Financeiro (Receita × Despesas × Lucro)"
              subheader="Evolução diária no período selecionado"
              chart={balanceStatisticsChart}
              sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            />
          </Grid>

          <Grid xs={12} lg={4}>
            <AppCurrentDownload
              title="Canais de Venda"
              subheader={`PDV ${fPercent(channels.posSharePercent)} • Online ${fPercent(channels.onlineSharePercent)}`}
              chart={{ series: channelDonutSeries }}
              sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            />
          </Grid>

          {/* Top 5 Produtos + Top 5 Clientes Identificados */}
          <Grid xs={12} lg={6}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title="Top 5 Produtos Mais Vendidos"
                subheader="Por receita e quantidade no período"
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.general.salesFinance}
                    size="small"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                  >
                    Raio-X completo
                  </Button>
                }
                sx={{ mb: 1.5 }}
              />
              {topProducts.length === 0 ? (
                <Box sx={{ py: 4 }}>
                  <EmptyContent title="Sem vendas de produtos no período" />
                </Box>
              ) : (
                <Scrollbar>
                  <Table sx={{ minWidth: 440 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Produto</TableCell>
                        <TableCell align="right">Qtd.</TableCell>
                        <TableCell align="right">Receita</TableCell>
                        <TableCell align="right">Margem</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {topProducts.map((item) => (
                        <TableRow key={item.productId || item.productName}>
                          <TableCell>
                            <ListItemText
                              primary={item.productName}
                              secondary={item.productSku || '—'}
                              primaryTypographyProps={{ variant: 'subtitle2' }}
                              secondaryTypographyProps={{ variant: 'caption' }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {fNumber(item.qtySold)} {item.unit}
                          </TableCell>
                          <TableCell align="right">{fCurrency(item.revenue)}</TableCell>
                          <TableCell align="right">
                            <Label
                              variant="soft"
                              color={item.marginPercent >= 30 ? 'success' : 'warning'}
                            >
                              {fPercent(item.marginPercent)}
                            </Label>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Scrollbar>
              )}
            </Card>
          </Grid>

          <Grid xs={12} lg={6}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title="Top 5 Clientes Identificados"
                subheader="Maiores compradores no período"
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.general.salesFinance}
                    size="small"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                  >
                    Ver ranking
                  </Button>
                }
                sx={{ mb: 1.5 }}
              />
              {topCustomers.length === 0 ? (
                <Box sx={{ py: 4 }}>
                  <EmptyContent title="Nenhum cliente identificado no período" />
                </Box>
              ) : (
                <Scrollbar>
                  <Table sx={{ minWidth: 420 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Cliente</TableCell>
                        <TableCell align="right">Compras</TableCell>
                        <TableCell align="right">Total Gasto</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {topCustomers.map((c) => (
                        <TableRow key={c.key}>
                          <TableCell>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar
                                sx={{
                                  width: 32,
                                  height: 32,
                                  bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.16),
                                  color: 'primary.dark',
                                  [stylesMode.dark]: { color: 'primary.light' },
                                }}
                              >
                                {c.customerName.charAt(0).toUpperCase()}
                              </Avatar>
                              <ListItemText
                                primary={c.customerName}
                                secondary={`Ticket médio ${fCurrency(c.avgTicket)}`}
                                primaryTypographyProps={{ variant: 'subtitle2' }}
                                secondaryTypographyProps={{ variant: 'caption' }}
                              />
                            </Stack>
                          </TableCell>
                          <TableCell align="right">{c.ordersCount}</TableCell>
                          <TableCell align="right">
                            <Typography variant="subtitle2">{fCurrency(c.totalSpent)}</Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Scrollbar>
              )}
            </Card>
          </Grid>

          {/* Vendas Recentes + Alertas Operacionais */}
          <Grid xs={12} lg={8}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title="Vendas Recentes"
                subheader="Últimas movimentações (PDV e Catálogo Online)"
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.pos.sales}
                    size="small"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                  >
                    Ver todas
                  </Button>
                }
                sx={{ mb: 1.5 }}
              />
              {filteredSales.length === 0 ? (
                <Box sx={{ py: 4 }}>
                  <EmptyContent title="Nenhuma venda registrada neste período" />
                </Box>
              ) : (
                <Scrollbar>
                  <Table sx={{ minWidth: 620 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Código</TableCell>
                        <TableCell>Canal</TableCell>
                        <TableCell>Cliente</TableCell>
                        <TableCell>Data</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell align="right">Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredSales.slice(0, 6).map((sale) => (
                        <TableRow
                          key={sale.id}
                          hover
                          component={RouterLink}
                          href={paths.dashboard.pos.saleDetails(sale.id)}
                          sx={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <TableCell sx={{ fontWeight: 600 }}>{sale.code}</TableCell>
                          <TableCell>
                            <Label
                              variant="soft"
                              color={sale.channel === 'online' ? 'info' : 'default'}
                            >
                              {sale.channel === 'online' ? 'Online' : 'PDV'}
                            </Label>
                          </TableCell>
                          <TableCell>{sale.customerName || 'Consumidor Final'}</TableCell>
                          <TableCell>{sale.createdAt ? fDateTime(sale.createdAt) : '—'}</TableCell>
                          <TableCell align="right">{fCurrency(sale.total)}</TableCell>
                          <TableCell align="right">
                            <Label
                              variant="soft"
                              color={sale.status === 'completed' ? 'success' : 'error'}
                            >
                              {sale.status === 'completed' ? 'Concluída' : 'Cancelada'}
                            </Label>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Scrollbar>
              )}
            </Card>
          </Grid>

          <Grid xs={12} lg={4}>
            <Card sx={{ height: 1 }}>
              <CardHeader
                title="Alertas Operacionais"
                subheader="Estoque, validade e fiado"
              />
              <Stack spacing={2} sx={{ p: 3 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.neutral' }}
                >
                  <ListItemText
                    primary="Produtos com estoque baixo"
                    secondary="Abaixo do mínimo cadastrado"
                    primaryTypographyProps={{ variant: 'subtitle2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Label color={alerts.lowStock.length > 0 ? 'error' : 'success'} variant="soft">
                    {alerts.lowStock.length}
                  </Label>
                </Stack>

                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.neutral' }}
                >
                  <ListItemText
                    primary="Lotes vencendo (≤ 7 dias)"
                    secondary="Atenção ao giro FIFO"
                    primaryTypographyProps={{ variant: 'subtitle2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Label
                    color={alerts.expiringBatches.length > 0 ? 'warning' : 'success'}
                    variant="soft"
                  >
                    {alerts.expiringBatches.length}
                  </Label>
                </Stack>

                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.neutral' }}
                >
                  <ListItemText
                    primary="Pedidos online pendentes"
                    secondary="Aguardando aceite na fila"
                    primaryTypographyProps={{ variant: 'subtitle2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Label color={pendingOnlineCount > 0 ? 'info' : 'default'} variant="soft">
                    {pendingOnlineCount}
                  </Label>
                </Stack>

                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'background.neutral' }}
                >
                  <ListItemText
                    primary="Contas a receber (Fiado)"
                    secondary="Débito acumulado de clientes"
                    primaryTypographyProps={{ variant: 'subtitle2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: 'warning.dark',
                      [stylesMode.dark]: { color: 'warning.light' },
                    }}
                  >
                    {fCurrency(totalCustomerDebt)}
                  </Typography>
                </Stack>

                <Button
                  component={RouterLink}
                  href={paths.dashboard.general.production}
                  variant="soft"
                  color="primary"
                  fullWidth
                  endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                >
                  Ver painel de Produção & Estoque
                </Button>
              </Stack>
            </Card>
          </Grid>

          {/* Notas Fiscais Geradas (NFC-e) */}
          <Grid xs={12}>
            <ErpNfceOverviewCard sales={filteredSales} fiscal={fiscal} />
          </Grid>
        </Grid>
      )}
    </DashboardContent>
  );
}

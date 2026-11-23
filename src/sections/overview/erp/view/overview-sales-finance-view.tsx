import type { Sale } from 'src/api/firestore/sales';
import type { Payable } from 'src/api/firestore/payables';
import type { Customer } from 'src/api/firestore/customers';
import type { Receivable } from 'src/api/firestore/receivables';
import type { OnlineOrder } from 'src/api/firestore/online-orders';

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
import LinearProgress from '@mui/material/LinearProgress';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fNumber, fPercent, fCurrency } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';
import { listSales } from 'src/api/firestore/sales';
import { varAlpha, stylesMode } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import { listPayables } from 'src/api/firestore/payables';
import { listCustomers } from 'src/api/firestore/customers';
import { listReceivables } from 'src/api/firestore/receivables';
import { listOnlineOrders } from 'src/api/firestore/online-orders';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { useDateRangePicker } from 'src/components/custom-date-range-picker';
import { Chart, useChart, ChartSelect, ChartLegends } from 'src/components/chart';
import {
  PeriodFilterBar,
  resolvePeriodBounds,
  isIsoInPeriodBounds,
  type DateFilterPreset,
} from 'src/components/period-filter';

import { buildAccrualDre } from 'src/sections/cash/accrual-dre';
import { calculateDreReport } from 'src/sections/cash/cash-calculator';
import { AppCurrentDownload } from 'src/sections/overview/app/app-current-download';
import { BankingBalanceStatistics } from 'src/sections/overview/banking/banking-balance-statistics';

import { useAuthContext } from 'src/auth/hooks';

import { ErpKpiCard } from '../components/erp-kpi-card';
import { ErpNfceOverviewCard } from '../components/erp-nfce-overview-card';
import { ErpDashboardSkeleton } from '../components/erp-dashboard-skeleton';
import {
  calcGrowthPercent,
  computeTopProducts,
  computeFiscalSummary,
  computeChannelBreakdown,
  computeOnlineOrderFunnel,
  computeCashFlowObligations,
  resolvePreviousPeriodBounds,
  computeTodayAndMonthForecast,
  computeTopIdentifiedCustomers,
} from '../erp-analytics';

// ----------------------------------------------------------------------

const RANK_COLORS: Array<'warning' | 'info' | 'secondary' | 'default'> = [
  'warning',
  'info',
  'secondary',
  'default',
];

export function OverviewSalesFinanceView() {
  const { user } = useAuthContext();
  const theme = useTheme();
  const { t } = useTranslate('common');

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<DateFilterPreset>('7d');
  const rangePicker = useDateRangePicker(dayjs().subtract(6, 'day'), dayjs());
  const [channelMetric, setChannelMetric] = useState<'Receita (R$)' | 'Pedidos (Qtd)'>(
    'Receita (R$)'
  );

  const [sales, setSales] = useState<Sale[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>([]);

  const loadData = useCallback(async () => {
    if (!enterpriseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [salesRows, payableRows, receivableRows, customerRows, orderRows] = await Promise.all([
        listSales(enterpriseId),
        listPayables(enterpriseId),
        listReceivables(enterpriseId),
        listCustomers(enterpriseId),
        listOnlineOrders(enterpriseId),
      ]);
      setSales(salesRows);
      setPayables(payableRows);
      setReceivables(receivableRows);
      setCustomers(customerRows);
      setOnlineOrders(orderRows);
    } catch (error) {
      console.error('Sales & Finance dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    [bounds, payables, sales]
  );

  const prevAccrual = useMemo(
    () => (prevBounds ? buildAccrualDre({ sales, payables, bounds: prevBounds }) : null),
    [payables, prevBounds, sales]
  );

  const dre = useMemo(() => calculateDreReport({ sales: filteredSales }), [filteredSales]);

  const channels = useMemo(() => computeChannelBreakdown(sales, bounds), [bounds, sales]);
  const fiscal = useMemo(() => computeFiscalSummary(sales, bounds), [bounds, sales]);
  const funnel = useMemo(
    () => computeOnlineOrderFunnel(onlineOrders, bounds),
    [bounds, onlineOrders]
  );
  const forecast = useMemo(
    () => computeTodayAndMonthForecast({ sales, payables }),
    [payables, sales]
  );
  const topProducts = useMemo(() => computeTopProducts(sales, bounds, 8), [bounds, sales]);
  const topCustomers = useMemo(
    () => computeTopIdentifiedCustomers(sales, customers, bounds, 8),
    [bounds, customers, sales]
  );
  const obligations = useMemo(
    () => computeCashFlowObligations({ payables, receivables, bounds }),
    [bounds, payables, receivables]
  );

  // Sparkline series
  const dailyCats = useMemo(
    () => (accrual.dailySeries.length ? accrual.dailySeries.map((d) => d.date.slice(5)) : ['—']),
    [accrual.dailySeries]
  );
  const revenueSpark = useMemo(
    () => (accrual.dailySeries.length ? accrual.dailySeries.map((d) => Math.round(d.revenue)) : [0]),
    [accrual.dailySeries]
  );
  const cogsSpark = useMemo(
    () => (accrual.dailySeries.length ? accrual.dailySeries.map((d) => Math.round(d.cogs)) : [0]),
    [accrual.dailySeries]
  );
  const expenseSpark = useMemo(
    () =>
      accrual.dailySeries.length
        ? accrual.dailySeries.map((d) => Math.round(d.operatingExpenses))
        : [0],
    [accrual.dailySeries]
  );
  const profitSpark = useMemo(
    () =>
      accrual.dailySeries.length ? accrual.dailySeries.map((d) => Math.round(d.netProfit)) : [0],
    [accrual.dailySeries]
  );

  // Channel Area Chart (POS vs Online)
  const channelChartCategories = useMemo(
    () =>
      channels.dailySeries.length ? channels.dailySeries.map((d) => d.date.slice(5)) : ['—'],
    [channels.dailySeries]
  );

  const channelChartSeries = useMemo(() => {
    if (channelMetric === 'Pedidos (Qtd)') {
      return [
        {
          name: 'PDV (Venda Direta)',
          data: channels.dailySeries.length ? channels.dailySeries.map((d) => d.posCount) : [0],
        },
        {
          name: 'Online / Delivery',
          data: channels.dailySeries.length ? channels.dailySeries.map((d) => d.onlineCount) : [0],
        },
        {
          name: 'Mesas / Salão',
          data: channels.dailySeries.length ? channels.dailySeries.map((d) => d.tableCount) : [0],
        },
      ];
    }
    return [
      {
        name: 'PDV (Venda Direta)',
        data: channels.dailySeries.length
          ? channels.dailySeries.map((d) => Math.round(d.posRevenue))
          : [0],
      },
      {
        name: 'Online / Delivery',
        data: channels.dailySeries.length
          ? channels.dailySeries.map((d) => Math.round(d.onlineRevenue))
          : [0],
      },
      {
        name: 'Mesas / Salão',
        data: channels.dailySeries.length
          ? channels.dailySeries.map((d) => Math.round(d.tableRevenue))
          : [0],
      },
    ];
  }, [channelMetric, channels.dailySeries]);

  const channelChartOptions = useChart({
    colors: [theme.palette.primary.main, theme.palette.info.main, theme.palette.warning.main],
    xaxis: { categories: channelChartCategories },
    tooltip: {
      y: {
        formatter: (value: number) =>
          channelMetric === 'Pedidos (Qtd)' ? `${fNumber(value)} pedidos` : fCurrency(value),
      },
    },
  });

  // Payment methods donut
  const paymentChartSeries = useMemo(() => {
    const m = dre.byMethod;
    const entries = [
      { label: 'PIX', value: m.pix },
      { label: 'Dinheiro', value: m.cash },
      { label: 'Crédito', value: m.credit_card },
      { label: 'Débito', value: m.debit_card },
      { label: 'Crediário / Fiado', value: m.credit_tab },
    ].filter((e) => e.value > 0);
    return entries.length ? entries : [{ label: 'Sem vendas no período', value: 1 }];
  }, [dre.byMethod]);

  // Financial Balance Bar Chart
  const balanceStatisticsChart = useMemo(
    () => ({
      colors: [
        theme.vars.palette.primary.dark,
        theme.vars.palette.warning.main,
        theme.vars.palette.error.main,
        theme.vars.palette.info.main,
      ],
      series: [
        {
          name: 'Diário',
          categories: dailyCats,
          data: [
            { name: 'Receita', data: revenueSpark },
            { name: 'CMV', data: cogsSpark },
            { name: 'Despesas', data: expenseSpark },
            { name: 'Lucro Líquido', data: profitSpark },
          ],
        },
      ],
    }),
    [cogsSpark, dailyCats, expenseSpark, profitSpark, revenueSpark, theme.vars.palette]
  );

  // Expenses by Category Donut
  const expenseChartSeries = useMemo(() => {
    const categoryFallbacks: Record<string, string> = {
      utilities_power: 'Luz / Energia',
      utilities_internet: 'Internet',
      rent: 'Aluguel',
      supplier: 'Fornecedor',
      tax: 'Impostos',
      other: 'Outros',
    };
    return accrual.expenseLines.map((line) => ({
      label: t(`finance.categories.${line.category}`, {
        defaultValue: categoryFallbacks[line.category] ?? line.category,
      }),
      value: line.amount,
    }));
  }, [accrual.expenseLines, t]);

  const revenueGrowth = prevAccrual
    ? calcGrowthPercent(accrual.netRevenue, prevAccrual.netRevenue)
    : null;
  const cogsGrowth = prevAccrual ? calcGrowthPercent(accrual.cogs, prevAccrual.cogs) : null;
  const expenseGrowth = prevAccrual
    ? calcGrowthPercent(accrual.operatingExpenses, prevAccrual.operatingExpenses)
    : null;
  const profitGrowth = prevAccrual
    ? calcGrowthPercent(accrual.netProfit, prevAccrual.netProfit)
    : null;

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading="Vendas & Financeiro"
        links={[
          { name: 'Visão Geral', href: paths.dashboard.root },
          { name: 'Vendas & Financeiro' },
        ]}
        action={
          <Stack direction="row" spacing={1}>
            <Button
              component={RouterLink}
              href={paths.dashboard.cash.dre}
              variant="soft"
              color="primary"
              startIcon={<Iconify icon="solar:document-text-bold" />}
            >
              DRE Detalhado
            </Button>
            <Button
              component={RouterLink}
              href={paths.dashboard.pos.checkout}
              variant="contained"
              startIcon={<Iconify icon="solar:cart-large-2-bold" />}
            >
              Abrir PDV
            </Button>
          </Stack>
        }
        sx={{ mb: 3 }}
      />

      <PeriodFilterBar
        preset={preset}
        onPresetChange={setPreset}
        rangePicker={rangePicker}
        title="Filtro de período — Vendas, Canais, Fiscal e Financeiro"
      />

      {loading ? (
        <ErpDashboardSkeleton />
      ) : (
        <Grid container spacing={3}>
          {/* Faixa 1: Raio-X Hoje, Mês Atual, Prévia de Crescimento e Fiscal */}
          <Grid xs={12} sm={6} md={3}>
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
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
                <Typography
                  variant="subtitle2"
                  noWrap
                  sx={{
                    color: 'primary.darker',
                    [stylesMode.dark]: { color: 'primary.lighter' },
                  }}
                >
                  Vendas Hoje
                </Typography>
                <Iconify icon="solar:sun-2-bold-duotone" width={26} sx={{ color: 'primary.main', flexShrink: 0 }} />
              </Stack>
              <Typography variant="h3" noWrap sx={{ mb: 0.5 }}>
                {fCurrency(forecast.todayRevenue)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {forecast.todaySalesCount} venda(s) • Lucro est.: {fCurrency(forecast.todayNetProfit)}
              </Typography>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card
              sx={{
                p: 3,
                height: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                bgcolor: varAlpha(theme.vars.palette.info.mainChannel, 0.08),
                border: `1px solid ${varAlpha(theme.vars.palette.info.mainChannel, 0.2)}`,
                [stylesMode.dark]: {
                  bgcolor: varAlpha(theme.vars.palette.info.mainChannel, 0.14),
                },
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
                <Typography
                  variant="subtitle2"
                  noWrap
                  sx={{
                    color: 'info.darker',
                    [stylesMode.dark]: { color: 'info.lighter' },
                  }}
                >
                  Acumulado no Mês
                </Typography>
                <Iconify icon="solar:calendar-bold-duotone" width={26} sx={{ color: 'info.main', flexShrink: 0 }} />
              </Stack>
              <Typography variant="h3" noWrap sx={{ mb: 0.5 }}>
                {fCurrency(forecast.monthRevenue)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                Dia {forecast.daysElapsedInMonth}/{forecast.daysInMonth} • Lucro:{' '}
                {fCurrency(forecast.monthNetProfit)}
              </Typography>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card
              sx={{
                p: 3,
                height: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                bgcolor: varAlpha(theme.vars.palette.success.mainChannel, 0.08),
                border: `1px solid ${varAlpha(theme.vars.palette.success.mainChannel, 0.2)}`,
                [stylesMode.dark]: {
                  bgcolor: varAlpha(theme.vars.palette.success.mainChannel, 0.14),
                },
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
                <Typography
                  variant="subtitle2"
                  noWrap
                  sx={{
                    color: 'success.darker',
                    [stylesMode.dark]: { color: 'success.lighter' },
                  }}
                >
                  Prévia do Mês
                </Typography>
                <Iconify icon="solar:graph-up-bold-duotone" width={26} sx={{ color: 'success.main', flexShrink: 0 }} />
              </Stack>
              <Typography variant="h3" noWrap sx={{ mb: 0.5 }}>
                {fCurrency(forecast.projectedMonthRevenue)}
              </Typography>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                <Label
                  color={forecast.projectedGrowthPercent >= 0 ? 'success' : 'error'}
                  variant="soft"
                  sx={{ flexShrink: 0 }}
                >
                  {forecast.projectedGrowthPercent >= 0 ? '+' : ''}
                  {fPercent(forecast.projectedGrowthPercent)}
                </Label>
                <Typography variant="caption" color="text.secondary" noWrap>
                  vs mês anterior ({fCurrency(forecast.prevMonthRevenue)})
                </Typography>
              </Stack>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card
              sx={{
                p: 3,
                height: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                bgcolor: varAlpha(theme.vars.palette.warning.mainChannel, 0.08),
                border: `1px solid ${varAlpha(theme.vars.palette.warning.mainChannel, 0.2)}`,
                [stylesMode.dark]: {
                  bgcolor: varAlpha(theme.vars.palette.warning.mainChannel, 0.14),
                },
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
                <Typography
                  variant="subtitle2"
                  noWrap
                  sx={{
                    color: 'warning.darker',
                    [stylesMode.dark]: { color: 'warning.lighter' },
                  }}
                >
                  Fiscal (NFC-e)
                </Typography>
                <Iconify icon="solar:bill-check-bold-duotone" width={26} sx={{ color: 'warning.main', flexShrink: 0 }} />
              </Stack>
              <Typography variant="h3" noWrap sx={{ mb: 0.5 }}>
                {fPercent(fiscal.compliancePercent)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {fiscal.authorizedCount} emitidas ({fCurrency(fiscal.authorizedTotal)}) •{' '}
                {fiscal.pendingCount} pendentes
              </Typography>
            </Card>
          </Grid>

          {/* Faixa 2: 4 KPIs do Período */}
          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title="Receita Líquida"
              value={fCurrency(accrual.netRevenue)}
              percent={revenueGrowth}
              subtitle={`${channels.totalCount} vendas • Ticket médio ${fCurrency(channels.avgTicket)}`}
              chart={{
                colors: [theme.palette.primary.light, theme.palette.primary.main],
                categories: dailyCats,
                series: revenueSpark,
              }}
            />
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title="CMV (Custo Mercadorias)"
              value={fCurrency(accrual.cogs)}
              percent={cogsGrowth}
              subtitle={`Lucro bruto ${fCurrency(accrual.grossProfit)} (${accrual.grossMarginPercent}%)`}
              chart={{
                colors: [theme.palette.warning.light, theme.palette.warning.main],
                categories: dailyCats,
                series: cogsSpark,
              }}
            />
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title="Despesas Operacionais"
              value={fCurrency(accrual.operatingExpenses)}
              percent={expenseGrowth}
              subtitle={
                accrual.salesFees > 0
                  ? `Taxas de cartão/venda: ${fCurrency(accrual.salesFees)}`
                  : 'Contas a pagar por competência'
              }
              chartType="bar"
              chart={{
                colors: [theme.palette.error.light, theme.palette.error.main],
                categories: dailyCats,
                series: expenseSpark,
              }}
            />
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title="Lucro Líquido Estimado"
              value={fCurrency(accrual.netProfit)}
              percent={profitGrowth}
              subtitle={`Margem líquida: ${accrual.netMarginPercent}%`}
              chart={{
                colors: [theme.palette.info.light, theme.palette.info.main],
                categories: dailyCats,
                series: profitSpark,
              }}
            />
          </Grid>

          {/* Faixa 3: Comparativo PDV vs Online/Delivery vs Mesas + Formas de Pagamento */}
          <Grid xs={12} lg={8}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title="Vendas por Canal — PDV, Online/Delivery e Mesas"
                subheader={`PDV: ${fPercent(channels.posSharePercent)} • Online: ${fPercent(channels.onlineSharePercent)} • Mesas: ${fPercent(channels.tableSharePercent)}`}
                action={
                  <ChartSelect
                    options={['Receita (R$)', 'Pedidos (Qtd)']}
                    value={channelMetric}
                    onChange={(val) => setChannelMetric(val as 'Receita (R$)' | 'Pedidos (Qtd)')}
                  />
                }
                sx={{ mb: 2 }}
              />

              <ChartLegends
                colors={channelChartOptions?.colors}
                labels={['PDV (Venda Direta)', 'Online / Delivery', 'Mesas / Salão']}
                values={
                  channelMetric === 'Pedidos (Qtd)'
                    ? [
                        `${channels.posCount} vendas`,
                        `${channels.onlineCount} pedidos`,
                        `${channels.tableCount} mesas`,
                      ]
                    : [
                        fCurrency(channels.posRevenue),
                        fCurrency(channels.onlineRevenue),
                        fCurrency(channels.tableRevenue),
                      ]
                }
                sx={{ px: 3, gap: 3 }}
              />

              <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
                <Chart
                  type="area"
                  series={channelChartSeries}
                  options={channelChartOptions}
                  height={320}
                  sx={{ width: 1, py: 2.5, pl: 1, pr: 2.5 }}
                />
              </Box>
            </Card>
          </Grid>

          <Grid xs={12} lg={4}>
            <AppCurrentDownload
              title="Formas de Pagamento"
              subheader={`Total recebido: ${fCurrency(accrual.netRevenue)}`}
              chart={{ series: paymentChartSeries }}
              sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            />
          </Grid>

          {/* Faixa 4: Evolução Financeira + Despesas por Categoria (mesma altura!) */}
          <Grid xs={12} lg={7}>
            <BankingBalanceStatistics
              title="Raio-X Financeiro Diário"
              subheader="Receita × CMV × Despesas × Lucro Líquido"
              chart={balanceStatisticsChart}
              sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            />
          </Grid>

          <Grid xs={12} lg={5}>
            <AppCurrentDownload
              title="Despesas por Categoria"
              subheader={`Total no período: ${fCurrency(accrual.operatingExpenses)}`}
              chart={{
                series: expenseChartSeries.length
                  ? expenseChartSeries
                  : [{ label: 'Sem despesas no período', value: 1 }],
              }}
              sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            />
          </Grid>

          {/* Faixa 5: Contas a Pagar & Receber + Funil de Pedidos Online (mesma altura!) */}
          <Grid xs={12} lg={5}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <CardHeader
                title="Contas a Pagar & Receber"
                subheader="Obrigações em aberto e vencidas"
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.cash.payables}
                    size="small"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                  >
                    Gerenciar
                  </Button>
                }
              />
              <Stack spacing={2.25} sx={{ p: 3 }}>
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="subtitle2">A Receber em Aberto</Typography>
                    <Typography variant="subtitle2" color="success.main">
                      {fCurrency(obligations.receivablesOpen)}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    color="success"
                    value={
                      obligations.receivablesOpen + obligations.receivablesReceivedInPeriod > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (obligations.receivablesReceivedInPeriod /
                                (obligations.receivablesOpen +
                                  obligations.receivablesReceivedInPeriod)) *
                                100
                            )
                          )
                        : 0
                    }
                    sx={{ height: 8, borderRadius: 1 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Vencidas: {fCurrency(obligations.receivablesOverdue)} • Recebido no período:{' '}
                    {fCurrency(obligations.receivablesReceivedInPeriod)}
                  </Typography>
                </Box>

                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="subtitle2">A Pagar em Aberto</Typography>
                    <Typography variant="subtitle2" color="error.main">
                      {fCurrency(obligations.payablesOpen)}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    color="warning"
                    value={
                      obligations.payablesOpen + obligations.payablesPaidInPeriod > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (obligations.payablesPaidInPeriod /
                                (obligations.payablesOpen + obligations.payablesPaidInPeriod)) *
                                100
                            )
                          )
                        : 0
                    }
                    sx={{ height: 8, borderRadius: 1 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Vencidas: {fCurrency(obligations.payablesOverdue)} • Pago no período:{' '}
                    {fCurrency(obligations.payablesPaidInPeriod)}
                  </Typography>
                </Box>
              </Stack>
            </Card>
          </Grid>

          <Grid xs={12} lg={7}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <CardHeader
                title="Funil de Pedidos Online (Catálogo Digital)"
                subheader={`Taxa de aceite/conversão: ${fPercent(funnel.conversionRate)} • Valor bruto: ${fCurrency(funnel.totalOnlineOrderValue)}`}
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.pos.onlineOrders}
                    size="small"
                    variant="soft"
                    color="info"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                  >
                    Abrir fila online
                  </Button>
                }
              />
              <Divider sx={{ borderStyle: 'dashed', mt: 2 }} />
              <Box
                display="grid"
                gridTemplateColumns={{ xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' }}
                sx={{ py: 3, px: 1, textAlign: 'center', my: 'auto' }}
              >
                {[
                  { label: 'Pendentes', value: funnel.pending, color: 'warning.main' },
                  { label: 'Em Preparo', value: funnel.preparing, color: 'info.main' },
                  { label: 'Em Entrega', value: funnel.outForDelivery, color: 'primary.main' },
                  { label: 'Entregues', value: funnel.delivered, color: 'success.main' },
                  {
                    label: 'Cancelados',
                    value: funnel.rejectedOrCancelled,
                    color: 'error.main',
                  },
                ].map((step) => (
                  <Box key={step.label} sx={{ px: 1, py: 1 }}>
                    <Typography variant="h4" sx={{ color: step.color }}>
                      {fNumber(step.value)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {step.label}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Card>
          </Grid>

          {/* Faixa 6: Produtos Mais Vendidos + Clientes Identificados */}
          <Grid xs={12} lg={7}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title="Produtos Mais Vendidos"
                subheader="Ranking por receita, quantidade vendida e margem bruta"
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.products.list}
                    size="small"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                  >
                    Ver produtos
                  </Button>
                }
                sx={{ mb: 2 }}
              />
              {topProducts.length === 0 ? (
                <Box sx={{ py: 5 }}>
                  <EmptyContent title="Nenhuma venda de produto no período" />
                </Box>
              ) : (
                <Scrollbar>
                  <Table sx={{ minWidth: 620 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>Produto</TableCell>
                        <TableCell align="right">Qtd. Vendida</TableCell>
                        <TableCell align="right">Receita</TableCell>
                        <TableCell align="right">Lucro Bruto</TableCell>
                        <TableCell align="right">Margem</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {topProducts.map((item, idx) => (
                        <TableRow key={item.productId || item.productSku || idx}>
                          <TableCell>
                            <Label variant="soft" color={RANK_COLORS[Math.min(idx, 3)]}>
                              Top {idx + 1}
                            </Label>
                          </TableCell>
                          <TableCell>
                            <ListItemText
                              primary={item.productName}
                              secondary={item.productSku || '—'}
                              primaryTypographyProps={{ variant: 'subtitle2' }}
                              secondaryTypographyProps={{ variant: 'caption' }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="subtitle2">
                              {fNumber(item.qtySold)} {item.unit}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{fCurrency(item.revenue)}</TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="subtitle2"
                              color={item.profit >= 0 ? 'success.main' : 'error.main'}
                            >
                              {fCurrency(item.profit)}
                            </Typography>
                          </TableCell>
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

          <Grid xs={12} lg={5}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title="Clientes Identificados que Mais Compraram"
                subheader="Exclui vendas anônimas de balcão"
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.customers.list}
                    size="small"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                  >
                    Clientes
                  </Button>
                }
                sx={{ mb: 2 }}
              />
              {topCustomers.length === 0 ? (
                <Box sx={{ py: 5 }}>
                  <EmptyContent title="Nenhum cliente identificado no período" />
                </Box>
              ) : (
                <Scrollbar>
                  <Table sx={{ minWidth: 420 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Cliente</TableCell>
                        <TableCell align="right">Pedidos</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell align="right">Rank</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {topCustomers.map((c, idx) => (
                        <TableRow key={c.key}>
                          <TableCell>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar
                                sx={{
                                  width: 36,
                                  height: 36,
                                  bgcolor: varAlpha(theme.vars.palette.primary.mainChannel, 0.16),
                                  color: 'primary.dark',
                                  [stylesMode.dark]: { color: 'primary.light' },
                                }}
                              >
                                {c.customerName.charAt(0).toUpperCase()}
                              </Avatar>
                              <ListItemText
                                primary={c.customerName}
                                secondary={
                                  c.customerPhone
                                    ? `${c.customerPhone} • Ticket ${fCurrency(c.avgTicket)}`
                                    : `Ticket médio ${fCurrency(c.avgTicket)}`
                                }
                                primaryTypographyProps={{ variant: 'subtitle2' }}
                                secondaryTypographyProps={{ variant: 'caption' }}
                              />
                            </Stack>
                          </TableCell>
                          <TableCell align="right">{c.ordersCount}</TableCell>
                          <TableCell align="right">
                            <Typography variant="subtitle2">{fCurrency(c.totalSpent)}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Label variant="soft" color={RANK_COLORS[Math.min(idx, 3)]}>
                              #{idx + 1}
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

          {/* Faixa 7: Notas Fiscais Geradas (NFC-e) */}
          <Grid xs={12}>
            <ErpNfceOverviewCard sales={filteredSales} fiscal={fiscal} maxRows={8} />
          </Grid>
        </Grid>
      )}
    </DashboardContent>
  );
}

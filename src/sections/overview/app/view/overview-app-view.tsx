import type { Sale } from 'src/api/firestore/sales';
import type { Batch } from 'src/api/firestore/batches';
import type { Payable } from 'src/api/firestore/payables';
import type { Customer } from 'src/api/firestore/customers';
import type { CashSession } from 'src/api/firestore/cash-sessions';

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
import ListItemText from '@mui/material/ListItemText';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency, fNumber } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';
import { listSales } from 'src/api/firestore/sales';
import { listBatches } from 'src/api/firestore/batches';
import { listPayables } from 'src/api/firestore/payables';
import { DashboardContent } from 'src/layouts/dashboard';
import { listCustomers } from 'src/api/firestore/customers';
import { SeoIllustration } from 'src/assets/illustrations';
import { listCashSessions } from 'src/api/firestore/cash-sessions';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { svgColorClasses } from 'src/components/svg-color';
import { EmptyContent } from 'src/components/empty-content';
import { useDateRangePicker } from 'src/components/custom-date-range-picker';
import {
  PeriodFilterBar,
  resolvePeriodBounds,
  isIsoInPeriodBounds,
  type DateFilterPreset,
} from 'src/components/period-filter';

import { buildAccrualDre } from 'src/sections/cash/accrual-dre';
import { calculateDreReport } from 'src/sections/cash/cash-calculator';

import { useAuthContext } from 'src/auth/hooks';

import { AppWidget } from '../app-widget';
import { AppWelcome } from '../app-welcome';
import { AppWidgetSummary } from '../app-widget-summary';
import { AppCurrentDownload } from '../app-current-download';

// ----------------------------------------------------------------------

export function OverviewAppView() {
  const { user } = useAuthContext();
  const theme = useTheme();
  const { t } = useTranslate('common');

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [preset, setPreset] = useState<DateFilterPreset>('30d');
  const rangePicker = useDateRangePicker(dayjs().subtract(29, 'day'), dayjs());

  const [sales, setSales] = useState<Sale[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);

  const loadDashboardData = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      const [salesRows, payableRows, custRows, batchRows, cashRows] = await Promise.all([
        listSales(enterpriseId),
        listPayables(enterpriseId),
        listCustomers(enterpriseId),
        listBatches(enterpriseId),
        listCashSessions(enterpriseId),
      ]);
      setSales(salesRows);
      setPayables(payableRows);
      setCustomers(custRows);
      setBatches(batchRows);
      setCashSessions(cashRows);
    } catch (error) {
      console.error('Dashboard load error:', error);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const bounds = useMemo(
    () => resolvePeriodBounds(preset, rangePicker.startDate, rangePicker.endDate),
    [preset, rangePicker.startDate, rangePicker.endDate]
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

  const dre = useMemo(() => calculateDreReport({ sales: filteredSales }), [filteredSales]);

  const dailyCategories = useMemo(
    () =>
      accrual.dailySeries.length
        ? accrual.dailySeries.map((d) => d.date.slice(5))
        : ['—'],
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

  const expenseChartSeries = useMemo(() => {
    const entries = accrual.expenseLines.map((line) => ({
      label: t(`finance.categories.${line.category}`, { defaultValue: line.category }),
      value: line.amount,
    }));
    return entries.length > 0
      ? entries
      : [{ label: t('dre.operatingExpenses', { defaultValue: 'Sem despesas' }), value: 1 }];
  }, [accrual.expenseLines, t]);

  const expensesPctOfRevenue =
    accrual.netRevenue > 0
      ? Math.round((accrual.operatingExpenses / accrual.netRevenue) * 1000) / 10
      : 0;

  const totalCustomerDebt = useMemo(
    () =>
      customers
        .filter((c) => c.active && c.currentDebt > 0)
        .reduce((acc, c) => acc + c.currentDebt, 0),
    [customers]
  );

  const customersWithDebt = useMemo(
    () =>
      customers
        .filter((c) => c.active && c.currentDebt > 0)
        .sort((a, b) => b.currentDebt - a.currentDebt)
        .slice(0, 6),
    [customers]
  );

  const availableBatches = useMemo(
    () => batches.filter((b) => b.active && b.remainingQty > 0),
    [batches]
  );

  const openSession = useMemo(
    () => cashSessions.find((s) => s.status === 'open') || null,
    [cashSessions]
  );

  const paymentChartSeries = useMemo(() => {
    const m = dre.byMethod;
    const entries = [
      { label: 'PIX', value: m.pix },
      { label: 'Dinheiro', value: m.cash },
      { label: 'Crédito', value: m.credit_card },
      { label: 'Débito', value: m.debit_card },
      { label: 'Crediário / Fiado', value: m.credit_tab },
    ].filter((e) => e.value > 0);

    return entries.length > 0 ? entries : [{ label: 'Sem vendas no período', value: 1 }];
  }, [dre.byMethod]);

  return (
    <DashboardContent maxWidth="xl">
      <PeriodFilterBar
        preset={preset}
        onPresetChange={setPreset}
        rangePicker={rangePicker}
        title={t('periodFilter.overviewTitle', {
          defaultValue: 'Filtro de período das vendas e indicadores',
        })}
      />

      <Grid container spacing={3}>
          {/* Welcome Banner with Quick ERP CTAs */}
          <Grid xs={12} md={8}>
            <AppWelcome
              title={`Olá, ${user?.displayName || user?.email || 'Gestor'} 👋`}
              description={
                enterpriseId
                  ? `Empresa ativa: ${enterpriseId} • ${
                      openSession
                        ? `Caixa Aberto (${openSession.code})`
                        : 'Caixa fechado no momento'
                    }`
                  : 'Painel Administrativo SaaS Multi-Empresa'
              }
              img={<SeoIllustration hideBackground />}
              action={
                <Stack direction="row" spacing={1.5} flexWrap="wrap">
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
                    startIcon={<Iconify icon="solar:Refresh-circle-bold" />}
                  >
                    Novo Beneficiamento
                  </Button>
                </Stack>
              }
            />
          </Grid>

          {/* Right Summary Widget: Cash Status + Customer Receivables */}
          <Grid xs={12} md={4}>
            <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column', height: 1 }}>
              <AppWidget
                title="Contas a Receber (Fiado / Débitos Clientes)"
                total={totalCustomerDebt}
                icon="solar:wallet-money-bold"
                chart={{
                  series: customers.length
                    ? Math.min(100, Math.round((customersWithDebt.length / customers.length) * 100))
                    : 0,
                }}
              />

              <AppWidget
                title="Lotes Ativos com Saldo (FIFO)"
                total={availableBatches.length}
                icon="solar:box-minimalistic-bold"
                chart={{
                  series: batches.length
                    ? Math.min(100, Math.round((availableBatches.length / batches.length) * 100))
                    : 100,
                  colors: [theme.vars.palette.info.light, theme.vars.palette.info.main],
                }}
                sx={{
                  bgcolor: 'info.dark',
                  [`& .${svgColorClasses.root}`]: { color: 'info.light' },
                }}
              />
            </Box>
          </Grid>

          {/* Top 3 KPI Summary Cards — accrual */}
          <Grid xs={12} md={4}>
            <AppWidgetSummary
              title={t('overviewKpi.kpiNetRevenue', {
                defaultValue: 'Receita líquida no período',
              })}
              percent={accrual.grossMarginPercent}
              total={accrual.netRevenue}
              chart={{
                categories: dailyCategories,
                series: revenueSeries,
              }}
            />
          </Grid>

          <Grid xs={12} md={4}>
            <AppWidgetSummary
              title={t('overviewKpi.kpiExpenses', {
                defaultValue: 'Despesas operacionais',
              })}
              percent={expensesPctOfRevenue}
              total={accrual.operatingExpenses}
              chart={{
                colors: [theme.vars.palette.warning.main],
                categories: dailyCategories,
                series: expenseSeries,
              }}
            />
          </Grid>

          <Grid xs={12} md={4}>
            <AppWidgetSummary
              title={t('overviewKpi.kpiNetProfit', { defaultValue: 'Lucro líquido' })}
              percent={accrual.netMarginPercent}
              total={accrual.netProfit}
              chart={{
                colors: [theme.vars.palette.info.main],
                categories: dailyCategories,
                series: netProfitSeries,
              }}
            />
          </Grid>

          <Grid xs={12} md={6} lg={4}>
            <AppCurrentDownload
              title={t('overviewKpi.chartExpensesByCategory', {
                defaultValue: 'Despesas por categoria',
              })}
              subheader={t('dre.accrualSubtitle', {
                defaultValue: 'Contas a pagar por competência',
              })}
              chart={{
                series: expenseChartSeries,
              }}
            />
          </Grid>

          {/* Donut Chart: Sales by Payment Method */}
          <Grid xs={12} md={6} lg={4}>
            <AppCurrentDownload
              title="Vendas por Forma de Pagamento"
              subheader="Distribuição financeira no período selecionado"
              chart={{
                series: paymentChartSeries,
              }}
            />
          </Grid>

          {/* Recent Sales & Lot Traceability Table */}
          <Grid xs={12} md={6} lg={8}>
            <Card sx={{ height: 1 }}>
              <CardHeader
                title="Vendas Realizadas no Período (PDV)"
                subheader={`${accrual.salesCount} vendas concluídas • CMV: ${fCurrency(accrual.cogs)} • Lucro líq.: ${fCurrency(accrual.netProfit)}`}
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.pos.sales}
                    size="small"
                    color="inherit"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={18} />}
                  >
                    Ver todas
                  </Button>
                }
                sx={{ mb: 3 }}
              />
              <Divider />
              {!filteredSales.length ? (
                <EmptyContent title="Nenhuma venda registrada no período selecionado" sx={{ py: 6 }} />
              ) : (
                <Scrollbar>
                  <Table size="small" sx={{ minWidth: 640 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Código</TableCell>
                        <TableCell>Cliente</TableCell>
                        <TableCell>Lotes (FIFO)</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell align="right">Lucro Bruto</TableCell>
                        <TableCell>Data</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredSales.slice(0, 6).map((sale) => (
                        <TableRow key={sale.id} hover>
                          <TableCell>
                            <Button
                              component={RouterLink}
                              href={paths.dashboard.pos.saleDetails(sale.id)}
                              size="small"
                              color="primary"
                            >
                              {sale.code}
                            </Button>
                          </TableCell>
                          <TableCell>{sale.customerName || 'Consumidor Final'}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', typography: 'caption' }}>
                            {sale.items
                              .map((i) => i.lotCode)
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {fCurrency(sale.total)}
                          </TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>
                            {fCurrency(sale.grossProfit)}
                          </TableCell>
                          <TableCell sx={{ typography: 'caption', color: 'text.secondary' }}>
                            {fDateTime(sale.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Scrollbar>
              )}
            </Card>
          </Grid>

          {/* Bottom Left: Customers with Open Debt */}
          <Grid xs={12} md={6}>
            <Card>
              <CardHeader
                title="Clientes com Débito em Aberto (Crediário / Fiado)"
                subheader={`Total a receber: ${fCurrency(totalCustomerDebt)}`}
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.customers.list}
                    size="small"
                    color="inherit"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={18} />}
                  >
                    Gerenciar clientes
                  </Button>
                }
                sx={{ mb: 3 }}
              />
              <Divider />
              {!customersWithDebt.length ? (
                <EmptyContent title="Nenhum cliente com débito pendente" sx={{ py: 5 }} />
              ) : (
                <Stack spacing={2} sx={{ p: 3 }}>
                  {customersWithDebt.map((cust) => (
                    <Stack key={cust.id} direction="row" alignItems="center" spacing={2}>
                      <Avatar sx={{ bgcolor: 'error.lighter', color: 'error.darker' }}>
                        {cust.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <ListItemText
                        primary={cust.name}
                        secondary={[cust.phone, cust.email, cust.document]
                          .filter(Boolean)
                          .join(' • ')}
                        primaryTypographyProps={{ typography: 'subtitle2' }}
                        secondaryTypographyProps={{ typography: 'caption' }}
                      />
                      <Label color="error" variant="soft">
                        {fCurrency(cust.currentDebt)}
                      </Label>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Card>
          </Grid>

          {/* Bottom Right: Active FIFO Batches & Stock */}
          <Grid xs={12} md={6}>
            <Card>
              <CardHeader
                title="Lotes Rastreáveis Disponíveis (Ordem FIFO)"
                subheader="Próximos lotes a serem consumidos no PDV e Beneficiamento"
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.batches.list}
                    size="small"
                    color="inherit"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={18} />}
                  >
                    Ver estoque
                  </Button>
                }
                sx={{ mb: 3 }}
              />
              <Divider />
              {!availableBatches.length ? (
                <EmptyContent title="Nenhum lote ativo com saldo" sx={{ py: 5 }} />
              ) : (
                <Stack spacing={2} sx={{ p: 3 }}>
                  {availableBatches.slice(0, 6).map((batch) => (
                    <Stack key={batch.id} direction="row" alignItems="center" spacing={2}>
                      <Avatar
                        variant="rounded"
                        sx={{ bgcolor: 'background.neutral', color: 'text.primary' }}
                      >
                        <Iconify icon="solar:box-bold" width={22} />
                      </Avatar>
                      <ListItemText
                        primary={`${batch.productName} — ${batch.lotCode}`}
                        secondary={`CMV: ${fCurrency(batch.unitCost)} / ${batch.unit} • Origem: ${
                          batch.processingOrderCode || batch.supplierName || 'Entrada direta'
                        }`}
                        primaryTypographyProps={{ typography: 'subtitle2' }}
                        secondaryTypographyProps={{ typography: 'caption' }}
                      />
                      <Label color="info" variant="soft">
                        {fNumber(batch.remainingQty)} {batch.unit}
                      </Label>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Card>
          </Grid>
        </Grid>
    </DashboardContent>
  );
}

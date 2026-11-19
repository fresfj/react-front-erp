import type { Sale } from 'src/api/firestore/sales';
import type { Batch } from 'src/api/firestore/batches';
import type { Product } from 'src/api/firestore/products';
import type { ProcessingOrder } from 'src/api/firestore/processing-orders';

import dayjs from 'dayjs';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
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

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fPercent, fCurrency } from 'src/utils/format-number';

import { listSales } from 'src/api/firestore/sales';
import { listBatches } from 'src/api/firestore/batches';
import { DashboardContent } from 'src/layouts/dashboard';
import { listProducts } from 'src/api/firestore/products';
import { listProcessingOrders } from 'src/api/firestore/processing-orders';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { Chart, useChart, ChartLegends } from 'src/components/chart';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { useDateRangePicker } from 'src/components/custom-date-range-picker';
import {
  PeriodFilterBar,
  resolvePeriodBounds,
  isIsoInPeriodBounds,
  type DateFilterPreset,
} from 'src/components/period-filter';

import { AppCurrentDownload } from 'src/sections/overview/app/app-current-download';
import { AnalyticsConversionRates } from 'src/sections/overview/analytics/analytics-conversion-rates';

import { useAuthContext } from 'src/auth/hooks';

import { ErpKpiCard } from '../components/erp-kpi-card';
import { ErpDashboardSkeleton } from '../components/erp-dashboard-skeleton';
import {
  calcGrowthPercent,
  computeInventoryAlerts,
  computeProductionMetrics,
  resolvePreviousPeriodBounds,
} from '../erp-analytics';

// ----------------------------------------------------------------------

export function OverviewProductionView() {
  const { user } = useAuthContext();
  const theme = useTheme();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<DateFilterPreset>('30d');
  const rangePicker = useDateRangePicker(dayjs().subtract(29, 'day'), dayjs());

  const [orders, setOrders] = useState<ProcessingOrder[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const loadData = useCallback(async () => {
    if (!enterpriseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [orderRows, saleRows, batchRows, productRows] = await Promise.all([
        listProcessingOrders(enterpriseId),
        listSales(enterpriseId),
        listBatches(enterpriseId),
        listProducts(enterpriseId),
      ]);
      setOrders(orderRows);
      setSales(saleRows);
      setBatches(batchRows);
      setProducts(productRows);
    } catch (error) {
      console.error('Production dashboard load error:', error);
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

  const prod = useMemo(
    () => computeProductionMetrics({ orders, sales, batches, bounds }),
    [batches, bounds, orders, sales]
  );

  const prevProd = useMemo(
    () =>
      prevBounds ? computeProductionMetrics({ orders, sales, batches, bounds: prevBounds }) : null,
    [batches, orders, prevBounds, sales]
  );

  const alerts = useMemo(
    () => computeInventoryAlerts({ products, batches }),
    [batches, products]
  );

  const filteredOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'completed' && isIsoInPeriodBounds(o.createdAt, bounds))
        .slice(0, 8),
    [bounds, orders]
  );

  // Main KPI value: prioritize Liters if any liter production exists, otherwise totalOutputQty
  const mainOutputValue = prod.litersProduced > 0 ? prod.litersProduced : prod.totalOutputQty;
  const prevMainOutputValue = prevProd
    ? prevProd.litersProduced > 0
      ? prevProd.litersProduced
      : prevProd.totalOutputQty
    : null;

  const outputGrowth =
    prevMainOutputValue !== null ? calcGrowthPercent(mainOutputValue, prevMainOutputValue) : null;
  const rawGrowth = prevProd ? calcGrowthPercent(prod.rawQtyUsed, prevProd.rawQtyUsed) : null;
  const yieldGrowth = prevProd
    ? calcGrowthPercent(prod.avgYieldRatio, prevProd.avgYieldRatio)
    : null;
  const unitCostGrowth = prevProd
    ? calcGrowthPercent(prod.avgUnitCost, prevProd.avgUnitCost)
    : null;

  // Sparkline & Daily series
  const dailyCats = useMemo(
    () => (prod.dailySeries.length ? prod.dailySeries.map((d) => d.date.slice(5)) : ['—']),
    [prod.dailySeries]
  );

  const outputSeries = useMemo(
    () =>
      prod.dailySeries.length
        ? prod.dailySeries.map((d) =>
            prod.litersProduced > 0 ? d.litersProduced : d.totalOutputQty
          )
        : [0],
    [prod.dailySeries, prod.litersProduced]
  );

  const rawSeries = useMemo(
    () => (prod.dailySeries.length ? prod.dailySeries.map((d) => d.rawQtyUsed) : [0]),
    [prod.dailySeries]
  );

  const costSeries = useMemo(
    () => (prod.dailySeries.length ? prod.dailySeries.map((d) => Math.round(d.totalCost)) : [0]),
    [prod.dailySeries]
  );

  const dailyChartOptions = useChart({
    colors: [theme.palette.primary.main, theme.palette.warning.main],
    xaxis: { categories: dailyCats },
    tooltip: {
      shared: true,
      intersect: false,
      y: {
        formatter: (value: number, { seriesIndex }: { seriesIndex: number }) =>
          seriesIndex === 0
            ? `${fNumber(value)} ${prod.primaryOutputUnit}`
            : `${fNumber(value)} ${prod.primaryRawUnit}`,
      },
    },
  });

  // Mix by finished product (Donut)
  const productMixSeries = useMemo(() => {
    const items = prod.byProduct.slice(0, 6).map((p) => ({
      label: `${p.productName} (${p.unit})`,
      value: p.producedQty,
    }));
    return items.length ? items : [{ label: 'Sem produção no período', value: 1 }];
  }, [prod.byProduct]);

  // Produced vs Sold Horizontal Bar Chart
  const producedVsSoldChart = useMemo(() => {
    const top = prod.byProduct.slice(0, 6);
    if (!top.length) {
      return {
        categories: ['Sem dados'],
        series: [
          { name: 'Produzido', data: [0] },
          { name: 'Vendido', data: [0] },
        ],
      };
    }
    return {
      categories: top.map((p) => `${p.productName} (${p.unit})`),
      series: [
        { name: 'Produzido', data: top.map((p) => p.producedQty) },
        { name: 'Vendido', data: top.map((p) => p.soldQty) },
      ],
    };
  }, [prod.byProduct]);

  const rawCostPct =
    prod.totalProductionCost > 0
      ? Math.round((prod.rawTotalCost / prod.totalProductionCost) * 100)
      : 0;
  const extraCostPct =
    prod.totalProductionCost > 0
      ? Math.round((prod.extraTotalCost / prod.totalProductionCost) * 100)
      : 0;

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading="Produção & Beneficiamento"
        links={[
          { name: 'Visão Geral', href: paths.dashboard.root },
          { name: 'Produção & Beneficiamento' },
        ]}
        action={
          <Stack direction="row" spacing={1}>
            <Button
              component={RouterLink}
              href={paths.dashboard.batches.list}
              variant="soft"
              color="info"
              startIcon={<Iconify icon="solar:box-minimalistic-bold" />}
            >
              Lotes FIFO
            </Button>
            <Button
              component={RouterLink}
              href={paths.dashboard.processing.create}
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
            >
              Novo Beneficiamento
            </Button>
          </Stack>
        }
        sx={{ mb: 3 }}
      />

      <PeriodFilterBar
        preset={preset}
        onPresetChange={setPreset}
        rangePicker={rangePicker}
        title="Filtro de período — Beneficiamento, Litros Processados, Rendimento e Estoque"
      />

      {loading ? (
        <ErpDashboardSkeleton />
      ) : (
        <Grid container spacing={3}>
          {/* Faixa 1: 4 KPIs de Produção */}
          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title={prod.litersProduced > 0 ? 'Litros Processados' : 'Volume Produzido'}
              value={`${fNumber(mainOutputValue)} ${prod.primaryOutputUnit}`}
              percent={outputGrowth}
              subtitle={`Vendido no período: ${fNumber(prod.litersSoldInPeriod)} L`}
              chart={{
                colors: [theme.palette.primary.light, theme.palette.primary.main],
                categories: dailyCats,
                series: outputSeries,
              }}
            />
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title="Matéria-Prima Consumida"
              value={`${fNumber(prod.rawQtyUsed)} ${prod.primaryRawUnit}`}
              percent={rawGrowth}
              subtitle={`${prod.ordersCount} ordem(ns) de beneficiamento`}
              chartType="bar"
              chart={{
                colors: [theme.palette.warning.light, theme.palette.warning.main],
                categories: dailyCats,
                series: rawSeries,
              }}
            />
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title="Rendimento Médio"
              value={`${fNumber(prod.avgYieldRatio)} ${prod.primaryOutputUnit}/${prod.primaryRawUnit}`}
              percent={yieldGrowth}
              subtitle="Conversão insumo → produto acabado"
              chart={{
                colors: [theme.palette.success.light, theme.palette.success.main],
                categories: dailyCats,
                series: outputSeries,
              }}
            />
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <ErpKpiCard
              title={`Custo Médio (CMV/${prod.primaryOutputUnit})`}
              value={fCurrency(prod.avgUnitCost)}
              percent={unitCostGrowth}
              subtitle={`Custo total: ${fCurrency(prod.totalProductionCost)}`}
              chart={{
                colors: [theme.palette.info.light, theme.palette.info.main],
                categories: dailyCats,
                series: costSeries,
              }}
            />
          </Grid>

          {/* Faixa 2: Produção Diária + Mix de Produtos Acabados */}
          <Grid xs={12} lg={8}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title="Produção Diária — Volume Beneficiado × Matéria-Prima"
                subheader="Acompanhamento diário da entrada de insumo e saída de produto acabado"
                sx={{ mb: 2 }}
              />

              <ChartLegends
                colors={dailyChartOptions?.colors}
                labels={[
                  `Produzido (${prod.primaryOutputUnit})`,
                  `Matéria-Prima (${prod.primaryRawUnit})`,
                ]}
                values={[
                  `${fNumber(mainOutputValue)} ${prod.primaryOutputUnit}`,
                  `${fNumber(prod.rawQtyUsed)} ${prod.primaryRawUnit}`,
                ]}
                sx={{ px: 3, gap: 3 }}
              />

              <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
                <Chart
                  type={prod.dailySeries.length < 2 ? 'bar' : 'area'}
                  series={[
                    { name: `Produzido (${prod.primaryOutputUnit})`, data: outputSeries },
                    { name: `Matéria-Prima (${prod.primaryRawUnit})`, data: rawSeries },
                  ]}
                  options={dailyChartOptions}
                  height={320}
                  sx={{ width: 1, py: 2.5, pl: 1, pr: 2.5 }}
                />
              </Box>
            </Card>
          </Grid>

          <Grid xs={12} lg={4}>
            <AppCurrentDownload
              title="Mix de Produção"
              subheader="Distribuição por produto acabado"
              chart={{ series: productMixSeries }}
              sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            />
          </Grid>

          {/* Faixa 3: Produzido vs Vendido + Composição de Custos & Estoque Valorizado */}
          <Grid xs={12} lg={6}>
            <AnalyticsConversionRates
              title="Produzido × Vendido por Produto"
              subheader="Compare o volume beneficiado com a demanda real no período"
              chart={{
                colors: [theme.palette.primary.main, theme.palette.info.main],
                categories: producedVsSoldChart.categories,
                series: producedVsSoldChart.series,
              }}
              sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            />
          </Grid>

          <Grid xs={12} lg={6}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <CardHeader
                title="Composição de Custos & Estoque Valorizado"
                subheader="Rateio do beneficiamento e capital imobilizado em lotes FIFO"
              />
              <Stack spacing={3} sx={{ p: 3 }}>
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="subtitle2">Custo de Matéria-Prima</Typography>
                    <Typography variant="subtitle2">
                      {fCurrency(prod.rawTotalCost)} ({fPercent(rawCostPct)})
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    color="primary"
                    value={rawCostPct}
                    sx={{ height: 8, borderRadius: 1 }}
                  />
                </Box>

                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="subtitle2">
                      Custos Extras (Energia, Água, Embalagem, Mão de Obra)
                    </Typography>
                    <Typography variant="subtitle2">
                      {fCurrency(prod.extraTotalCost)} ({fPercent(extraCostPct)})
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    color="warning"
                    value={extraCostPct}
                    sx={{ height: 8, borderRadius: 1 }}
                  />
                </Box>

                <Divider sx={{ borderStyle: 'dashed' }} />

                <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" gap={2}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 1.5,
                      bgcolor: 'background.neutral',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Estoque Matéria-Prima (FIFO)
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 0.5 }}>
                      {fCurrency(alerts.rawStockValue)}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 1.5,
                      bgcolor: 'background.neutral',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Estoque Produto Acabado (FIFO)
                    </Typography>
                    <Typography variant="h4" color="primary.main" sx={{ mt: 0.5 }}>
                      {fCurrency(alerts.finishedStockValue)}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </Card>
          </Grid>

          {/* Faixa 4: Ordens de Beneficiamento Recentes + Alertas de Estoque & Validade */}
          <Grid xs={12} lg={7}>
            <Card sx={{ height: 1, display: 'flex', flexDirection: 'column' }}>
              <CardHeader
                title="Ordens de Beneficiamento no Período"
                subheader="Últimas produções com consumo, saída e custo rateado"
                action={
                  <Button
                    component={RouterLink}
                    href={paths.dashboard.processing.list}
                    size="small"
                    endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
                  >
                    Ver todas
                  </Button>
                }
                sx={{ mb: 2 }}
              />
              {filteredOrders.length === 0 ? (
                <Box sx={{ py: 5 }}>
                  <EmptyContent title="Nenhuma ordem de beneficiamento no período" />
                </Box>
              ) : (
                <Scrollbar>
                  <Table sx={{ minWidth: 600 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Ordem</TableCell>
                        <TableCell>Matéria-Prima</TableCell>
                        <TableCell align="right">Consumido</TableCell>
                        <TableCell align="right">Produzido</TableCell>
                        <TableCell align="right">Custo Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredOrders.map((order) => (
                        <TableRow
                          key={order.id}
                          hover
                          component={RouterLink}
                          href={paths.dashboard.processing.details(order.id)}
                          sx={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <TableCell>
                            <ListItemText
                              primary={order.code}
                              secondary={order.createdAt ? fDateTime(order.createdAt) : '—'}
                              primaryTypographyProps={{ variant: 'subtitle2' }}
                              secondaryTypographyProps={{ variant: 'caption' }}
                            />
                          </TableCell>
                          <TableCell>{order.rawProductName}</TableCell>
                          <TableCell align="right">
                            {fNumber(order.rawQtyUsed)} {order.rawUnit}
                          </TableCell>
                          <TableCell align="right">
                            <Label color="primary" variant="soft">
                              {fNumber(order.totalOutputQty)}{' '}
                              {order.outputs[0]?.unit || prod.primaryOutputUnit}
                            </Label>
                          </TableCell>
                          <TableCell align="right">{fCurrency(order.totalCost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Scrollbar>
              )}
            </Card>
          </Grid>

          <Grid xs={12} lg={5}>
            <Stack spacing={3} sx={{ height: 1 }}>
              <Card sx={{ flexGrow: 1 }}>
                <CardHeader
                  title="Lotes Próximos do Vencimento (≤ 7 dias)"
                  subheader={`${alerts.expiringBatches.length} lote(s) requerem atenção`}
                />
                <Box sx={{ p: 3, pt: 1 }}>
                  {alerts.expiringBatches.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Nenhum lote próximo do vencimento.
                    </Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {alerts.expiringBatches.slice(0, 5).map((b) => (
                        <Stack
                          key={b.batchId}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ p: 1.25, borderRadius: 1, bgcolor: 'background.neutral' }}
                        >
                          <ListItemText
                            primary={`${b.productName} (${b.lotCode})`}
                            secondary={`Saldo: ${fNumber(b.remainingQty)} ${b.unit}`}
                            primaryTypographyProps={{ variant: 'subtitle2' }}
                            secondaryTypographyProps={{ variant: 'caption' }}
                          />
                          <Label
                            color={b.daysUntilExpiry <= 0 ? 'error' : 'warning'}
                            variant="soft"
                          >
                            {b.daysUntilExpiry <= 0
                              ? 'Vencido'
                              : `${b.daysUntilExpiry}d`}
                          </Label>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Card>

              <Card>
                <CardHeader
                  title="Produtos Abaixo do Estoque Mínimo"
                  subheader={`${alerts.lowStock.length} item(ns) para reposição ou produção`}
                />
                <Box sx={{ p: 3, pt: 1 }}>
                  {alerts.lowStock.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Todos os produtos estão acima do estoque mínimo configurado.
                    </Typography>
                  ) : (
                    <Stack spacing={2}>
                      {alerts.lowStock.slice(0, 5).map((item) => (
                        <Box key={item.productId}>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                            <Typography variant="subtitle2">{item.productName}</Typography>
                            <Typography variant="caption" color="error.main">
                              {fNumber(item.currentStock)} / {fNumber(item.minStock)} {item.unit}
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            color={item.percentOfMin < 40 ? 'error' : 'warning'}
                            value={item.percentOfMin}
                            sx={{ height: 6, borderRadius: 1 }}
                          />
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      )}
    </DashboardContent>
  );
}

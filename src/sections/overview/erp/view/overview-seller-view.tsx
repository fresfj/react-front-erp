import type { Sale } from 'src/api/firestore/sales';
import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { useMemo, useState, useEffect, useCallback } from 'react';

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

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listSales } from 'src/api/firestore/sales';
import { DashboardContent } from 'src/layouts/dashboard';
import { SeoIllustration } from 'src/assets/illustrations';
import { listOnlineOrders } from 'src/api/firestore/online-orders';
import { getEffectivePermissions } from 'src/api/firestore/members';
import { getOpenCashSession } from 'src/api/firestore/cash-sessions';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';

import { AppWelcome } from 'src/sections/overview/app/app-welcome';
import { ErpKpiCard } from 'src/sections/overview/erp/components/erp-kpi-card';
import { AppCurrentDownload } from 'src/sections/overview/app/app-current-download';
import { ErpDashboardSkeleton } from 'src/sections/overview/erp/components/erp-dashboard-skeleton';
import { BankingBalanceStatistics } from 'src/sections/overview/banking/banking-balance-statistics';

import { useAuthContext } from 'src/auth/hooks';

import { summarizeSellerDay, getLocalDayBoundsIso } from '../seller-day-stats';

// ----------------------------------------------------------------------

function buildHourlySeries(sales: Sale[]): { categories: string[]; series: number[] } {
  const buckets = Array.from({ length: 12 }, () => 0);
  const labels = ['0-2', '2-4', '4-6', '6-8', '8-10', '10-12', '12-14', '14-16', '16-18', '18-20', '20-22', '22-24'];
  sales.forEach((sale) => {
    const hour = new Date(sale.createdAt).getHours();
    const idx = Math.min(11, Math.floor(hour / 2));
    buckets[idx] += Number(sale.total) || 0;
  });
  return { categories: labels, series: buckets.map((v) => Math.round(v)) };
}

// ----------------------------------------------------------------------

export function OverviewSellerView() {
  const theme = useTheme();
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const enterpriseId =
    typeof user?.enterpriseId === 'string' && user.enterpriseId ? user.enterpriseId : undefined;

  const perms = useMemo(
    () => getEffectivePermissions(user?.role, user?.permissions as string[] | undefined),
    [user?.permissions, user?.role]
  );
  const canCash = perms.has('cash_close');

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [cashOpen, setCashOpen] = useState(false);

  const load = useCallback(async () => {
    if (!enterpriseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [salesRows, orderRows, openCash] = await Promise.all([
        listSales(enterpriseId),
        listOnlineOrders(enterpriseId),
        canCash ? getOpenCashSession(enterpriseId) : Promise.resolve(null),
      ]);
      setSales(salesRows);
      setOrders(orderRows);
      setCashOpen(Boolean(openCash));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar o dia do vendedor'));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, canCash]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const { startIso, endIso } = getLocalDayBoundsIso();
    return summarizeSellerDay({
      sales,
      onlineOrders: orders,
      dayStartIso: startIso,
      dayEndIso: endIso,
    });
  }, [sales, orders]);

  const hourly = useMemo(() => buildHourlySeries(summary.todaySales), [summary.todaySales]);

  const channelDonut = useMemo(() => {
    const posRev = summary.todaySales
      .filter((s) => s.channel !== 'online')
      .reduce((acc, s) => acc + (s.total || 0), 0);
    const onlineRev = summary.todaySales
      .filter((s) => s.channel === 'online')
      .reduce((acc, s) => acc + (s.total || 0), 0);
    const entries = [
      { label: t('sellerHome.channelPos'), value: Math.round(posRev) || 0 },
      { label: t('sellerHome.channelOnline'), value: Math.round(onlineRev) || 0 },
    ].filter((e) => e.value > 0);
    return entries.length ? entries : [{ label: t('sellerHome.channelEmpty'), value: 1 }];
  }, [summary.todaySales, t]);

  const displayName =
    (user as { displayName?: string } | null)?.displayName ||
    user?.email?.split('@')[0] ||
    'Vendedor';

  if (!enterpriseId) {
    return (
      <DashboardContent maxWidth="xl">
        <EmptyContent filled title={t('sellerHome.noEnterprise')} sx={{ py: 10 }} />
      </DashboardContent>
    );
  }

  if (loading) {
    return (
      <DashboardContent maxWidth="xl">
        <ErpDashboardSkeleton />
      </DashboardContent>
    );
  }

  return (
    <DashboardContent maxWidth="xl">
      <Grid container spacing={3}>
        <Grid xs={12} md={8}>
          <AppWelcome
            title={`${t('sellerHome.title')} 👋\n${displayName}`}
            description={t('sellerHome.salesTodaySecondary', { count: summary.salesCount })}
            img={<SeoIllustration hideBackground />}
            action={
              <Button
                component={RouterLink}
                href={paths.dashboard.pos.checkout}
                variant="contained"
                color="primary"
                startIcon={<Iconify icon="solar:shop-bold" />}
              >
                {t('sellerHome.openPos')}
              </Button>
            }
          />
        </Grid>

        <Grid xs={12} md={4}>
          <Card sx={{ p: 3, height: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 2 }}>
              {t('sellerHome.openPos')}
            </Typography>
            <Stack spacing={1.5}>
              <Button
                component={RouterLink}
                href={paths.dashboard.pos.checkout}
                variant="contained"
                size="large"
                fullWidth
                startIcon={<Iconify icon="solar:shop-bold" />}
              >
                {t('nav.posCheckout')}
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.pos.onlineOrders}
                variant="outlined"
                color="inherit"
                size="large"
                fullWidth
                startIcon={<Iconify icon="solar:bell-bing-bold" />}
              >
                {t('sellerHome.onlineOrders')}
                {summary.pendingOnlineCount > 0 ? ` (${summary.pendingOnlineCount})` : ''}
              </Button>
              <Button
                component={RouterLink}
                href={paths.dashboard.pos.sales}
                variant="soft"
                color="inherit"
                size="large"
                fullWidth
                startIcon={<Iconify icon="solar:bill-list-bold" />}
              >
                {t('sellerHome.salesHistory')}
              </Button>
            </Stack>
          </Card>
        </Grid>

        <Grid xs={12} md={4}>
          <ErpKpiCard
            title={t('sellerHome.salesToday')}
            value={fCurrency(summary.salesTotal)}
            subtitle={t('sellerHome.salesTodaySecondary', { count: summary.salesCount })}
            percent={summary.salesCount > 0 ? 100 : 0}
            chart={{
              colors: [theme.vars.palette.primary.light, theme.vars.palette.primary.main],
              categories: hourly.categories,
              series: hourly.series,
            }}
          />
        </Grid>

        <Grid xs={12} md={4}>
          <ErpKpiCard
            title={t('sellerHome.pendingOnline')}
            value={fNumber(summary.pendingOnlineCount)}
            subtitle={t('sellerHome.pendingOnlineSecondary')}
            percent={summary.pendingOnlineCount > 0 ? 100 : 0}
            chart={{
              colors: [theme.vars.palette.error.light, theme.vars.palette.error.main],
              categories: hourly.categories,
              series: hourly.series.map((_, i) => (i === hourly.categories.length - 1 ? summary.pendingOnlineCount : 0)),
            }}
          />
        </Grid>

        <Grid xs={12} md={4}>
          <ErpKpiCard
            title={
              canCash
                ? cashOpen
                  ? t('sellerHome.cashOpen')
                  : t('sellerHome.cashClosed')
                : t('sellerHome.inProgressOnline')
            }
            value={
              canCash
                ? cashOpen
                  ? 'OK'
                  : '—'
                : fNumber(summary.inProgressOnlineCount)
            }
            subtitle={
              canCash ? t('sellerHome.cashSecondary') : t('sellerHome.inProgressOnlineSecondary')
            }
            percent={canCash ? (cashOpen ? 100 : 0) : summary.inProgressOnlineCount > 0 ? 100 : 0}
            chart={{
              colors: [theme.vars.palette.warning.light, theme.vars.palette.warning.main],
              categories: hourly.categories,
              series: hourly.series,
            }}
          />
        </Grid>

        <Grid xs={12} md={6} lg={8}>
          <BankingBalanceStatistics
            title={t('sellerHome.salesToday')}
            subheader={t('sellerHome.salesTodaySecondary', { count: summary.salesCount })}
            chart={{
              colors: [theme.vars.palette.primary.dark],
              series: [
                {
                  name: t('sellerHome.breadcrumb'),
                  categories: hourly.categories,
                  data: [
                    {
                      name: t('sellerHome.saleTotal'),
                      data: hourly.series,
                    },
                  ],
                },
              ],
            }}
          />
        </Grid>

        <Grid xs={12} md={6} lg={4}>
          <AppCurrentDownload
            title={t('sellerHome.channelsToday')}
            chart={{
              series: channelDonut,
            }}
          />
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <CardHeader
              title={t('sellerHome.openOrdersTitle')}
              action={
                <Button
                  component={RouterLink}
                  href={paths.dashboard.pos.onlineOrders}
                  size="small"
                  color="inherit"
                >
                  {t('sellerHome.viewAll')}
                </Button>
              }
            />
            <Divider sx={{ borderStyle: 'dashed' }} />
            {summary.openOnlineOrders.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', p: 3 }}>
                {t('sellerHome.emptyOrders')}
              </Typography>
            ) : (
              <Scrollbar sx={{ minHeight: 280 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Pedido</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.openOnlineOrders.slice(0, 8).map((order) => (
                      <TableRow key={order.id} hover>
                        <TableCell>
                          <ListItemText
                            primary={t('sellerHome.orderCode', { code: order.code })}
                            secondary={`${order.customerName} · ${fDateTime(order.createdAt)}`}
                            primaryTypographyProps={{ typography: 'subtitle2' }}
                            secondaryTypographyProps={{ component: 'span', typography: 'caption' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Label
                            variant="soft"
                            color={order.status === 'pending' ? 'warning' : 'info'}
                          >
                            {order.status}
                          </Label>
                        </TableCell>
                        <TableCell align="right">{fCurrency(order.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Scrollbar>
            )}
          </Card>
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <CardHeader
              title={t('sellerHome.todaySalesTitle')}
              action={
                <Button
                  component={RouterLink}
                  href={paths.dashboard.pos.sales}
                  size="small"
                  color="inherit"
                >
                  {t('sellerHome.viewAll')}
                </Button>
              }
            />
            <Divider sx={{ borderStyle: 'dashed' }} />
            {summary.todaySales.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', p: 3 }}>
                {t('sellerHome.emptySales')}
              </Typography>
            ) : (
              <Scrollbar sx={{ minHeight: 280 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Venda</TableCell>
                      <TableCell>Canal</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.todaySales.slice(0, 8).map((sale) => (
                      <TableRow key={sale.id} hover>
                        <TableCell>
                          <ListItemText
                            primary={sale.customerName || sale.code || sale.id.slice(0, 8)}
                            secondary={fDateTime(sale.createdAt)}
                            primaryTypographyProps={{ typography: 'subtitle2' }}
                            secondaryTypographyProps={{ component: 'span', typography: 'caption' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Label variant="soft" color={sale.channel === 'online' ? 'info' : 'default'}>
                            {sale.channel === 'online' ? 'Online' : 'PDV'}
                          </Label>
                        </TableCell>
                        <TableCell align="right">{fCurrency(sale.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Scrollbar>
            )}
          </Card>
        </Grid>
      </Grid>
    </DashboardContent>
  );
}

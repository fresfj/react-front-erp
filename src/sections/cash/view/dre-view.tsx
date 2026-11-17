import type { Sale } from 'src/api/firestore/sales';
import type { Payable } from 'src/api/firestore/payables';

import dayjs from 'dayjs';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TableRow from '@mui/material/TableRow';
import Grid from '@mui/material/Unstable_Grid2';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fPercent, fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listSales } from 'src/api/firestore/sales';
import { listPayables } from 'src/api/firestore/payables';
import { DashboardContent } from 'src/layouts/dashboard';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { useDateRangePicker } from 'src/components/custom-date-range-picker';
import {
  PeriodFilterBar,
  resolvePeriodBounds,
  isIsoInPeriodBounds,
  type DateFilterPreset,
} from 'src/components/period-filter';

import { useAuthContext } from 'src/auth/hooks';

import { buildAccrualDre } from '../accrual-dre';
import { calculateDreReport } from '../cash-calculator';

// ----------------------------------------------------------------------

export function DreView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [sales, setSales] = useState<Sale[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [preset, setPreset] = useState<DateFilterPreset>('30d');
  const rangePicker = useDateRangePicker(dayjs().subtract(29, 'day'), dayjs());

  const bounds = useMemo(
    () => resolvePeriodBounds(preset, rangePicker.startDate, rangePicker.endDate),
    [preset, rangePicker.startDate, rangePicker.endDate]
  );

  const periodLabel = useMemo(() => {
    if (preset === 'all') {
      return t('periodFilter.all', { defaultValue: 'Todo o período' });
    }
    if (preset === 'custom' && rangePicker.shortLabel) {
      return rangePicker.shortLabel;
    }
    if (bounds.start && bounds.end) {
      return `${bounds.start.format('YYYY-MM-DD')} → ${bounds.end.format('YYYY-MM-DD')}`;
    }
    return '';
  }, [bounds.end, bounds.start, preset, rangePicker.shortLabel, t]);

  const loadData = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      const [salesRows, payableRows] = await Promise.all([
        listSales(enterpriseId),
        listPayables(enterpriseId),
      ]);
      setSales(salesRows);
      setPayables(payableRows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar DRE'));
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const dre = useMemo(
    () => buildAccrualDre({ sales, payables, bounds }),
    [sales, payables, bounds]
  );

  const paymentDre = useMemo(() => {
    const filteredSales = sales.filter((s) => isIsoInPeriodBounds(s.createdAt, bounds));
    return calculateDreReport({ sales: filteredSales });
  }, [sales, bounds]);

  const av = (value: number) =>
    dre.netRevenue > 0 ? fPercent((value / dre.netRevenue) * 100) : '0%';

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading="DRE — Demonstrativo de Resultado do Exercício"
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: 'Caixa', href: paths.dashboard.cash.root },
          { name: 'DRE' },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.cash.root}
            variant="outlined"
            startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
          >
            Voltar para Caixa
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <PeriodFilterBar
        preset={preset}
        onPresetChange={setPreset}
        rangePicker={rangePicker}
        title={t('periodFilter.title', { defaultValue: 'Filtro de período' })}
      />

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {t('overviewKpi.kpiNetRevenue', { defaultValue: 'Receita líquida' })}
            </Typography>
            <Typography variant="h4">{fCurrency(dre.netRevenue)}</Typography>
          </Card>
        </Grid>
        <Grid xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {t('dre.operatingExpenses', { defaultValue: 'Despesas operacionais' })}
            </Typography>
            <Typography variant="h4">{fCurrency(dre.operatingExpenses)}</Typography>
          </Card>
        </Grid>
        <Grid xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {t('dre.netProfit', { defaultValue: 'Lucro líquido' })}
            </Typography>
            <Typography
              variant="h4"
              color={dre.netProfit >= 0 ? 'success.main' : 'error.main'}
            >
              {fCurrency(dre.netProfit)}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid xs={12} md={8}>
          <Card>
            <CardHeader
              title="Demonstrativo de Resultado"
              subheader={`${t('dre.accrualSubtitle', {
                defaultValue: 'Regime de competência (vendas PDV + contas a pagar)',
              })} • ${dre.salesCount} vendas (${periodLabel})`}
              sx={{ mb: 3 }}
            />
            <Divider />
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Conta / Indicador</TableCell>
                  <TableCell align="right">Valor (R$)</TableCell>
                  <TableCell align="right">AV (%)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>(+) Receita Operacional Bruta</TableCell>
                  <TableCell align="right">{fCurrency(dre.grossRevenue)}</TableCell>
                  <TableCell align="right">
                    {dre.grossRevenue > 0 ? '100%' : '0%'}
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell sx={{ color: 'error.main' }}>(-) Descontos Concedidos</TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>
                    - {fCurrency(dre.discounts)}
                  </TableCell>
                  <TableCell align="right">
                    {dre.grossRevenue > 0
                      ? fPercent((dre.discounts / dre.grossRevenue) * 100)
                      : '0%'}
                  </TableCell>
                </TableRow>

                <TableRow sx={{ bgcolor: 'background.neutral' }}>
                  <TableCell sx={{ fontWeight: 700 }}>(=) Receita Operacional Líquida</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {fCurrency(dre.netRevenue)}
                  </TableCell>
                  <TableCell align="right">100%</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell sx={{ color: 'warning.main' }}>
                    (-) CMV — Custo das Mercadorias Vendidas
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'warning.main' }}>
                    - {fCurrency(dre.cogs)}
                  </TableCell>
                  <TableCell align="right">{av(dre.cogs)}</TableCell>
                </TableRow>

                <TableRow sx={{ bgcolor: 'background.neutral' }}>
                  <TableCell sx={{ fontWeight: 700 }}>(=) Lucro Bruto</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>
                    {fCurrency(dre.grossProfit)}
                  </TableCell>
                  <TableCell align="right">
                    <Label color="success" variant="soft">
                      {fPercent(dre.grossMarginPercent)}
                    </Label>
                  </TableCell>
                </TableRow>

                {dre.expenseLines.map((line) => (
                  <TableRow key={line.category}>
                    <TableCell sx={{ color: 'error.main', pl: 4 }}>
                      (-){' '}
                      {t(`finance.categories.${line.category}`, {
                        defaultValue: line.category,
                      })}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>
                      - {fCurrency(line.amount)}
                    </TableCell>
                    <TableCell align="right">{fPercent(line.pctOfRevenue)}</TableCell>
                  </TableRow>
                ))}

                <TableRow>
                  <TableCell sx={{ color: 'error.main', fontWeight: 600 }}>
                    (-) {t('dre.operatingExpenses', { defaultValue: 'Despesas operacionais' })}
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>
                    - {fCurrency(dre.operatingExpenses)}
                  </TableCell>
                  <TableCell align="right">{av(dre.operatingExpenses)}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell sx={{ typography: 'subtitle1' }}>
                    (=) {t('dre.netProfit', { defaultValue: 'Lucro líquido' })}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      typography: 'h6',
                      color: dre.netProfit >= 0 ? 'primary.main' : 'error.main',
                    }}
                  >
                    {fCurrency(dre.netProfit)}
                  </TableCell>
                  <TableCell align="right">
                    <Label color={dre.netProfit >= 0 ? 'primary' : 'error'} variant="soft">
                      {fPercent(dre.netMarginPercent)}
                    </Label>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </Grid>

        <Grid xs={12} md={4}>
          <Card>
            <CardHeader
              title="Recebimentos por Meio de Pagamento"
              subheader="Líquido de troco (PDV)"
              sx={{ mb: 3 }}
            />
            <Divider sx={{ borderStyle: 'dashed' }} />
            <Stack spacing={2} sx={{ p: 3, typography: 'body2' }}>
              {(Object.keys(paymentDre.byMethod) as Array<keyof typeof paymentDre.byMethod>).map(
                (method) => (
                  <Stack key={method} direction="row" justifyContent="space-between">
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {t(`pos.paymentMethods.${method}`, {
                        defaultValue:
                          method === 'credit_tab' ? 'Crediário / Fiado (A Prazo)' : method,
                      })}
                    </Box>
                    <Typography variant="subtitle2">
                      {fCurrency(paymentDre.byMethod[method])}
                    </Typography>
                  </Stack>
                )
              )}
            </Stack>
          </Card>
        </Grid>
      </Grid>
    </DashboardContent>
  );
}

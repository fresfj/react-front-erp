import type { Sale } from 'src/api/firestore/sales';
import type { CashSession } from 'src/api/firestore/cash-sessions';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Unstable_Grid2';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fCurrency, fPercent } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listSales } from 'src/api/firestore/sales';
import { listCashSessions } from 'src/api/firestore/cash-sessions';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import { calculateDreReport } from '../cash-calculator';
import { daysAgoYmd, todayYmd, isTimestampInDateRange } from '../date-range';

// ----------------------------------------------------------------------

export function DreView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [sales, setSales] = useState<Sale[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [startDate, setStartDate] = useState(() => daysAgoYmd(30));
  const [endDate, setEndDate] = useState(() => todayYmd());

  const loadData = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      const [salesRows, sessionRows] = await Promise.all([
        listSales(enterpriseId),
        listCashSessions(enterpriseId),
      ]);
      setSales(salesRows);
      setSessions(sessionRows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar DRE'));
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSales = useMemo(
    () => sales.filter((s) => isTimestampInDateRange(s.createdAt, startDate, endDate)),
    [sales, startDate, endDate]
  );

  const filteredSessions = useMemo(
    () =>
      sessions.filter((s) =>
        isTimestampInDateRange(s.openedAt || s.createdAt, startDate, endDate)
      ),
    [sessions, startDate, endDate]
  );

  const totalWithdrawals = useMemo(
    () =>
      filteredSessions.reduce(
        (acc, sess) =>
          acc +
          sess.movements
            .filter((m) => m.type === 'WITHDRAWAL')
            .reduce((sum, m) => sum + m.amount, 0),
        0
      ),
    [filteredSessions]
  );

  const dre = useMemo(
    () =>
      calculateDreReport({
        sales: filteredSales,
        operatingExpenses: totalWithdrawals,
      }),
    [filteredSales, totalWithdrawals]
  );

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

      <Card sx={{ p: 3, mb: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ sm: 'center' }}
        >
          <TextField
            label={t('finance.dateStart', { defaultValue: 'Data início' })}
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label={t('finance.dateEnd', { defaultValue: 'Data fim' })}
            type="date"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setStartDate(daysAgoYmd(30));
              setEndDate(todayYmd());
            }}
          >
            {t('finance.last30Days', { defaultValue: 'Últimos 30 dias' })}
          </Button>
        </Stack>
      </Card>

      <Grid container spacing={3}>
        <Grid xs={12} md={8}>
          <Card>
            <CardHeader
              title="Demonstrativo de Resultado (Receita × CMV de Lotes × Lucro)"
              subheader={`Baseado em ${dre.salesCount} vendas concluídas (${startDate} → ${endDate})`}
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
                  <TableCell align="right">100%</TableCell>
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
                    (-) CMV — Custo das Mercadorias Vendidas (Rateio dos Lotes)
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'warning.main' }}>
                    - {fCurrency(dre.cogs)}
                  </TableCell>
                  <TableCell align="right">
                    {dre.netRevenue > 0 ? fPercent((dre.cogs / dre.netRevenue) * 100) : '0%'}
                  </TableCell>
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

                <TableRow>
                  <TableCell sx={{ color: 'error.main' }}>
                    (-) Despesas Operacionais / Sangrias de Caixa
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>
                    - {fCurrency(dre.operatingExpenses)}
                  </TableCell>
                  <TableCell align="right">
                    {dre.netRevenue > 0
                      ? fPercent((dre.operatingExpenses / dre.netRevenue) * 100)
                      : '0%'}
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell sx={{ typography: 'subtitle1' }}>
                    (=) Resultado Líquido do Exercício (Lucro / Prejuízo)
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
              subheader="Líquido de troco"
              sx={{ mb: 3 }}
            />
            <Divider sx={{ borderStyle: 'dashed' }} />
            <Stack spacing={2} sx={{ p: 3, typography: 'body2' }}>
              {(Object.keys(dre.byMethod) as Array<keyof typeof dre.byMethod>).map((method) => (
                <Stack key={method} direction="row" justifyContent="space-between">
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {t(`pos.paymentMethods.${method}`, {
                      defaultValue:
                        method === 'credit_tab' ? 'Crediário / Fiado (A Prazo)' : method,
                    })}
                  </Box>
                  <Typography variant="subtitle2">{fCurrency(dre.byMethod[method])}</Typography>
                </Stack>
              ))}
            </Stack>
          </Card>
        </Grid>
      </Grid>
    </DashboardContent>
  );
}

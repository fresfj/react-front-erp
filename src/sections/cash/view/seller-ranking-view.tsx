import type { Sale } from 'src/api/firestore/sales';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import CardHeader from '@mui/material/CardHeader';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fCurrency, fNumber } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { listSales } from 'src/api/firestore/sales';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import { daysAgoYmd, todayYmd, isTimestampInDateRange } from '../date-range';
import { aggregateSellerRanking } from '../seller-ranking';

// ----------------------------------------------------------------------

export function SellerRankingView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [sales, setSales] = useState<Sale[]>([]);
  const [startDate, setStartDate] = useState(() => daysAgoYmd(30));
  const [endDate, setEndDate] = useState(() => todayYmd());

  const loadData = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      setSales(await listSales(enterpriseId));
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar ranking'));
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const ranking = useMemo(() => {
    const filtered = sales.filter((s) =>
      isTimestampInDateRange(s.createdAt, startDate, endDate)
    );
    return aggregateSellerRanking(filtered);
  }, [sales, startDate, endDate]);

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('finance.rankingHeading', { defaultValue: 'Ranking de vendedores' })}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.pos'), href: paths.dashboard.pos.root },
          { name: t('nav.sellerRanking', { defaultValue: 'Ranking' }) },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.pos.sales}
            variant="outlined"
            startIcon={<Iconify icon="eva:arrow-ios-back-fill" />}
          >
            {t('nav.salesHistory')}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <Card sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
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

      <Card>
        <CardHeader
          title={t('finance.rankingTitle', { defaultValue: 'Vendas por colaborador' })}
          subheader={`${startDate} → ${endDate}`}
          sx={{ mb: 2 }}
        />
        <Divider />
        {ranking.length === 0 ? (
          <EmptyContent
            title={t('finance.rankingEmpty', { defaultValue: 'Nenhuma venda no período' })}
            sx={{ py: 8 }}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>{t('finance.seller', { defaultValue: 'Vendedor' })}</TableCell>
                <TableCell align="right">
                  {t('finance.salesCount', { defaultValue: 'Vendas' })}
                </TableCell>
                <TableCell align="right">
                  {t('finance.netTotal', { defaultValue: 'Total líquido' })}
                </TableCell>
                <TableCell align="right">CMV</TableCell>
                <TableCell align="right">
                  {t('finance.grossProfit', { defaultValue: 'Lucro bruto' })}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ranking.map((row, index) => (
                <TableRow key={row.sellerKey} hover>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    {row.sellerEmail || row.sellerUid || row.sellerKey}
                  </TableCell>
                  <TableCell align="right">{fNumber(row.salesCount)}</TableCell>
                  <TableCell align="right">{fCurrency(row.netTotal)}</TableCell>
                  <TableCell align="right">{fCurrency(row.totalCost)}</TableCell>
                  <TableCell align="right">{fCurrency(row.grossProfit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </DashboardContent>
  );
}

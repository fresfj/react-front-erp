import type { Sale } from 'src/api/firestore/sales';

import dayjs from 'dayjs';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import CardHeader from '@mui/material/CardHeader';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fNumber, fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listSales } from 'src/api/firestore/sales';
import { DashboardContent } from 'src/layouts/dashboard';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { useDateRangePicker } from 'src/components/custom-date-range-picker';
import {
  PeriodFilterBar,
  resolvePeriodBounds,
  isIsoInPeriodBounds,
  type DateFilterPreset,
} from 'src/components/period-filter';

import { useAuthContext } from 'src/auth/hooks';

import { aggregateSellerRanking } from '../seller-ranking';

// ----------------------------------------------------------------------

export function SellerRankingView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [sales, setSales] = useState<Sale[]>([]);
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
    const filtered = sales.filter((s) => isIsoInPeriodBounds(s.createdAt, bounds));
    return aggregateSellerRanking(filtered);
  }, [sales, bounds]);

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

      <PeriodFilterBar
        preset={preset}
        onPresetChange={setPreset}
        rangePicker={rangePicker}
        title={t('periodFilter.title', { defaultValue: 'Filtro de período' })}
      />

      <Card>
        <CardHeader
          title={t('finance.rankingTitle', { defaultValue: 'Vendas por colaborador' })}
          subheader={periodLabel}
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

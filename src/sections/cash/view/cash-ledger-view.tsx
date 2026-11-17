import type { CashSession } from 'src/api/firestore/cash-sessions';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import type { CashLedgerLine, CashLedgerLineType } from '../cash-ledger';

import dayjs from 'dayjs';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Unstable_Grid2';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';

import { fCurrency } from 'src/utils/format-number';
import { fDateTime } from 'src/utils/format-time';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { DashboardContent } from 'src/layouts/dashboard';
import { listCashSessions } from 'src/api/firestore/cash-sessions';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { useDateRangePicker } from 'src/components/custom-date-range-picker';
import {
  PeriodFilterBar,
  resolvePeriodBounds,
  type DateFilterPreset,
} from 'src/components/period-filter';

import { useAuthContext } from 'src/auth/hooks';

import { buildCashLedger } from '../cash-ledger';

// ----------------------------------------------------------------------

const TYPE_OPTIONS: { value: CashLedgerLineType; color: 'default' | 'success' | 'error' | 'info' | 'warning' }[] = [
  { value: 'OPENING', color: 'info' },
  { value: 'SUPPLY', color: 'success' },
  { value: 'RECEIPT', color: 'success' },
  { value: 'WITHDRAWAL', color: 'error' },
  { value: 'PAYMENT', color: 'error' },
];

function typeColor(type: CashLedgerLineType) {
  return TYPE_OPTIONS.find((o) => o.value === type)?.color ?? 'default';
}

// ----------------------------------------------------------------------

export function CashLedgerView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [preset, setPreset] = useState<DateFilterPreset>('30d');
  const rangePicker = useDateRangePicker(dayjs().subtract(29, 'day'), dayjs());

  const bounds = useMemo(
    () => resolvePeriodBounds(preset, rangePicker.startDate, rangePicker.endDate),
    [preset, rangePicker.startDate, rangePicker.endDate]
  );

  const loadSessions = useCallback(async () => {
    if (!enterpriseId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listCashSessions(enterpriseId);
      setSessions(rows);
    } catch (error) {
      console.error(error);
      toast.error(
        getFirebaseErrorMessage(
          error,
          t('cashLedger.loadError', { defaultValue: 'Não foi possível carregar o extrato' })
        )
      );
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const ledger = useMemo(() => buildCashLedger(sessions, bounds), [sessions, bounds]);

  const rows = useMemo(() => {
    if (!typeFilter.length) return ledger.lines;
    return ledger.lines.filter((line) => typeFilter.includes(line.type));
  }, [ledger.lines, typeFilter]);

  const typeLabel = useCallback(
    (type: CashLedgerLineType) =>
      t(`cashLedger.type.${type}`, {
        defaultValue:
          type === 'OPENING'
            ? 'Abertura'
            : type === 'SUPPLY'
              ? 'Suprimento'
              : type === 'WITHDRAWAL'
                ? 'Sangria'
                : type === 'RECEIPT'
                  ? 'Recebimento'
                  : 'Pagamento',
      }),
    [t]
  );

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'type',
      label: t('cashLedger.typeFilter', { defaultValue: 'Tipo' }),
      options: TYPE_OPTIONS.map((o) => ({ value: o.value, label: typeLabel(o.value) })),
      value: typeFilter,
      onChange: setTypeFilter,
    },
  ];

  const columns = useMemo<GridColDef<CashLedgerLine>[]>(
    () => [
      {
        field: 'createdAt',
        headerName: t('cashLedger.date', { defaultValue: 'Data' }),
        width: 170,
        hideable: false,
        valueGetter: (_v, r) => r.createdAt,
        renderCell: (params) => fDateTime(params.row.createdAt) || '—',
      },
      {
        field: 'type',
        headerName: t('cashLedger.typeFilter', { defaultValue: 'Tipo' }),
        width: 140,
        renderCell: (params) => (
          <Label variant="soft" color={typeColor(params.row.type)}>
            {typeLabel(params.row.type)}
          </Label>
        ),
      },
      {
        field: 'signedAmount',
        headerName: t('cashLedger.amount', { defaultValue: 'Valor' }),
        width: 130,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params) => {
          const positive = params.row.signedAmount >= 0;
          return (
            <Box
              component="span"
              sx={{ color: positive ? 'success.main' : 'error.main', fontWeight: 600 }}
            >
              {positive ? '+' : '−'} {fCurrency(Math.abs(params.row.signedAmount))}
            </Box>
          );
        },
      },
      {
        field: 'balanceAfter',
        headerName: t('cashLedger.balance', { defaultValue: 'Saldo' }),
        width: 130,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params) => fCurrency(params.row.balanceAfter),
      },
      {
        field: 'reason',
        headerName: t('cashLedger.reason', { defaultValue: 'Motivo' }),
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, r) =>
          r.type === 'OPENING'
            ? t('cashLedger.openingReason', { defaultValue: 'Abertura de caixa' })
            : r.reason || '—',
      },
      {
        field: 'sessionCode',
        headerName: t('cashLedger.session', { defaultValue: 'Sessão' }),
        width: 120,
      },
      {
        field: 'refId',
        headerName: t('cashLedger.ref', { defaultValue: 'Ref.' }),
        width: 140,
        valueGetter: (_v, r) =>
          r.refId ? `${r.refType === 'payable' ? 'AP' : 'AR'}:${r.refId.slice(0, 8)}` : '—',
      },
    ],
    [t, typeLabel]
  );

  const { summary } = ledger;

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('cashLedger.heading', { defaultValue: 'Extrato de caixa' })}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          {
            name: t('nav.cash', { defaultValue: 'Financeiro' }),
            href: paths.dashboard.cash.root,
          },
          { name: t('cashLedger.heading', { defaultValue: 'Extrato de caixa' }) },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <PeriodFilterBar
        preset={preset}
        onPresetChange={setPreset}
        rangePicker={rangePicker}
        title={t('periodFilter.title', { defaultValue: 'Filtro de período' })}
      />

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('cashLedger.periodNote', {
          defaultValue: 'Saldo corrido relativo ao período filtrado (inicia em zero).',
        })}
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('cashLedger.inflow', { defaultValue: 'Entradas' })}
              </Typography>
              <Typography variant="h4" color="success.main">
                {fCurrency(summary.inflow)}
              </Typography>
            </Stack>
          </Card>
        </Grid>
        <Grid xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('cashLedger.outflow', { defaultValue: 'Saídas' })}
              </Typography>
              <Typography variant="h4" color="error.main">
                {fCurrency(summary.outflow)}
              </Typography>
            </Stack>
          </Card>
        </Grid>
        <Grid xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('cashLedger.net', { defaultValue: 'Saldo do período' })}
              </Typography>
              <Typography
                variant="h4"
                color={summary.net >= 0 ? 'text.primary' : 'error.main'}
              >
                {fCurrency(summary.net)}
              </Typography>
            </Stack>
          </Card>
        </Grid>
      </Grid>

      <Card
        sx={{
          height: { xs: 640, md: 720 },
          flexGrow: { md: 1 },
          display: { md: 'flex' },
          flexDirection: { md: 'column' },
        }}
      >
        <ErpDataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.id}
          emptyTitle={t('cashLedger.empty', { defaultValue: 'Nenhum lançamento no período' })}
          toolbar={{ selectFilters }}
          nonTogglableFields={['createdAt']}
        />
      </Card>
    </DashboardContent>
  );
}

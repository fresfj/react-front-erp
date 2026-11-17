import type { Dayjs } from 'dayjs';
import type { GridColDef } from '@mui/x-data-grid';
import type { CashSession } from 'src/api/firestore/cash-sessions';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';

import dayjs from 'dayjs';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { listCashSessions } from 'src/api/firestore/cash-sessions';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { useDateRangePicker } from 'src/components/custom-date-range-picker';
import {
  PeriodFilterBar,
  resolvePeriodBounds,
  type DateFilterPreset,
} from 'src/components/period-filter';

import { useAuthContext } from 'src/auth/hooks';

import { buildCashLedger } from '../cash-ledger';

import type { CashLedgerLine, CashLedgerLineType } from '../cash-ledger';

// ----------------------------------------------------------------------

const TYPE_CONFIG: Record<
  CashLedgerLineType,
  { label: string; color: 'success' | 'error' | 'info' | 'warning'; icon: string }
> = {
  OPENING: {
    label: 'Abertura de Caixa',
    color: 'info',
    icon: 'solar:lock-keyhole-minimalistic-unlocked-bold-duotone',
  },
  SUPPLY: {
    label: 'Suprimento (Entrada)',
    color: 'success',
    icon: 'solar:wallet-money-bold-duotone',
  },
  RECEIPT: {
    label: 'Recebimento / Venda',
    color: 'success',
    icon: 'solar:card-recive-bold-duotone',
  },
  WITHDRAWAL: {
    label: 'Sangria (Retirada)',
    color: 'warning',
    icon: 'solar:hand-money-bold-duotone',
  },
  PAYMENT: {
    label: 'Pagamento de Despesa',
    color: 'error',
    icon: 'solar:card-send-bold-duotone',
  },
};

// ----------------------------------------------------------------------

export function CashLedgerView() {
  const { t } = useTranslate('common');
  const theme = useTheme();
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
          t('cashLedger.loadError', { defaultValue: 'Não foi possível carregar o extrato bancário/caixa' })
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

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'type',
      label: 'Tipo de Lançamento',
      options: (Object.keys(TYPE_CONFIG) as CashLedgerLineType[]).map((key) => ({
        value: key,
        label: TYPE_CONFIG[key].label,
      })),
      value: typeFilter,
      onChange: setTypeFilter,
    },
  ];

  const columns = useMemo<GridColDef<CashLedgerLine>[]>(
    () => [
      {
        field: 'reason',
        headerName: 'Lançamento / Transação',
        flex: 1.5,
        minWidth: 260,
        renderCell: (params) => {
          const config = TYPE_CONFIG[params.row.type] || TYPE_CONFIG.OPENING;
          return (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ height: 1 }}>
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: alpha(theme.palette[config.color].main, 0.12),
                  color: theme.palette[config.color].main,
                }}
              >
                <Iconify icon={config.icon} width={20} />
              </Avatar>
              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {params.row.type === 'OPENING' ? 'Abertura de Caixa' : params.row.reason || 'Movimentação avulsa'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                  Sessão: {params.row.sessionCode || '—'}
                  {params.row.refId ? ` • Ref: ${params.row.refType === 'payable' ? 'AP' : 'AR'}:${params.row.refId.slice(0, 8)}` : ''}
                </Typography>
              </Stack>
            </Stack>
          );
        },
      },
      {
        field: 'type',
        headerName: 'Tipo',
        width: 170,
        renderCell: (params) => {
          const config = TYPE_CONFIG[params.row.type] || TYPE_CONFIG.OPENING;
          return (
            <Label variant="soft" color={config.color}>
              {config.label}
            </Label>
          );
        },
      },
      {
        field: 'createdAt',
        headerName: 'Data e Hora',
        width: 170,
        renderCell: (params) => fDateTime(params.row.createdAt) || '—',
      },
      {
        field: 'signedAmount',
        headerName: 'Valor',
        width: 150,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params) => {
          const isPositive = params.row.signedAmount >= 0;
          return (
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                color: isPositive ? 'success.main' : 'error.main',
              }}
            >
              {isPositive ? '+' : '−'} {fCurrency(Math.abs(params.row.signedAmount))}
            </Typography>
          );
        },
      },
      {
        field: 'balanceAfter',
        headerName: 'Saldo Resultante',
        width: 160,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params) => (
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {fCurrency(params.row.balanceAfter)}
          </Typography>
        ),
      },
    ],
    [theme]
  );

  const { summary } = ledger;
  const isNetPositive = summary.net >= 0;

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading="Livro Caixa e Extrato Bancário"
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: 'Financeiro', href: paths.dashboard.cash.root },
          { name: 'Livro Caixa' },
        ]}
        action={
          <Stack direction="row" spacing={1.5}>
            <Button
              component={RouterLink}
              href={paths.dashboard.cash.receivables}
              variant="outlined"
              startIcon={<Iconify icon="solar:card-recive-bold" />}
            >
              A Receber
            </Button>
            <Button
              component={RouterLink}
              href={paths.dashboard.cash.payables}
              variant="outlined"
              startIcon={<Iconify icon="solar:card-send-bold" />}
            >
              A Pagar
            </Button>
            <Button
              component={RouterLink}
              href={paths.dashboard.cash.root}
              variant="contained"
              startIcon={<Iconify icon="solar:wallet-money-bold" />}
            >
              Sessões de Caixa
            </Button>
          </Stack>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <PeriodFilterBar
        preset={preset}
        onPresetChange={setPreset}
        rangePicker={rangePicker}
        title="Filtrar Período do Extrato"
      />

      {/* Banking Overview Strip (Saldo Atual + Métricas Financeiras) */}
      <Card sx={{ mb: 3, p: 3 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
          alignItems={{ md: 'center' }}
        >
          {/* Saldo Líquido do Período */}
          <Box sx={{ flexGrow: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Resultado Líquido do Período
              </Typography>
              <Label variant="soft" color={isNetPositive ? 'success' : 'error'}>
                {isNetPositive ? 'Superávit' : 'Déficit'}
              </Label>
            </Stack>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 700,
                color: isNetPositive ? 'success.main' : 'error.main',
              }}
            >
              {isNetPositive ? '+' : ''}{fCurrency(summary.net)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Baseado nas entradas e saídas efetivas de caixa do período selecionado
            </Typography>
          </Box>

          {/* Cards Rápidos de Entradas e Saídas no Padrão Banking */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ flexShrink: 0, minWidth: { md: 540 } }}
          >
            {/* Entradas */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                flexGrow: 1,
                bgcolor: alpha(theme.palette.success.main, 0.08),
                border: `1px dashed ${alpha(theme.palette.success.main, 0.24)}`,
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: alpha(theme.palette.success.main, 0.16),
                    color: 'success.main',
                  }}
                >
                  <Iconify icon="solar:card-recive-bold-duotone" width={24} />
                </Avatar>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Total Entradas
                  </Typography>
                  <Typography variant="subtitle1" sx={{ color: 'success.darker', fontWeight: 700 }}>
                    +{fCurrency(summary.inflow)}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            {/* Saídas */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                flexGrow: 1,
                bgcolor: alpha(theme.palette.error.main, 0.08),
                border: `1px dashed ${alpha(theme.palette.error.main, 0.24)}`,
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: alpha(theme.palette.error.main, 0.16),
                    color: 'error.main',
                  }}
                >
                  <Iconify icon="solar:card-send-bold-duotone" width={24} />
                </Avatar>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Total Saídas
                  </Typography>
                  <Typography variant="subtitle1" sx={{ color: 'error.darker', fontWeight: 700 }}>
                    −{fCurrency(summary.outflow)}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            {/* Total de Lançamentos */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                flexGrow: 1,
                bgcolor: alpha(theme.palette.info.main, 0.08),
                border: `1px dashed ${alpha(theme.palette.info.main, 0.24)}`,
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: alpha(theme.palette.info.main, 0.16),
                    color: 'info.main',
                  }}
                >
                  <Iconify icon="solar:bill-list-bold-duotone" width={24} />
                </Avatar>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Lançamentos
                  </Typography>
                  <Typography variant="subtitle1" sx={{ color: 'info.darker', fontWeight: 700 }}>
                    {summary.lineCount} transações
                  </Typography>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </Stack>
      </Card>

      {/* Tabela Extrato Detalhado estilo Banking com ErpDataGrid */}
      <Card sx={{ height: 680, display: 'flex', flexDirection: 'column' }}>
        <ErpDataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          toolbar={{
            selectFilters,
            searchPlaceholder: 'Pesquisar por descrição, motivo, sessão ou ref...',
          }}
        />
      </Card>
    </DashboardContent>
  );
}

import type { Sale } from 'src/api/firestore/sales';
import type { ColorType } from 'src/theme/core/palette';

import { useMemo } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TableRow from '@mui/material/TableRow';
import { useTheme } from '@mui/material/styles';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fDateTime } from 'src/utils/format-time';
import { fNumber, fPercent, fCurrency } from 'src/utils/format-number';

import { varAlpha } from 'src/theme/styles';

import { Label } from 'src/components/label';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';

import type { FiscalSummary } from '../erp-analytics';

// ----------------------------------------------------------------------

type Props = {
  sales: Sale[];
  fiscal: FiscalSummary;
  maxRows?: number;
};

type NfceMetricCard = {
  label: string;
  total: number;
  sub: string;
  color: ColorType;
  icon: string;
};

function formatShortKey(key?: string): string {
  if (!key) return '—';
  if (key.length <= 16) return key;
  return `${key.slice(0, 8)}…${key.slice(-8)}`;
}

export function ErpNfceOverviewCard({ sales, fiscal, maxRows = 5 }: Props) {
  const theme = useTheme();

  const { errorCount, simulatedCount, recentNfceSales } = useMemo(() => {
    let errors = 0;
    let simulated = 0;
    const withNfce: Sale[] = [];

    sales.forEach((sale) => {
      if (sale.nfceStatus === 'error') errors += 1;
      if (sale.nfceStatus === 'authorized' && sale.nfceSimulated) simulated += 1;
      if (
        sale.nfceStatus === 'authorized' ||
        sale.nfceStatus === 'error' ||
        sale.nfceStatus === 'cancelled' ||
        Boolean(sale.nfceKey)
      ) {
        withNfce.push(sale);
      }
    });

    withNfce.sort((a, b) => {
      const da = a.nfceIssuedAt || a.createdAt || '';
      const db = b.nfceIssuedAt || b.createdAt || '';
      return db.localeCompare(da);
    });

    return {
      errorCount: errors,
      simulatedCount: simulated,
      recentNfceSales: withNfce.slice(0, maxRows),
    };
  }, [maxRows, sales]);

  const metrics: NfceMetricCard[] = [
    {
      label: 'Autorizadas',
      total: fiscal.authorizedCount,
      sub: `${fCurrency(fiscal.authorizedTotal)}${simulatedCount > 0 ? ` • ${simulatedCount} sim.` : ''}`,
      color: 'success',
      icon: 'solar:verified-check-bold-duotone',
    },
    {
      label: 'Pendentes / Sem NFC-e',
      total: fiscal.pendingCount,
      sub: fCurrency(fiscal.pendingTotal),
      color: 'warning',
      icon: 'solar:clock-circle-bold-duotone',
    },
    {
      label: 'Com Erro',
      total: errorCount,
      sub: errorCount > 0 ? 'Requer atenção' : 'Nenhuma falha',
      color: 'error',
      icon: 'solar:danger-triangle-bold-duotone',
    },
    {
      label: 'Canceladas',
      total: fiscal.cancelledCount,
      sub: `Conformidade: ${fPercent(fiscal.compliancePercent)}`,
      color: 'secondary',
      icon: 'solar:close-circle-bold-duotone',
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Notas Fiscais Geradas (NFC-e)"
        subheader={`Conformidade fiscal no período: ${fPercent(fiscal.compliancePercent)} • ${fiscal.authorizedCount} nota(s) autorizada(s)`}
        action={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              component={RouterLink}
              href={paths.dashboard.account.fiscal}
              size="small"
              color="inherit"
              variant="outlined"
              startIcon={<Iconify icon="solar:settings-bold" width={16} />}
            >
              Configurar SEFAZ
            </Button>
            <Button
              component={RouterLink}
              href={paths.dashboard.pos.sales}
              size="small"
              endIcon={<Iconify icon="eva:arrow-ios-forward-fill" width={16} />}
            >
              Ver vendas
            </Button>
          </Stack>
        }
      />

      {/* Padrão CourseWidgetSummary (Minimals v6) */}
      <Box
        display="grid"
        gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }}
        sx={{ px: 3, py: 2.5, gap: 2.5 }}
      >
        {metrics.map((item) => (
          <Card
            key={item.label}
            sx={{
              py: 3,
              pl: 3,
              pr: 2.5,
              position: 'relative',
              overflow: 'hidden',
              boxShadow: 'none',
              border: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
            }}
          >
            <Box sx={{ flexGrow: 1, pr: 4 }}>
              <Box sx={{ typography: 'h3', mb: 0.5 }}>{fNumber(item.total)}</Box>
              <Typography noWrap variant="subtitle2" component="div" sx={{ color: 'text.secondary' }}>
                {item.label}
              </Typography>
              <Typography
                noWrap
                variant="caption"
                component="div"
                sx={{ color: 'text.disabled', mt: 0.5 }}
              >
                {item.sub}
              </Typography>
            </Box>

            <Iconify
              icon={item.icon}
              width={36}
              sx={{
                top: 24,
                right: 20,
                position: 'absolute',
                color: `${item.color}.main`,
              }}
            />

            <Box
              sx={{
                top: -44,
                width: 160,
                zIndex: 0,
                height: 160,
                right: -104,
                opacity: 0.14,
                borderRadius: 3,
                position: 'absolute',
                pointerEvents: 'none',
                transform: 'rotate(40deg)',
                background: `linear-gradient(to right, ${theme.vars.palette[item.color].main} 0%, ${varAlpha(theme.vars.palette[item.color].mainChannel, 0)} 100%)`,
              }}
            />
          </Card>
        ))}
      </Box>

      <Divider sx={{ borderStyle: 'dashed' }} />

      {recentNfceSales.length === 0 ? (
        <Box sx={{ px: 3, py: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Nenhuma NFC-e gerada neste período. Abra uma venda concluída para emitir ou simular a
            nota fiscal.
          </Typography>
        </Box>
      ) : (
        <Scrollbar>
          <Table sx={{ minWidth: 680 }}>
            <TableHead>
              <TableRow>
                <TableCell>NFC-e / Venda</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Chave de Acesso</TableCell>
                <TableCell>Emissão</TableCell>
                <TableCell align="right">Valor</TableCell>
                <TableCell align="right">Status Fiscal</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentNfceSales.map((sale) => (
                <TableRow
                  key={sale.id}
                  hover
                  component={RouterLink}
                  href={paths.dashboard.pos.saleDetails(sale.id)}
                  sx={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <TableCell>
                    <Typography variant="subtitle2" noWrap>
                      {sale.nfceNumber ? `NFC-e #${sale.nfceNumber}` : sale.code}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      Venda {sale.code}
                    </Typography>
                  </TableCell>
                  <TableCell>{sale.customerName || 'Consumidor Final'}</TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {formatShortKey(sale.nfceKey)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {sale.nfceIssuedAt || sale.createdAt
                      ? fDateTime(sale.nfceIssuedAt || sale.createdAt)
                      : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="subtitle2">{fCurrency(sale.total)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                      {sale.nfceSimulated && sale.nfceStatus === 'authorized' && (
                        <Label variant="soft" color="warning">
                          Simulação
                        </Label>
                      )}
                      <Label
                        variant="soft"
                        color={
                          sale.nfceStatus === 'authorized'
                            ? 'success'
                            : sale.nfceStatus === 'error'
                              ? 'error'
                              : sale.nfceStatus === 'cancelled'
                                ? 'default'
                                : 'warning'
                        }
                      >
                        {sale.nfceStatus === 'authorized'
                          ? 'Autorizada'
                          : sale.nfceStatus === 'error'
                            ? 'Erro'
                            : sale.nfceStatus === 'cancelled'
                              ? 'Cancelada'
                              : 'Pendente'}
                      </Label>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Scrollbar>
      )}
    </Card>
  );
}

import type { GridColDef } from '@mui/x-data-grid';
import type { Sale } from 'src/api/firestore/sales';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';
import type { CashSession, CashMovementType } from 'src/api/firestore/cash-sessions';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { listSales } from 'src/api/firestore/sales';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  openCashSession,
  listCashSessions,
  closeCashSessionBlind,
  addCashSessionMovement,
} from 'src/api/firestore/cash-sessions';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import {
  emptyTotalsByMethod,
  calculateCashSessionExpected,
  calculateBlindCloseDifference,
} from '../cash-calculator';

// ----------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'open', label: 'Aberto' },
  { value: 'closed', label: 'Fechado' },
];

export function CashSessionView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const openModal = useBoolean();
  const movementModal = useBoolean();
  const blindCloseModal = useBoolean();

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  // Form states for modals
  const [openingBalance, setOpeningBalance] = useState<number>(100);
  const [movementType, setMovementType] = useState<CashMovementType>('WITHDRAWAL');
  const [movementAmount, setMovementAmount] = useState<number>(0);
  const [movementReason, setMovementReason] = useState('');

  // Blind close counted inputs (operator types physical counts without seeing expected beforehand!)
  const [countedCash, setCountedCash] = useState<number>(0);
  const [countedPix, setCountedPix] = useState<number>(0);
  const [countedCredit, setCountedCredit] = useState<number>(0);
  const [countedDebit, setCountedDebit] = useState<number>(0);
  const [closeNotes, setCloseNotes] = useState('');

  const loadData = useCallback(async () => {
    if (!enterpriseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [sessList, salesList] = await Promise.all([
        listCashSessions(enterpriseId),
        listSales(enterpriseId),
      ]);
      setSessions(sessList);
      setSales(salesList);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar sessões de caixa'));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === 'open') || null,
    [sessions]
  );

  const sessionSales = useMemo(() => {
    if (!activeSession) return [];
    return sales.filter((s) => s.createdAt >= activeSession.openedAt);
  }, [activeSession, sales]);

  const expectedCalc = useMemo(() => {
    if (!activeSession) return null;
    return calculateCashSessionExpected({
      openingBalance: activeSession.openingBalance,
      movements: activeSession.movements,
      sales: sessionSales,
    });
  }, [activeSession, sessionSales]);

  const handleOpenSession = async () => {
    if (!enterpriseId) return;
    try {
      const code = `CX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random()
        .toString(36)
        .slice(2, 5)
        .toUpperCase()}`;
      await openCashSession(enterpriseId, {
        code,
        openingBalance,
        operatorUid: user?.id,
        operatorEmail: user?.email,
      });
      toast.success('Caixa aberto com sucesso!');
      openModal.onFalse();
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao abrir caixa'));
    }
  };

  const handleAddMovement = async () => {
    if (!enterpriseId || !activeSession || movementAmount <= 0) return;
    try {
      await addCashSessionMovement(enterpriseId, activeSession, {
        type: movementType,
        amount: movementAmount,
        reason: movementReason.trim() || (movementType === 'WITHDRAWAL' ? 'Sangria' : 'Suprimento'),
        createdBy: user?.email,
      });
      toast.success(
        movementType === 'WITHDRAWAL'
          ? 'Sangria registrada com sucesso!'
          : 'Suprimento registrado com sucesso!'
      );
      setMovementAmount(0);
      setMovementReason('');
      movementModal.onFalse();
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao registrar movimentação'));
    }
  };

  const handleBlindClose = async () => {
    if (!enterpriseId || !activeSession || !expectedCalc) return;
    try {
      const diff = calculateBlindCloseDifference({
        expectedDrawerCash: expectedCalc.expectedDrawerCash,
        countedDrawerCash: countedCash,
      });

      const countedTotals = {
        ...emptyTotalsByMethod(),
        cash: countedCash,
        pix: countedPix,
        credit_card: countedCredit,
        debit_card: countedDebit,
      };

      await closeCashSessionBlind(enterpriseId, activeSession.id, {
        expectedTotals: expectedCalc.expectedTotals,
        countedTotals,
        expectedDrawerCash: expectedCalc.expectedDrawerCash,
        countedDrawerCash: countedCash,
        differenceAmount: diff.differenceAmount,
        notes: closeNotes.trim() || undefined,
      });

      toast.success(
        `Caixa fechado! Diferença apurada na gaveta: ${fCurrency(diff.differenceAmount)}`
      );
      blindCloseModal.onFalse();
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao fechar caixa'));
    }
  };

  const dataFiltered = useMemo(() => {
    if (!statusFilter.length) return sessions;
    return sessions.filter((s) => statusFilter.includes(s.status));
  }, [sessions, statusFilter]);

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'status',
      label: 'Status do Caixa',
      options: STATUS_OPTIONS,
      value: statusFilter,
      onChange: setStatusFilter,
    },
  ];

  const columns = useMemo<GridColDef<CashSession>[]>(
    () => [
      { field: 'code', headerName: 'Código', width: 160, hideable: false },
      {
        field: 'operatorEmail',
        headerName: 'Operador',
        flex: 1,
        minWidth: 180,
        valueGetter: (_v, row) => row.operatorEmail || '—',
      },
      {
        field: 'openingBalance',
        headerName: 'Fundo inicial',
        width: 130,
        renderCell: (params) => fCurrency(params.row.openingBalance),
      },
      {
        field: 'expectedDrawerCash',
        headerName: 'Esperado (Gaveta)',
        width: 150,
        renderCell: (params) =>
          typeof params.row.expectedDrawerCash === 'number'
            ? fCurrency(params.row.expectedDrawerCash)
            : '—',
      },
      {
        field: 'countedDrawerCash',
        headerName: 'Informado (Cego)',
        width: 150,
        renderCell: (params) =>
          typeof params.row.countedDrawerCash === 'number'
            ? fCurrency(params.row.countedDrawerCash)
            : '—',
      },
      {
        field: 'differenceAmount',
        headerName: 'Sobra / Quebra',
        width: 140,
        renderCell: (params) => {
          const diff = params.row.differenceAmount;
          if (typeof diff !== 'number') return '—';
          return (
            <Label
              color={diff === 0 ? 'success' : diff > 0 ? 'info' : 'error'}
              variant="soft"
            >
              {diff > 0 ? `+${fCurrency(diff)}` : fCurrency(diff)}
            </Label>
          );
        },
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 110,
        renderCell: (params) => (
          <Label color={params.row.status === 'open' ? 'warning' : 'success'} variant="soft">
            {params.row.status === 'open' ? 'Aberto' : 'Fechado'}
          </Label>
        ),
      },
      {
        field: 'openedAt',
        headerName: 'Abertura',
        width: 160,
        renderCell: (params) => fDateTime(params.row.openedAt) || '—',
      },
    ],
    []
  );

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading={t('cash.heading', { defaultValue: 'Controle de Caixa (Fechamento Cego)' })}
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: t('cash.heading', { defaultValue: 'Caixa' }) },
          ]}
          action={
            <Stack direction="row" spacing={1.5}>
              <Button
                component={RouterLink}
                href={paths.dashboard.cash.dre}
                variant="outlined"
                startIcon={<Iconify icon="solar:chart-square-bold" />}
              >
                {t('nav.dre', { defaultValue: 'Relatório DRE' })}
              </Button>
              {!activeSession ? (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Iconify icon="mingcute:add-line" />}
                  onClick={openModal.onTrue}
                >
                  Abrir Caixa
                </Button>
              ) : (
                <>
                  <Button
                    variant="soft"
                    color="warning"
                    startIcon={<Iconify icon="solar:transfer-horizontal-bold" />}
                    onClick={() => {
                      setMovementType('WITHDRAWAL');
                      movementModal.onTrue();
                    }}
                  >
                    Sangria / Suprimento
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<Iconify icon="solar:lock-password-bold" />}
                    onClick={() => {
                      setCountedCash(0);
                      setCountedPix(0);
                      setCountedCredit(0);
                      setCountedDebit(0);
                      blindCloseModal.onTrue();
                    }}
                  >
                    Fechamento Cego
                  </Button>
                </>
              )}
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {activeSession && (
          <Card sx={{ mb: 4 }}>
            <CardHeader
              title={`Sessão Aberta: ${activeSession.code}`}
              subheader={`Operador: ${activeSession.operatorEmail || '—'} • Aberto em ${fDateTime(activeSession.openedAt)}`}
              action={
                <Label color="success" variant="soft">
                  CAIXA ABERTO
                </Label>
              }
              sx={{ mb: 3 }}
            />
            <Divider />
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={3}
              justifyContent="space-between"
              sx={{ p: 3 }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Fundo de Troco (Abertura)
                </Typography>
                <Typography variant="h6">{fCurrency(activeSession.openingBalance)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Suprimentos (+)
                </Typography>
                <Typography variant="h6" color="success.main">
                  {fCurrency(expectedCalc?.totalSupplies ?? 0)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Sangrias (-)
                </Typography>
                <Typography variant="h6" color="error.main">
                  {fCurrency(expectedCalc?.totalWithdrawals ?? 0)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Vendas Realizadas na Sessão
                </Typography>
                <Typography variant="h6">{sessionSales.length} vendas</Typography>
              </Box>
            </Stack>
          </Card>
        )}

        <Card sx={{ height: 640 }}>
          <ErpDataGrid<CashSession>
            rows={dataFiltered}
            columns={columns}
            loading={loading}
            getRowId={(row) => row.id}
            emptyTitle="Nenhuma sessão de caixa registrada"
            toolbar={{
              selectFilters,
              searchPlaceholder: 'Pesquisar caixa por código, operador…',
              filteredResults: dataFiltered.length,
            }}
          />
        </Card>
      </DashboardContent>

      {/* Modal: Abrir Caixa */}
      <Dialog open={openModal.value} onClose={openModal.onFalse} fullWidth maxWidth="xs">
        <DialogTitle>Abrir Novo Caixa</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              type="number"
              label="Saldo inicial / Fundo de troco"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(Math.max(0, Number(e.target.value)))}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box component="span" sx={{ color: 'text.disabled' }}>
                      R$
                    </Box>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={openModal.onFalse}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleOpenSession}>
            Confirmar abertura
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Sangria / Suprimento */}
      <Dialog open={movementModal.value} onClose={movementModal.onFalse} fullWidth maxWidth="xs">
        <DialogTitle>Registrar Sangria ou Suprimento</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <TextField
              select
              fullWidth
              label="Tipo de movimentação"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as CashMovementType)}
            >
              <MenuItem value="WITHDRAWAL">Sangria (Retirada de dinheiro da gaveta)</MenuItem>
              <MenuItem value="SUPPLY">Suprimento (Entrada de troco na gaveta)</MenuItem>
            </TextField>

            <TextField
              fullWidth
              type="number"
              label="Valor"
              value={movementAmount}
              onChange={(e) => setMovementAmount(Math.max(0, Number(e.target.value)))}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Box component="span" sx={{ color: 'text.disabled' }}>
                      R$
                    </Box>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              fullWidth
              label="Motivo / Observação"
              value={movementReason}
              onChange={(e) => setMovementReason(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={movementModal.onFalse}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleAddMovement}>
            Salvar movimentação
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Fechamento Cego */}
      <Dialog
        open={blindCloseModal.value}
        onClose={blindCloseModal.onFalse}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Fechamento Cego de Caixa (Blindagem)</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Informe os valores físicos contados na gaveta e nos comprovantes. O sistema calculará
              automaticamente a diferença (Sobra ou Quebra) após a confirmação.
            </Typography>

            <Box
              columnGap={2}
              rowGap={3}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)' }}
            >
              <TextField
                type="number"
                label="Dinheiro físico na gaveta"
                value={countedCash}
                onChange={(e) => setCountedCash(Math.max(0, Number(e.target.value)))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        R$
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                type="number"
                label="Total em PIX conferido"
                value={countedPix}
                onChange={(e) => setCountedPix(Math.max(0, Number(e.target.value)))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        R$
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                type="number"
                label="Total Cartão de Crédito"
                value={countedCredit}
                onChange={(e) => setCountedCredit(Math.max(0, Number(e.target.value)))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        R$
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                type="number"
                label="Total Cartão de Débito"
                value={countedDebit}
                onChange={(e) => setCountedDebit(Math.max(0, Number(e.target.value)))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        R$
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <TextField
              label="Observações de fechamento"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={blindCloseModal.onFalse}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={handleBlindClose}>
            Confirmar Fechamento Cego
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

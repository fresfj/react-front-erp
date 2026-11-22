import type { CashSession } from 'src/api/firestore/cash-sessions';

import { useRef, useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import TableContainer from '@mui/material/TableContainer';

import { fDate } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { addCashSessionMovement } from 'src/api/firestore/cash-sessions';
import {
  listBankStatementEntries,
  updateBankStatementStatus,
  importBankStatementEntries,
} from 'src/api/firestore/bank-reconciliation';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { CustomTabs } from 'src/components/custom-tabs';
import { EmptyContent } from 'src/components/empty-content';
import { ErpTableAnalytic } from 'src/components/erp-table';

import { useAuthContext } from 'src/auth/hooks';

import {
  parseBankStatementFile,
  findAutoReconciliationMatches,
} from './bank-reconciliation';

import type { CashLedgerLine } from './cash-ledger';
import type { BankStatementEntry, BankStatementStatus } from './bank-reconciliation';

// ----------------------------------------------------------------------

type Props = {
  enterpriseId: string;
  ledgerLines: CashLedgerLine[];
  systemBankBalance: number;
  openSession: CashSession | null;
  onRefreshLedger: () => Promise<void>;
};

export function BankReconciliationPanel({
  enterpriseId,
  ledgerLines,
  systemBankBalance,
  openSession,
  onRefreshLedger,
}: Props) {
  const { user } = useAuthContext();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [entries, setEntries] = useState<BankStatementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | BankStatementStatus>('all');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listBankStatementEntries(enterpriseId);
      setEntries(list);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar lançamentos de conciliação.'));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const suggestions = useMemo(
    () => findAutoReconciliationMatches(entries, ledgerLines, 2),
    [entries, ledgerLines]
  );

  const visibleEntries = useMemo(() => {
    if (statusFilter === 'all') return entries;
    return entries.filter((e) => e.status === statusFilter);
  }, [entries, statusFilter]);

  const stats = useMemo(() => {
    const active = entries.filter((e) => e.status !== 'ignored');
    const reconciled = active.filter((e) => e.status === 'reconciled');
    const pending = active.filter((e) => e.status === 'pending');
    const bankNet =
      Math.round(active.reduce((acc, e) => acc + (Number(e.amount) || 0), 0) * 100) / 100;
    const pct = active.length > 0 ? Math.round((reconciled.length / active.length) * 100) : 0;
    const diff = Math.round((bankNet - systemBankBalance) * 100) / 100;
    return {
      total: active.length,
      reconciledCount: reconciled.length,
      pendingCount: pending.length,
      bankNet,
      diff,
      pct,
    };
  }, [entries, systemBankBalance]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const content = await file.text();
      const parsed = parseBankStatementFile(file.name, content);
      if (parsed.length === 0) {
        toast.error(
          'Nenhum lançamento válido encontrado no arquivo. Use um extrato .OFX ou .CSV com colunas Data, Descrição e Valor.'
        );
        return;
      }
      const res = await importBankStatementEntries(enterpriseId, parsed, {
        bankName: file.name.replace(/\.(ofx|csv)$/i, ''),
      });
      toast.success(
        `${res.imported} lançamento(s) importado(s)${
          res.skippedDuplicates > 0 ? ` (${res.skippedDuplicates} duplicado(s) ignorado(s))` : ''
        }.`
      );
      await loadEntries();
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao importar extrato bancário.'));
    } finally {
      setImporting(false);
    }
  };

  const handleApproveMatch = async (entry: BankStatementEntry, ledgerLine: CashLedgerLine) => {
    setBusyId(entry.id);
    try {
      await updateBankStatementStatus(enterpriseId, entry.id, {
        status: 'reconciled',
        matchedLedgerId: ledgerLine.id,
        matchedLedgerReason: ledgerLine.reason,
        reconciledBy: user?.email,
      });
      toast.success('Lançamento conciliado com sucesso!');
      await loadEntries();
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao conciliar lançamento.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveAllSuggestions = async () => {
    const pairs = Array.from(suggestions.values());
    if (pairs.length === 0) return;
    setImporting(true);
    try {
      await Promise.all(
        pairs.map((s) =>
          updateBankStatementStatus(enterpriseId, s.statementId, {
            status: 'reconciled',
            matchedLedgerId: s.ledgerLine.id,
            matchedLedgerReason: s.ledgerLine.reason,
            reconciledBy: user?.email,
          })
        )
      );
      toast.success(`${pairs.length} lançamento(s) conciliado(s) automaticamente!`);
      await loadEntries();
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro na conciliação em lote.'));
    } finally {
      setImporting(false);
    }
  };

  const handleCreateAdjustmentAndReconcile = async (entry: BankStatementEntry) => {
    if (!openSession) {
      toast.error('Abra o caixa em Financeiro → Caixa para registrar um lançamento avulso.');
      return;
    }
    setBusyId(entry.id);
    try {
      const movType = entry.amount >= 0 ? 'RECEIPT' : 'PAYMENT';
      await addCashSessionMovement(enterpriseId, openSession, {
        type: movType,
        amount: Math.abs(entry.amount),
        reason: `[Banco] ${entry.memo}`,
        createdBy: user?.email,
      });
      await updateBankStatementStatus(enterpriseId, entry.id, {
        status: 'reconciled',
        matchedLedgerId: `manual:${entry.id}`,
        matchedLedgerReason: `[Banco] ${entry.memo}`,
        reconciledBy: user?.email,
      });
      toast.success('Lançamento avulso criado no caixa e conciliado!');
      await Promise.all([loadEntries(), onRefreshLedger()]);
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao lançar ajuste avulso.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSetStatus = async (entry: BankStatementEntry, status: BankStatementStatus) => {
    setBusyId(entry.id);
    try {
      await updateBankStatementStatus(enterpriseId, entry.id, {
        status,
        matchedLedgerId: status === 'pending' ? null : entry.matchedLedgerId,
        matchedLedgerReason: status === 'pending' ? null : entry.matchedLedgerReason,
        reconciledBy: user?.email,
      });
      await loadEntries();
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao atualizar status.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      {/* Analytics Strip de Conciliação */}
      <Scrollbar sx={{ minHeight: 108 }}>
        <Stack
          direction="row"
          divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
          sx={{ py: 2.5 }}
        >
          <ErpTableAnalytic
            title="Saldo no Sistema (Banco/PIX)"
            primaryValue={fCurrency(systemBankBalance)}
            secondaryValue={`${ledgerLines.length} lançamentos`}
            percent={100}
            icon="solar:wallet-money-bold-duotone"
            color="#00B8D9"
          />
          <ErpTableAnalytic
            title="Saldo Extrato Importado"
            primaryValue={fCurrency(stats.bankNet)}
            secondaryValue={`${stats.total} linhas no extrato`}
            percent={100}
            icon="solar:banknote-2-bold-duotone"
            color="#00A76F"
          />
          <ErpTableAnalytic
            title="Diferença a Conciliar"
            primaryValue={fCurrency(stats.diff)}
            secondaryValue={`${stats.pendingCount} pendente(s)`}
            percent={stats.total > 0 ? Math.round((stats.pendingCount / stats.total) * 100) : 0}
            icon="solar:scale-bold-duotone"
            color={Math.abs(stats.diff) < 0.01 ? '#00A76F' : '#FFAB00'}
          />
          <ErpTableAnalytic
            title="Conciliados"
            primaryValue={`${stats.pct}%`}
            secondaryValue={`${stats.reconciledCount} de ${stats.total} conciliados`}
            percent={stats.pct}
            icon="solar:check-circle-bold-duotone"
            color="#00A76F"
          />
        </Stack>
      </Scrollbar>

      <Divider />

      {/* Barra de ações: Importar OFX/CSV + Filtro de status + Conciliar Sugestões */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
        sx={{ p: 2.5 }}
      >
        <CustomTabs
          value={statusFilter}
          onChange={(_, val: 'all' | BankStatementStatus) => {
            if (val) setStatusFilter(val);
          }}
          sx={{ borderRadius: 1.25, bgcolor: 'background.neutral', minHeight: 40 }}
          slotProps={{
            indicator: { borderRadius: 1, boxShadow: (t) => t.customShadows.z4 },
            tab: { minHeight: 34, py: 0.5, px: 1.5, typography: 'caption', fontWeight: 700 },
          }}
        >
          <Tab value="all" label={`Todos (${entries.length})`} />
          <Tab value="pending" label={`Pendentes (${stats.pendingCount})`} />
          <Tab value="reconciled" label={`Conciliados (${stats.reconciledCount})`} />
          <Tab
            value="ignored"
            label={`Ignorados (${entries.filter((e) => e.status === 'ignored').length})`}
          />
        </CustomTabs>

        <Stack direction="row" spacing={1.25} flexWrap="wrap">
          {suggestions.size > 0 && (
            <LoadingButton
              variant="soft"
              color="success"
              loading={importing}
              startIcon={<Iconify icon="solar:check-read-bold" />}
              onClick={handleApproveAllSuggestions}
            >
              Conciliar {suggestions.size} sugestão(ões)
            </LoadingButton>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".ofx,.csv,text/csv,application/x-ofx"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <LoadingButton
            variant="contained"
            loading={importing}
            startIcon={<Iconify icon="solar:upload-minimalistic-bold" />}
            onClick={() => fileInputRef.current?.click()}
          >
            Importar Extrato (.OFX / .CSV)
          </LoadingButton>
        </Stack>
      </Stack>

      {!openSession && (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Alert severity="info">
            Para criar lançamentos avulsos (ex.: tarifas bancárias, IOF ou PIX avulso) direto da
            conciliação, mantenha um caixa aberto em <strong>Financeiro → Caixa</strong>.
          </Alert>
        </Box>
      )}

      {/* Tabela de Conciliação */}
      {!loading && visibleEntries.length === 0 ? (
        <Box sx={{ py: 6 }}>
          <EmptyContent
            title="Nenhum extrato importado"
            description="Clique em 'Importar Extrato (.OFX / .CSV)' para carregar o arquivo do seu banco (Itaú, Bradesco, BB, Nubank, Inter, Sicredi, Cora, Asaas, etc.) e conciliar automaticamente com o Livro Caixa."
          />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={115}>Data</TableCell>
                <TableCell>Descrição no Extrato</TableCell>
                <TableCell align="right" width={135}>
                  Valor Extrato
                </TableCell>
                <TableCell>Correspondência no Sistema</TableCell>
                <TableCell width={120}>Status</TableCell>
                <TableCell align="right" width={200}>
                  Ações
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleEntries.map((entry) => {
                const suggestion = suggestions.get(entry.id);
                const isBusy = busyId === entry.id;

                return (
                  <TableRow key={entry.id} hover>
                    <TableCell>{fDate(entry.date)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {entry.memo}
                      </Typography>
                      {entry.bankName && (
                        <Typography variant="caption" color="text.secondary">
                          {entry.bankName}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="subtitle2"
                        color={entry.amount >= 0 ? 'success.main' : 'error.main'}
                      >
                        {entry.amount >= 0 ? '+' : ''}
                        {fCurrency(entry.amount)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {entry.status === 'reconciled' ? (
                        <Typography variant="caption" color="success.dark" sx={{ fontWeight: 600 }}>
                          ✓ {entry.matchedLedgerReason || entry.matchedLedgerId}
                        </Typography>
                      ) : suggestion ? (
                        <Stack spacing={0.25}>
                          <Typography variant="caption" color="info.main" sx={{ fontWeight: 700 }}>
                            Sugestão automática ({suggestion.daysDiff === 0 ? 'mesmo dia' : `±${suggestion.daysDiff}d`}):
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {suggestion.ledgerLine.reason}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          Sem correspondência automática
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Label
                        variant="soft"
                        color={
                          entry.status === 'reconciled'
                            ? 'success'
                            : entry.status === 'ignored'
                              ? 'default'
                              : 'warning'
                        }
                      >
                        {entry.status === 'reconciled'
                          ? 'Conciliado'
                          : entry.status === 'ignored'
                            ? 'Ignorado'
                            : 'Pendente'}
                      </Label>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {entry.status === 'pending' && suggestion && (
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            disabled={isBusy}
                            onClick={() => handleApproveMatch(entry, suggestion.ledgerLine)}
                          >
                            Conciliar
                          </Button>
                        )}
                        {entry.status === 'pending' && !suggestion && (
                          <Tooltip title="Lançar no caixa aberto (ex.: tarifa bancária, IOF ou PIX avulso) e conciliar">
                            <Button
                              size="small"
                              variant="soft"
                              color="primary"
                              disabled={isBusy}
                              onClick={() => handleCreateAdjustmentAndReconcile(entry)}
                            >
                              Lançar avulso
                            </Button>
                          </Tooltip>
                        )}
                        {entry.status === 'pending' && (
                          <Tooltip title="Ignorar linha">
                            <IconButton
                              size="small"
                              disabled={isBusy}
                              onClick={() => handleSetStatus(entry, 'ignored')}
                            >
                              <Iconify icon="solar:eye-closed-bold" width={18} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {entry.status !== 'pending' && (
                          <Tooltip title="Voltar para pendente">
                            <IconButton
                              size="small"
                              disabled={isBusy}
                              onClick={() => handleSetStatus(entry, 'pending')}
                            >
                              <Iconify icon="solar:restart-bold" width={18} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}

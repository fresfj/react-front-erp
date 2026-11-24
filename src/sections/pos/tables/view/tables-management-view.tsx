import type { Sale } from 'src/api/firestore/sales';
import type { Enterprise } from 'src/api/firestore/platform';
import type { DiningTable, TableSession } from 'src/api/firestore/tables';
import type {
  OnlineOrder,
  OnlineOrderItem,
  OnlinePayOnDeliveryMethod,
} from 'src/api/firestore/online-orders';

import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useEnterpriseProductsStore } from 'src/hooks/use-enterprise-products-store';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { varAlpha } from 'src/theme/styles';
import { DashboardContent } from 'src/layouts/dashboard';
import { getEnterprise } from 'src/api/firestore/platform';
import { listCashSessions } from 'src/api/firestore/cash-sessions';
import { subscribeOnlineOrders } from 'src/api/firestore/online-orders';
import {
  createTable,
  updateTable,
  subscribeTables,
  closeTableSession,
  openNewTableSession,
  buildTableReceiptSale,
  submitWaiterTableOrder,
  subscribeOpenTableSessions,
  setEnterpriseTableOrdersEnabled,
} from 'src/api/firestore/tables';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { ErpTableAnalytic } from 'src/components/erp-table';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { usePopover, CustomPopover } from 'src/components/custom-popover';

import { useAuthContext } from 'src/auth/hooks';

import { TableQrDialog } from '../table-qr-dialog';
import { ReceiptDialog } from '../../receipt-dialog';
import { TableFormDialog } from '../table-form-dialog';
import { TableSessionDrawer } from '../table-session-drawer';

// ----------------------------------------------------------------------

export function TablesManagementView() {
  const theme = useTheme();
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [openSessions, setOpenSessions] = useState<TableSession[]>([]);
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const { products, productsLoading } = useEnterpriseProductsStore(enterpriseId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [qrTable, setQrTable] = useState<DiningTable | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);
  const [globalTablesEnabled, setGlobalTablesEnabled] = useState(true);
  const [hasOpenCash, setHasOpenCash] = useState<boolean>(true);

  const printPopover = usePopover();
  const [printMenuTable, setPrintMenuTable] = useState<DiningTable | null>(null);

  useEffect(() => {
    if (!enterpriseId) {
      setLoading(false);
      return undefined;
    }

    getEnterprise(enterpriseId)
      .then((ent) => {
        setEnterprise(ent);
        setGlobalTablesEnabled(ent?.onlineStore?.acceptTableOrders !== false);
      })
      .catch(() => {});

    listCashSessions(enterpriseId)
      .then((sess) => setHasOpenCash(sess.some((s) => s.status === 'open')))
      .catch(() => {});

    const unsubTables = subscribeTables(enterpriseId, (next) => {
      setTables(next.filter((t) => t.active));
      setLoading(false);
    });
    const unsubSessions = subscribeOpenTableSessions(enterpriseId, setOpenSessions);
    const unsubOrders = subscribeOnlineOrders(enterpriseId, setOrders);

    return () => {
      unsubTables();
      unsubSessions();
      unsubOrders();
    };
  }, [enterpriseId]);

  const sessionsByTableId = useMemo(() => {
    const map = new Map<string, TableSession[]>();
    openSessions.forEach((s) => {
      const list = map.get(s.tableId) || [];
      list.push(s);
      map.set(s.tableId, list);
    });
    map.forEach((list) =>
      list.sort((a, b) => String(a.openedAt || '').localeCompare(String(b.openedAt || '')))
    );
    return map;
  }, [openSessions]);

  const selectedTable = useMemo(
    () => (selectedTableId ? tables.find((t) => t.id === selectedTableId) ?? null : null),
    [selectedTableId, tables]
  );

  const selectedTableSessions = useMemo(
    () => (selectedTable ? sessionsByTableId.get(selectedTable.id) ?? [] : []),
    [selectedTable, sessionsByTableId]
  );

  const selectedSession = useMemo(
    () =>
      selectedTableSessions.find((s) => s.id === selectedSessionId) ||
      selectedTableSessions[0] ||
      null,
    [selectedSessionId, selectedTableSessions]
  );

  const selectedSessionOrders = useMemo(() => {
    if (!selectedSession) return [];
    return orders.filter((o) => o.tableSessionId === selectedSession.id);
  }, [orders, selectedSession]);

  const occupiedCount = tables.filter(
    (t) => t.status === 'occupied' || (sessionsByTableId.get(t.id)?.length || 0) > 0
  ).length;
  const availableCount = tables.length - occupiedCount;
  const openTotalAmount = openSessions.reduce((acc, s) => acc + Number(s.total || 0), 0);

  const handleSaveTable = useCallback(
    async (data: { number: string; label?: string; area?: string; capacity?: number }) => {
      if (!enterpriseId) return;
      setBusy(true);
      try {
        if (editingTable) {
          await updateTable(enterpriseId, editingTable.id, data);
          toast.success(`Mesa ${data.number} atualizada!`);
        } else {
          await createTable(enterpriseId, data);
          toast.success(`Mesa ${data.number} criada com QR Code!`);
        }
        setFormOpen(false);
        setEditingTable(null);
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Erro ao salvar mesa'));
      } finally {
        setBusy(false);
      }
    },
    [editingTable, enterpriseId]
  );

  const handleCreateIndividualSession = useCallback(
    async (customerName: string, customerPhone?: string) => {
      if (!enterpriseId || !selectedTable || !user) return;
      setBusy(true);
      try {
        const newId = await openNewTableSession(enterpriseId, {
          table: selectedTable,
          customerName,
          customerPhone,
          waiterUid: String(user.id || user.uid || ''),
          waiterName: String(user.displayName || user.email || 'Garçom'),
        });
        setSelectedSessionId(newId);
        toast.success(`Comanda "${customerName}" aberta na Mesa ${selectedTable.number}!`);
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Erro ao abrir comanda individual'));
      } finally {
        setBusy(false);
      }
    },
    [enterpriseId, selectedTable, user]
  );

  const handleSubmitWaiterOrder = useCallback(
    async (items: OnlineOrderItem[], notes?: string) => {
      if (!enterpriseId || !selectedTable || !user) return;
      setBusy(true);
      try {
        const waiterName = String(user.displayName || user.email || 'Garçom');
        const res = await submitWaiterTableOrder(enterpriseId, {
          table: selectedTable,
          activeSession: selectedSession,
          waiterUid: String(user.id || user.uid || ''),
          waiterName,
          items,
          notes,
        });
        if (!selectedSession) {
          setSelectedSessionId(res.sessionId);
        }
        toast.success(`Pedido ${res.code} enviado para Em Preparo no Kanban!`);
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Erro ao lançar pedido na mesa'));
      } finally {
        setBusy(false);
      }
    },
    [enterpriseId, selectedSession, selectedTable, user]
  );

  const handleToggleGlobalTables = useCallback(async () => {
    if (!enterpriseId) return;
    const nextEnabled = !globalTablesEnabled;
    setGlobalTablesEnabled(nextEnabled);
    try {
      await setEnterpriseTableOrdersEnabled(enterpriseId, nextEnabled);
      toast.success(
        nextEnabled
          ? 'Pedidos por mesa liberados!'
          : 'Pedidos por mesa bloqueados temporariamente.'
      );
    } catch (error) {
      setGlobalTablesEnabled(!nextEnabled);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao alterar status geral das mesas'));
    }
  }, [enterpriseId, globalTablesEnabled]);

  const handleToggleSingleTablePower = useCallback(
    async (table: DiningTable) => {
      if (!enterpriseId) return;
      const nextEnabled = !table.acceptingOrders;
      try {
        await updateTable(enterpriseId, table.id, { acceptingOrders: nextEnabled });
        toast.success(
          nextEnabled
            ? `Mesa ${table.number} ligada para receber pedidos!`
            : `Mesa ${table.number} desligada para novos pedidos.`
        );
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Erro ao alterar status da mesa'));
      }
    },
    [enterpriseId]
  );

  const handleCloseTable = useCallback(
    async (paymentMethod: OnlinePayOnDeliveryMethod, includeServiceFee: boolean) => {
      if (!enterpriseId || !selectedTable || !selectedSession || !user) return;
      setBusy(true);
      try {
        const remaining = selectedTableSessions.filter((s) => s.id !== selectedSession.id);
        await closeTableSession(enterpriseId, {
          table: selectedTable,
          session: selectedSession,
          remainingOpenSessions: remaining,
          sessionOrders: selectedSessionOrders,
          products,
          paymentMethod,
          includeServiceFee,
          closedByUid: String(user.id || user.uid || ''),
          closedByEmail: user.email || undefined,
          closedByName: String(user.displayName || user.email || 'Garçom'),
        });
        toast.success(
          remaining.length > 0
            ? `Comanda ${selectedSession.customerName || ''} encerrada! Mesa ${selectedTable.number} segue aberta para as demais comandas.`
            : `Mesa ${selectedTable.number} encerrada e venda registrada no caixa!`
        );
        if (remaining.length > 0) {
          setSelectedSessionId(remaining[0].id);
        } else {
          setSelectedTableId(null);
          setSelectedSessionId(null);
        }
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, 'Erro ao encerrar comanda'));
      } finally {
        setBusy(false);
      }
    },
    [
      enterpriseId,
      products,
      selectedSession,
      selectedSessionOrders,
      selectedTable,
      selectedTableSessions,
      user,
    ]
  );

  const handlePrintSessionComanda = useCallback(
    (table: DiningTable, session: TableSession, sessionOrds: OnlineOrder[], includeServiceFee: boolean) => {
      const items = sessionOrds.flatMap((o) => o.items);
      if (!items.length) {
        toast.info('Nenhum item lançado nesta comanda para imprimir.');
        return;
      }
      const sale = buildTableReceiptSale({
        code: `COM-M${table.number}`,
        tableNumber: table.number,
        comandaName: session.customerName,
        customerPhone: session.customerPhone,
        waiterName: session.waiterName,
        items,
        includeServiceFee,
        createdAt: session.openedAt,
      });
      setReceiptSale(sale);
    },
    []
  );

  const handlePrintAllTableComandas = useCallback(
    (table: DiningTable, tableSessList: TableSession[]) => {
      const sessionIds = new Set(tableSessList.map((s) => s.id));
      const allOrds = orders.filter((o) => o.tableSessionId && sessionIds.has(o.tableSessionId));
      const items = allOrds.flatMap((o) => o.items);
      if (!items.length) {
        toast.info('Nenhum item lançado nesta mesa para imprimir.');
        return;
      }
      const sale = buildTableReceiptSale({
        code: `MESA-${table.number}`,
        tableNumber: table.number,
        comandaName: `Todas (${tableSessList.length} comandas)`,
        items,
      });
      setReceiptSale(sale);
    },
    [orders]
  );

  const handlePrintSingleOrder = useCallback(
    (order: OnlineOrder) => {
      if (!selectedTable) return;
      const sale = buildTableReceiptSale({
        code: order.code || order.id,
        tableNumber: selectedTable.number,
        comandaName: selectedSession?.customerName,
        customerPhone: order.customerPhone || selectedSession?.customerPhone,
        waiterName: order.waiterName || selectedSession?.waiterName,
        items: order.items,
        notes: order.notes,
        createdAt: order.createdAt,
      });
      setReceiptSale(sale);
    },
    [selectedSession, selectedTable]
  );

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading="Mesas"
        links={[
          { name: 'Dashboard', href: paths.dashboard.root },
          { name: 'PDV', href: paths.dashboard.pos.root },
          { name: 'Mesas' },
        ]}
        action={
          <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
            <Button
              variant={globalTablesEnabled ? 'soft' : 'contained'}
              color={globalTablesEnabled ? 'success' : 'error'}
              startIcon={<Iconify icon="solar:power-bold" />}
              onClick={handleToggleGlobalTables}
            >
              {globalTablesEnabled ? 'Mesas Liberadas' : 'Mesas Bloqueadas'}
            </Button>

            <Button
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
              onClick={() => {
                setEditingTable(null);
                setFormOpen(true);
              }}
            >
              Nova Mesa
            </Button>
          </Stack>
        }
        sx={{ mb: { xs: 3, md: 4 } }}
      />

      {!enterpriseId ? (
        <EmptyContent filled title="Nenhuma empresa vinculada" />
      ) : (
        <Stack spacing={3}>
          {!hasOpenCash && (
            <Alert
              severity="warning"
              action={
                <Button
                  component={RouterLink}
                  href={paths.dashboard.cash.root}
                  color="inherit"
                  size="small"
                  variant="outlined"
                >
                  Abrir Caixa
                </Button>
              }
            >
              <strong>Caixa fechado!</strong> Abra o caixa antes de lançar ou encerrar comandas de
              mesas.
            </Alert>
          )}

          {/* 4 Analytics Strip (Padrão Minimals ERP) */}
          <Card>
            <Scrollbar sx={{ minHeight: 108 }}>
              <Stack
                direction="row"
                divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />}
                sx={{ py: 2.5 }}
              >
                <ErpTableAnalytic
                  title="Total de Mesas"
                  primaryValue={`${tables.length}`}
                  secondaryValue="Mesas digitais ativas"
                  percent={100}
                  icon="ic:round-table-restaurant"
                  color={theme.vars.palette.info.main}
                />
                <ErpTableAnalytic
                  title="Livres"
                  primaryValue={`${availableCount}`}
                  secondaryValue="Disponíveis no salão"
                  percent={tables.length ? (availableCount / tables.length) * 100 : 0}
                  icon="solar:check-circle-bold-duotone"
                  color={theme.vars.palette.success.main}
                />
                <ErpTableAnalytic
                  title="Em Aberto"
                  primaryValue={`${occupiedCount}`}
                  secondaryValue={`${openSessions.length} comanda(s) ativa(s)`}
                  percent={tables.length ? (occupiedCount / tables.length) * 100 : 0}
                  icon="solar:fire-bold-duotone"
                  color={theme.vars.palette.warning.main}
                />
                <ErpTableAnalytic
                  title="Consumo Aberto"
                  primaryValue={fCurrency(openTotalAmount)}
                  secondaryValue={`${openSessions.length} comanda(s)`}
                  percent={100}
                  icon="solar:wallet-money-bold-duotone"
                  color={theme.vars.palette.primary.main}
                />
              </Stack>
            </Scrollbar>
          </Card>

          {/* Grid de Mesas */}
          {loading ? (
            <Box
              display="grid"
              gap={2.5}
              gridTemplateColumns={{
                xs: 'repeat(1, 1fr)',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(4, 1fr)',
              }}
            >
              {[...Array(4)].map((_, idx) => (
                <Skeleton key={idx} animation="wave" variant="rounded" height={196} />
              ))}
            </Box>
          ) : tables.length === 0 ? (
            <EmptyContent
              filled
              title="Nenhuma mesa cadastrada"
              description="Crie sua primeira mesa para gerar o QR Code exclusivo e liberar o atendimento do garçom."
              sx={{ py: 8 }}
            />
          ) : (
            <Box
              display="grid"
              gap={2.5}
              gridTemplateColumns={{
                xs: 'repeat(1, 1fr)',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(4, 1fr)',
              }}
            >
              {tables.map((tbl) => {
                const tableSessions = sessionsByTableId.get(tbl.id) ?? [];
                const isOccupied = tbl.status === 'occupied' || tableSessions.length > 0;
                const isTableStopped = !tbl.acceptingOrders || !globalTablesEnabled;
                const tableTotal = tableSessions.reduce((acc, s) => acc + Number(s.total || 0), 0);
                const firstSess = tableSessions[0];

                return (
                  <Card
                    key={tbl.id}
                    sx={{
                      p: 2.5,
                      border: `1.5px solid ${
                        isTableStopped
                          ? varAlpha(theme.vars.palette.error.mainChannel, 0.6)
                          : isOccupied
                            ? varAlpha(theme.vars.palette.warning.mainChannel, 0.5)
                            : varAlpha(theme.vars.palette.success.mainChannel, 0.32)
                      }`,
                      transition: 'transform 0.15s, box-shadow 0.15s',
                      '&:hover': { boxShadow: theme.customShadows.z8 },
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 1.25,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            color:
                              !tbl.acceptingOrders || !globalTablesEnabled
                                ? 'error.main'
                                : isOccupied
                                  ? 'warning.main'
                                  : 'success.main',
                            bgcolor: varAlpha(
                              !tbl.acceptingOrders || !globalTablesEnabled
                                ? theme.vars.palette.error.mainChannel
                                : isOccupied
                                  ? theme.vars.palette.warning.mainChannel
                                  : theme.vars.palette.success.mainChannel,
                              0.12
                            ),
                          }}
                        >
                          <Iconify
                            icon={
                              /bar|balc/i.test(tbl.area || '')
                                ? 'ic:baseline-table-bar'
                                : 'ic:round-table-restaurant'
                            }
                            width={24}
                          />
                        </Box>

                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Tooltip
                            title={
                              tbl.acceptingOrders
                                ? 'Mesa ligada — clique para pausar pedidos'
                                : 'Mesa desligada — clique para liberar pedidos'
                            }
                          >
                            <IconButton
                              size="small"
                              color={tbl.acceptingOrders && globalTablesEnabled ? 'success' : 'error'}
                              onClick={() => handleToggleSingleTablePower(tbl)}
                              sx={{
                                bgcolor: varAlpha(
                                  tbl.acceptingOrders && globalTablesEnabled
                                    ? theme.vars.palette.success.mainChannel
                                    : theme.vars.palette.error.mainChannel,
                                  0.14
                                ),
                              }}
                            >
                              <Iconify icon="solar:power-bold" width={16} />
                            </IconButton>
                          </Tooltip>

                          <Label
                            variant="filled"
                            color={
                              isTableStopped
                                ? 'error'
                                : isOccupied
                                  ? 'warning'
                                  : 'success'
                            }
                          >
                            {!globalTablesEnabled
                              ? 'Fechada'
                              : !tbl.acceptingOrders
                                ? 'Pausada'
                                : isOccupied
                                  ? 'Aberta'
                                  : 'Livre'}
                          </Label>
                        </Stack>
                      </Stack>

                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h5" noWrap sx={{ fontWeight: 800 }}>
                          Mesa {tbl.number}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {[tbl.area, tbl.capacity ? `${tbl.capacity} lugares` : null]
                            .filter(Boolean)
                            .join(' · ') || 'Salão principal'}
                        </Typography>
                      </Box>

                      {isOccupied && tableSessions.length > 0 ? (
                        <Box
                          sx={{
                            p: 1.25,
                            borderRadius: 1.25,
                            bgcolor: varAlpha(theme.vars.palette.warning.mainChannel, 0.1),
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                            <Typography
                              variant="subtitle1"
                              color="warning.darker"
                              sx={{ fontWeight: 800 }}
                            >
                              {fCurrency(tableTotal)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {tableSessions.length}{' '}
                              {tableSessions.length === 1 ? 'comanda' : 'comandas'}
                            </Typography>
                          </Stack>

                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                            {tableSessions.map((s, idx) => (
                              <Chip
                                key={s.id}
                                size="small"
                                label={`${s.customerName || `#${idx + 1}`} · ${fCurrency(s.total)}`}
                                onClick={() => {
                                  setSelectedTableId(tbl.id);
                                  setSelectedSessionId(s.id);
                                }}
                                sx={{ height: 22, fontSize: 11 }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.disabled" sx={{ py: 1.25 }}>
                          Pronta para receber clientes ou pedidos do garçom.
                        </Typography>
                      )}

                      <Stack direction="row" spacing={0.75}>
                        <Button
                          fullWidth
                          variant={isOccupied ? 'contained' : 'soft'}
                          color={isOccupied ? 'warning' : 'primary'}
                          onClick={() => {
                            setSelectedTableId(tbl.id);
                            setSelectedSessionId(firstSess?.id || null);
                          }}
                          startIcon={<Iconify icon="solar:clipboard-list-bold-duotone" width={17} />}
                        >
                          {isOccupied ? 'Comandas' : 'Pedir'}
                        </Button>

                        {isOccupied && firstSess && (
                          <Tooltip
                            title={
                              tableSessions.length > 1
                                ? 'Escolher comanda para imprimir'
                                : 'Imprimir comanda / pré-conta'
                            }
                          >
                            <IconButton
                              color="primary"
                              onClick={(e) => {
                                if (tableSessions.length === 1) {
                                  const sessOrds = orders.filter(
                                    (o) => o.tableSessionId === firstSess.id
                                  );
                                  handlePrintSessionComanda(tbl, firstSess, sessOrds, false);
                                } else {
                                  setPrintMenuTable(tbl);
                                  printPopover.onOpen(e);
                                }
                              }}
                              sx={{
                                border: `1px solid ${varAlpha(theme.vars.palette.primary.mainChannel, 0.36)}`,
                                borderRadius: 1,
                              }}
                            >
                              <Iconify icon="solar:printer-minimalistic-bold" width={18} />
                            </IconButton>
                          </Tooltip>
                        )}

                        <Tooltip title="QR Code exclusivo da mesa">
                          <IconButton
                            color="info"
                            onClick={() => setQrTable(tbl)}
                            sx={{
                              border: `1px solid ${varAlpha(theme.vars.palette.info.mainChannel, 0.36)}`,
                              borderRadius: 1,
                            }}
                          >
                            <Iconify icon="solar:qr-code-bold" width={18} />
                          </IconButton>
                        </Tooltip>
                        {!isOccupied && !firstSess && (
                        <Tooltip title="Editar mesa">
                          <IconButton
                            onClick={() => {
                              setEditingTable(tbl);
                              setFormOpen(true);
                            }}
                          >
                            <Iconify icon="solar:pen-bold" />
                          </IconButton>
                        </Tooltip>
                        )}
                      </Stack>
                    </Stack>
                  </Card>
                );
              })}
            </Box>
          )}
        </Stack>
      )}

      <TableFormDialog
        open={formOpen}
        currentTable={editingTable}
        busy={busy}
        onClose={() => {
          setFormOpen(false);
          setEditingTable(null);
        }}
        onSubmit={handleSaveTable}
      />

      <TableQrDialog
        open={Boolean(qrTable)}
        table={qrTable}
        storeSlug={enterprise?.onlineStore?.slug}
        storeName={enterprise?.tradeName || enterprise?.name}
        onClose={() => setQrTable(null)}
      />

      <TableSessionDrawer
        open={Boolean(selectedTable)}
        table={selectedTable}
        sessions={selectedTableSessions}
        selectedSessionId={selectedSession?.id || null}
        sessionOrders={selectedSessionOrders}
        products={products}
        productsLoading={productsLoading}
        busy={busy}
        onSelectSession={(id) => setSelectedSessionId(id)}
        onCreateSession={handleCreateIndividualSession}
        onClose={() => {
          setSelectedTableId(null);
          setSelectedSessionId(null);
        }}
        onSubmitOrder={handleSubmitWaiterOrder}
        onCloseTable={handleCloseTable}
        onPrintComanda={(includeFee) => {
          if (selectedTable && selectedSession) {
            handlePrintSessionComanda(
              selectedTable,
              selectedSession,
              selectedSessionOrders,
              includeFee
            );
          }
        }}
        onPrintSingleOrder={handlePrintSingleOrder}
      />

      {/* Popover de seleção da comanda ao clicar em Imprimir (quando há 2+ comandas na mesa) */}
      <CustomPopover
        open={printPopover.open}
        anchorEl={printPopover.anchorEl}
        onClose={() => {
          printPopover.onClose();
          setPrintMenuTable(null);
        }}
        slotProps={{ arrow: { placement: 'top-right' } }}
      >
        {printMenuTable && (
          <MenuList sx={{ minWidth: 230 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ px: 2, py: 0.75, display: 'block' }}
            >
              Imprimir · Mesa {printMenuTable.number}
            </Typography>
            {(sessionsByTableId.get(printMenuTable.id) ?? []).map((sess, idx) => (
              <MenuItem
                key={sess.id}
                onClick={() => {
                  const sessOrds = orders.filter((o) => o.tableSessionId === sess.id);
                  printPopover.onClose();
                  setPrintMenuTable(null);
                  handlePrintSessionComanda(printMenuTable, sess, sessOrds, false);
                }}
              >
                <Iconify icon="solar:printer-minimalistic-bold" width={18} sx={{ color: 'primary.main' }} />
                <Stack direction="row" justifyContent="space-between" spacing={1.5} sx={{ width: 1 }}>
                  <Typography variant="body2" noWrap>
                    {sess.customerName || `Comanda #${idx + 1}`}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                    {fCurrency(sess.total)}
                  </Typography>
                </Stack>
              </MenuItem>
            ))}

            <Divider sx={{ borderStyle: 'dashed', my: 0.5 }} />

            <MenuItem
              onClick={() => {
                const list = sessionsByTableId.get(printMenuTable.id) ?? [];
                printPopover.onClose();
                setPrintMenuTable(null);
                handlePrintAllTableComandas(printMenuTable, list);
              }}
            >
              <Iconify icon="solar:documents-bold-duotone" width={18} sx={{ color: 'info.main' }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Todas as comandas (Mesa completa)
              </Typography>
            </MenuItem>
          </MenuList>
        )}
      </CustomPopover>

      {receiptSale && (
        <ReceiptDialog
          open={Boolean(receiptSale)}
          onClose={() => setReceiptSale(null)}
          sale={receiptSale}
          enterprise={enterprise}
        />
      )}
    </DashboardContent>
  );
}

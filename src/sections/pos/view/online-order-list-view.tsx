import type { OnlineOrder } from 'src/api/firestore/online-orders';

import { useRef, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Tabs from '@mui/material/Tabs';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  acceptOnlineOrderCf,
  rejectOnlineOrderCf,
  subscribeOnlineOrders,
} from 'src/api/firestore/online-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Scrollbar } from 'src/components/scrollbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import {
  useTable,
  emptyRows,
  TableNoData,
  TableEmptyRows,
  TableHeadCustom,
  TablePaginationCustom,
} from 'src/components/table';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type StatusTab = 'pending' | 'accepted' | 'rejected' | 'all';

function playNewOrderSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 220);
  } catch {
    // ignore audio failures
  }
}

// ----------------------------------------------------------------------

export function OnlineOrderListView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const table = useTable({ defaultOrderBy: 'createdAt' });
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [rows, setRows] = useState<OnlineOrder[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const seenPending = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (!enterpriseId) return undefined;
    const unsub = subscribeOnlineOrders(enterpriseId, (next) => {
      setRows(next);
      const pendingIds = next.filter((o) => o.status === 'pending').map((o) => o.id);
      if (!primed.current) {
        pendingIds.forEach((id) => seenPending.current.add(id));
        primed.current = true;
        return;
      }
      const fresh = pendingIds.filter((id) => !seenPending.current.has(id));
      if (fresh.length > 0) {
        fresh.forEach((id) => seenPending.current.add(id));
        toast.info(t('onlineOrders.newOrderToast'));
        playNewOrderSound();
      }
    });
    return unsub;
  }, [enterpriseId, t]);

  const filtered = rows.filter((row) => (statusTab === 'all' ? true : row.status === statusTab));
  const pageRows = filtered.slice(
    table.page * table.rowsPerPage,
    table.page * table.rowsPerPage + table.rowsPerPage
  );

  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
    accepted: rows.filter((r) => r.status === 'accepted').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    all: rows.length,
  };

  const handleAccept = useCallback(
    async (orderId: string) => {
      if (!enterpriseId) return;
      setBusyId(orderId);
      try {
        const { saleId } = await acceptOnlineOrderCf(enterpriseId, orderId);
        toast.success(t('onlineOrders.acceptSuccess'));
        router.push(paths.dashboard.pos.saleDetails(saleId));
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, t('onlineOrders.acceptError')));
      } finally {
        setBusyId(null);
      }
    },
    [enterpriseId, router, t]
  );

  const handleReject = useCallback(
    async (orderId: string) => {
      if (!enterpriseId) return;
      setBusyId(orderId);
      try {
        await rejectOnlineOrderCf(enterpriseId, orderId);
        toast.success(t('onlineOrders.rejectSuccess'));
      } catch (error) {
        toast.error(getFirebaseErrorMessage(error, t('onlineOrders.rejectError')));
      } finally {
        setBusyId(null);
      }
    },
    [enterpriseId, t]
  );

  const TABLE_HEAD = [
    { id: 'code', label: t('onlineOrders.fields.code') },
    { id: 'customer', label: t('onlineOrders.fields.customer') },
    { id: 'total', label: t('onlineOrders.fields.total') },
    { id: 'status', label: t('onlineOrders.fields.status') },
    { id: 'actions', label: '', width: 220 },
  ];

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('onlineOrders.heading')}
        links={[
          { name: t('nav.dashboard', { defaultValue: 'Dashboard' }), href: paths.dashboard.root },
          { name: t('nav.pos'), href: paths.dashboard.pos.root },
          { name: t('onlineOrders.heading') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <Card>
        <Tabs
          value={statusTab}
          onChange={(_, value: StatusTab) => {
            setStatusTab(value);
            table.onResetPage();
          }}
          sx={{ px: 2.5, boxShadow: (theme) => `inset 0 -2px 0 0 ${theme.vars.palette.divider}` }}
        >
          {(['pending', 'accepted', 'rejected', 'all'] as StatusTab[]).map((key) => (
            <Tab
              key={key}
              value={key}
              label={t(`onlineOrders.tabs.${key}`)}
              icon={
                <Label variant={statusTab === key || key === 'all' ? 'filled' : 'soft'} color="default">
                  {counts[key]}
                </Label>
              }
              iconPosition="end"
            />
          ))}
        </Tabs>

        <Box sx={{ position: 'relative' }}>
          <Scrollbar>
            <Table size={table.dense ? 'small' : 'medium'} sx={{ minWidth: 800 }}>
              <TableHeadCustom headLabel={TABLE_HEAD} />
              <TableBody>
                {pageRows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{row.code}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.deliveryType} · {row.paymentMethod}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.customerName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.customerPhone}
                      </Typography>
                    </TableCell>
                    <TableCell>{fCurrency(row.total)}</TableCell>
                    <TableCell>
                      <Label
                        color={
                          row.status === 'pending'
                            ? 'warning'
                            : row.status === 'accepted'
                              ? 'success'
                              : 'error'
                        }
                      >
                        {row.status}
                      </Label>
                    </TableCell>
                    <TableCell align="right">
                      {row.status === 'pending' ? (
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={busyId === row.id}
                            onClick={() => handleAccept(row.id)}
                          >
                            {t('onlineOrders.accept')}
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={busyId === row.id}
                            onClick={() => handleReject(row.id)}
                          >
                            {t('onlineOrders.reject')}
                          </Button>
                        </Box>
                      ) : row.saleId ? (
                        <Button
                          size="small"
                          onClick={() => router.push(paths.dashboard.pos.saleDetails(row.saleId!))}
                        >
                          {t('onlineOrders.viewSale')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
                <TableEmptyRows
                  height={table.dense ? 56 : 76}
                  emptyRows={emptyRows(table.page, table.rowsPerPage, filtered.length)}
                />
                <TableNoData notFound={!filtered.length} />
              </TableBody>
            </Table>
          </Scrollbar>
        </Box>

        <TablePaginationCustom
          page={table.page}
          dense={table.dense}
          count={filtered.length}
          rowsPerPage={table.rowsPerPage}
          onPageChange={table.onChangePage}
          onChangeDense={table.onChangeDense}
          onRowsPerPageChange={table.onChangeRowsPerPage}
        />
      </Card>
    </DashboardContent>
  );
}

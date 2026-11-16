import type { ProcessingOrder } from 'src/api/firestore/processing-orders';

import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { fDateTime } from 'src/utils/format-time';
import { fCurrency, fNumber } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { getProcessingOrder } from 'src/api/firestore/processing-orders';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

type Props = {
  orderId: string;
};

export function ProcessingDetailsView({ orderId }: Props) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<ProcessingOrder | null>(null);

  const loadOrder = useCallback(async () => {
    if (!enterpriseId || !orderId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getProcessingOrder(enterpriseId, orderId);
      setOrder(data);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('processing.loadError')));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, orderId, t]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  if (!loading && !order) {
    return (
      <DashboardContent>
        <EmptyContent filled title={t('processing.notFound')} sx={{ py: 10 }} />
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={order?.code || t('processing.detailsHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.processing'), href: paths.dashboard.processing.list },
          { name: order?.code || orderId },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.batches.list}
            variant="outlined"
            startIcon={<Iconify icon="solar:box-bold" />}
          >
            {t('nav.batchesList')}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      {order && (
        <Stack spacing={3}>
          <Card sx={{ p: 3 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ sm: 'center' }}
              spacing={2}
            >
              <Box>
                <Typography variant="h6">{order.code}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {fDateTime(order.createdAt)}
                </Typography>
              </Box>
              <Label
                color={order.status === 'completed' ? 'success' : 'error'}
                variant="soft"
              >
                {order.status === 'completed'
                  ? t('processing.status.completed')
                  : t('processing.status.cancelled')}
              </Label>
            </Stack>

            <Divider sx={{ my: 2.5 }} />

            <Box
              columnGap={3}
              rowGap={2}
              display="grid"
              gridTemplateColumns={{ xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('processing.fields.rawProduct')}
                </Typography>
                <Typography variant="subtitle2">
                  {order.rawProductName} ({order.rawProductSku})
                </Typography>
                {order.rawLotCode && (
                  <Typography variant="caption" color="text.secondary">
                    {t('processing.fields.rawBatch')}: {order.rawLotCode}
                  </Typography>
                )}
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('processing.fields.rawQtyUsed')}
                </Typography>
                <Typography variant="subtitle2">
                  {fNumber(order.rawQtyUsed)} {order.rawUnit} × {fCurrency(order.rawUnitCost)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('processing.fields.extraCost')}
                </Typography>
                <Typography variant="subtitle2">{fCurrency(order.extraCost)}</Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('processing.fields.totalCost')}
                </Typography>
                <Typography variant="subtitle1" color="primary.main">
                  {fCurrency(order.totalCost)}
                </Typography>
              </Box>
            </Box>
          </Card>

          <Card>
            <CardHeader
              title={t('processing.outputsSectionTitle')}
              subheader={`${t('processing.fields.totalOutputQty')}: ${fNumber(order.totalOutputQty)}`}
              sx={{ mb: 2 }}
            />
            <Divider />
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('processing.fields.lotCode')}</TableCell>
                  <TableCell>{t('processing.fields.outputProduct')}</TableCell>
                  <TableCell align="right">{t('processing.fields.outputQty')}</TableCell>
                  <TableCell align="right">{t('processing.fields.weightFactor')}</TableCell>
                  <TableCell align="right">{t('processing.fields.allocatedTotalCost')}</TableCell>
                  <TableCell align="right">{t('processing.fields.allocatedUnitCost')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {order.outputs.map((item) => (
                  <TableRow key={item.batchId || item.lotCode}>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {item.lotCode}
                    </TableCell>
                    <TableCell>
                      {item.productName} {item.variant ? `(${item.variant})` : ''}
                    </TableCell>
                    <TableCell align="right">
                      {fNumber(item.qty)} {item.unit}
                    </TableCell>
                    <TableCell align="right">{item.weightFactor}x</TableCell>
                    <TableCell align="right">{fCurrency(item.allocatedTotalCost)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {fCurrency(item.allocatedUnitCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Stack>
      )}
    </DashboardContent>
  );
}

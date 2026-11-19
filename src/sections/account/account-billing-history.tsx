import type { SubscriptionInvoice } from 'src/api/firestore/billing';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import ListItemText from '@mui/material/ListItemText';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDate } from 'src/utils/format-time';
import { fCurrency } from 'src/utils/format-number';

import { useTranslate } from 'src/locales';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  invoices: SubscriptionInvoice[];
};

function formatShortInvoiceId(rawId: string): string {
  const clean = String(rawId || '').trim();
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

export function AccountBillingHistory({ invoices }: Props) {
  const { t } = useTranslate('common');
  const showMore = useBoolean();

  return (
    <Card>
      <CardHeader title={t('billing.invoices')} />

      <Stack spacing={1.5} sx={{ px: 3, pt: 3 }}>
        {(showMore.value ? invoices : invoices.slice(0, 8)).map((invoice) => {
          const fullId = invoice.asaasPaymentId || invoice.id;
          const shortId = formatShortInvoiceId(fullId);

          return (
            <Box
              key={invoice.id}
              sx={{
                gap: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ListItemText
                sx={{ minWidth: 0, flex: 1, mr: 0.5 }}
                primary={
                  <Tooltip title={fullId} placement="top" arrow>
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-block',
                        maxWidth: 110,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        verticalAlign: 'bottom',
                      }}
                    >
                      {shortId}
                    </Box>
                  </Tooltip>
                }
                secondary={`${invoice.status} · ${invoice.billingType || '—'}`}
                primaryTypographyProps={{ typography: 'caption', fontWeight: 600, noWrap: true }}
                secondaryTypographyProps={{
                  mt: 0.25,
                  noWrap: true,
                  component: 'span',
                  typography: 'caption',
                  color: 'text.disabled',
                }}
              />

              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                {invoice.dueDate ? fDate(invoice.dueDate) : '—'}
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  textAlign: 'right',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  minWidth: 64,
                }}
              >
                {fCurrency(invoice.value)}
              </Typography>

              {invoice.invoiceUrl ? (
                <Link
                  color="inherit"
                  underline="always"
                  variant="caption"
                  href={invoice.invoiceUrl}
                  target="_blank"
                  rel="noopener"
                  sx={{ flexShrink: 0, ml: 0.5 }}
                >
                  PDF
                </Link>
              ) : (
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ flexShrink: 0, ml: 0.5, width: 24, textAlign: 'center' }}
                >
                  —
                </Typography>
              )}
            </Box>
          );
        })}

        {!invoices.length && (
          <Typography variant="body2" color="text.secondary">
            —
          </Typography>
        )}

        <Divider sx={{ borderStyle: 'dashed' }} />
      </Stack>

      {invoices.length > 8 && (
        <Stack alignItems="flex-start" sx={{ p: 2 }}>
          <Button
            size="small"
            color="inherit"
            startIcon={
              <Iconify
                width={16}
                icon={
                  showMore.value ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'
                }
                sx={{ mr: -0.5 }}
              />
            }
            onClick={showMore.onToggle}
          >
            {showMore.value ? t('billing.showLess') : t('billing.showMore')}
          </Button>
        </Stack>
      )}
    </Card>
  );
}

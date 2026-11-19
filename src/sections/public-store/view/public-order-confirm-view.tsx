import { useParams, useLocation, Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';

// ----------------------------------------------------------------------

export function PublicOrderConfirmView() {
  const { slug = '' } = useParams();
  const { t } = useTranslate('common');
  const location = useLocation();
  const state = (location.state || {}) as { code?: string; whatsapp?: string };
  const code = state.code || '';
  const whatsapp = state.whatsapp?.replace(/\D/g, '');

  return (
    <Box sx={{ p: 3, maxWidth: 480, mx: 'auto', textAlign: 'center' }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        {t('publicStore.orderReceived')}
      </Typography>
      {code && (
        <Typography variant="h6" color="primary.main" sx={{ mb: 2 }}>
          {code}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('publicStore.orderPendingHint')}
      </Typography>
      <Stack spacing={1.5}>
        {whatsapp && (
          <Button
            variant="contained"
            color="success"
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
              t('publicStore.whatsappMessage', { code })
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('publicStore.whatsappCta')}
          </Button>
        )}
        <Button component={RouterLink} to={paths.publicStore.root(slug)} variant="outlined">
          {t('publicStore.backToMenu')}
        </Button>
      </Stack>
    </Box>
  );
}

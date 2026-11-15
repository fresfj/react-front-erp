import Alert from '@mui/material/Alert';

import { useTranslate } from 'src/locales';

import { useOfflineStatus } from 'src/hooks/use-offline-status';

export function OfflineBanner() {
  const { t } = useTranslate('common');
  const { isOffline } = useOfflineStatus();

  if (!isOffline) {
    return null;
  }

  return (
    <Alert severity="warning" sx={{ borderRadius: 0 }}>
      {t('offline.mode')}
    </Alert>
  );
}
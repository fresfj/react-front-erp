import Alert from '@mui/material/Alert';

import { useOfflineStatus } from 'src/hooks/use-offline-status';

import { useTranslate } from 'src/locales';

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
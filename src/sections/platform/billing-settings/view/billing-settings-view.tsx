import type { PlatformBillingSettings } from 'src/api/firestore/billing';

import { useState, useEffect, useCallback } from 'react';

import { paths } from 'src/routes/paths';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { getBillingSettings } from 'src/api/firestore/billing';

import { toast } from 'src/components/snackbar';
import { LoadingScreen } from 'src/components/loading-screen';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { BillingSettingsForm } from '../billing-settings-form';

// ----------------------------------------------------------------------

export function BillingSettingsView() {
  const { t } = useTranslate('common');
  const [settings, setSettings] = useState<PlatformBillingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await getBillingSettings());
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('billing.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingScreen />;

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('billing.settingsTitle')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('billing.settingsTitle') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />
      <BillingSettingsForm current={settings} onSaved={setSettings} />
    </DashboardContent>
  );
}

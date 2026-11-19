import type { PlatformBillingSettings } from 'src/api/firestore/billing';

import { useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import CardHeader from '@mui/material/CardHeader';

import { paths } from 'src/routes/paths';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { getBillingSettings } from 'src/api/firestore/billing';
import {
  getCachedBilling,
  peekBillingCache,
  invalidateBillingCache,
} from 'src/api/firestore/billing-cache';

import { toast } from 'src/components/snackbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { BillingSettingsForm } from '../billing-settings-form';
import { EvolutionSettingsCard } from '../evolution-settings-card';

// ----------------------------------------------------------------------

const CACHE_KEY = 'billing-settings';

function BillingSettingsSkeleton() {
  return (
    <Card>
      <CardHeader title={<Skeleton width={180} />} />
      <Stack spacing={2} sx={{ p: 3 }}>
        <Skeleton height={56} />
        <Skeleton height={56} />
        <Skeleton height={56} />
        <Skeleton height={40} width={120} />
      </Stack>
    </Card>
  );
}

export function BillingSettingsView() {
  const { t } = useTranslate('common');
  const [settings, setSettings] = useState<PlatformBillingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (force = false) => {
      if (!force) {
        const peek = peekBillingCache<PlatformBillingSettings | null>(CACHE_KEY, 60_000);
        if (peek !== undefined) {
          setSettings(peek);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      try {
        const data = await getCachedBilling(CACHE_KEY, () => getBillingSettings(), {
          force,
          ttlMs: 60_000,
        });
        setSettings(data);
      } catch (error) {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, t('billing.loadError')));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    load(false).catch(() => undefined);
  }, [load]);

  const handleSaved = (next: PlatformBillingSettings) => {
    invalidateBillingCache(CACHE_KEY);
    setSettings(next);
  };

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
      {loading && settings === null ? (
        <BillingSettingsSkeleton />
      ) : (
        <>
          <BillingSettingsForm current={settings} onSaved={handleSaved} />
          <EvolutionSettingsCard />
        </>
      )}
    </DashboardContent>
  );
}

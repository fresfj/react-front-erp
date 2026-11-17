import type { Plan } from 'src/api/firestore/plans';

import { useState, useEffect } from 'react';

import { paths } from 'src/routes/paths';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { getPlan } from 'src/api/firestore/plans';
import { DashboardContent } from 'src/layouts/dashboard';

import { toast } from 'src/components/snackbar';
import { LoadingScreen } from 'src/components/loading-screen';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { PlanForm } from '../plan-form';

// ----------------------------------------------------------------------

type Props = { id: string };

export function PlanEditView({ id }: Props) {
  const { t } = useTranslate('common');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await getPlan(id);
        if (!cancelled) setPlan(row);
      } catch (error) {
        console.error(error);
        toast.error(getFirebaseErrorMessage(error, t('billing.loadError')));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  if (loading) return <LoadingScreen />;

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('billing.plansEditHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('billing.plansTitle'), href: paths.dashboard.plans.list },
          { name: plan?.name || id },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />
      {plan && <PlanForm currentPlan={plan} />}
    </DashboardContent>
  );
}

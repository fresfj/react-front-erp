import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { PlanForm } from '../plan-form';

// ----------------------------------------------------------------------

export function PlanCreateView() {
  const { t } = useTranslate('common');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('billing.plansCreateHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('billing.plansTitle'), href: paths.dashboard.plans.list },
          { name: t('billing.plansCreateHeading') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />
      <PlanForm />
    </DashboardContent>
  );
}

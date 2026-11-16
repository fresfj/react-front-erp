import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { BatchForm } from '../batch-form';

// ----------------------------------------------------------------------

export function BatchCreateView() {
  const { t } = useTranslate('common');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('batches.createHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.batches'), href: paths.dashboard.batches.list },
          { name: t('batches.createHeading') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <BatchForm />
    </DashboardContent>
  );
}

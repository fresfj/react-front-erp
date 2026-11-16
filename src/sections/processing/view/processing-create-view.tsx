import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { ProcessingForm } from '../processing-form';

// ----------------------------------------------------------------------

export function ProcessingCreateView() {
  const { t } = useTranslate('common');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('processing.createHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.processing'), href: paths.dashboard.processing.list },
          { name: t('processing.createHeading') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <ProcessingForm />
    </DashboardContent>
  );
}

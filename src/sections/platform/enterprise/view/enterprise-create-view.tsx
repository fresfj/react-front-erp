import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import { EnterpriseForm } from '../enterprise-form';

// ----------------------------------------------------------------------

export function EnterpriseCreateView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  if (!user?.platformAdmin) {
    return (
      <DashboardContent>
        <EmptyContent title={t('permission.deniedTitle')} description={t('permission.deniedBody')} />
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('enterprises.createHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.enterprises'), href: paths.dashboard.enterprises.list },
          { name: t('enterprises.createHeading') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />
      <EnterpriseForm />
    </DashboardContent>
  );
}

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { SupplierForm } from '../supplier-form';

// ----------------------------------------------------------------------

export function SupplierCreateView() {
  const { t } = useTranslate('common');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('suppliers.createHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('suppliers.title'), href: paths.dashboard.suppliers.root },
          { name: t('suppliers.listHeading'), href: paths.dashboard.suppliers.list },
          { name: t('suppliers.newSupplier') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <SupplierForm />
    </DashboardContent>
  );
}

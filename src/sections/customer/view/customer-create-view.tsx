import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { CustomerForm } from '../customer-form';

// ----------------------------------------------------------------------

export function CustomerCreateView() {
  const { t } = useTranslate('common');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('customers.createHeading', { defaultValue: 'Criar cliente' })}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          {
            name: t('nav.customers', { defaultValue: 'Clientes' }),
            href: paths.dashboard.customers.list,
          },
          { name: t('customers.createHeading', { defaultValue: 'Criar cliente' }) },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <CustomerForm />
    </DashboardContent>
  );
}

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { ProductForm } from '../product-form';

// ----------------------------------------------------------------------

export function ProductCreateView() {
  const { t } = useTranslate('common');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('products.createHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('products.title'), href: paths.dashboard.products.root },
          { name: t('products.listHeading'), href: paths.dashboard.products.list },
          { name: t('products.newProduct') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <ProductForm />
    </DashboardContent>
  );
}

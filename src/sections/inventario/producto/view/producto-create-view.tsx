import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import ProductoForm from '../producto-form';

// ----------------------------------------------------------------------

export function ProductoCreateView() {
  const { t } = useTranslate('common');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('inventory.createHeading')}
        links={[
          {
            name: t('inventory.products'),
            href: paths.dashboard.inventario.productos.root,
          },
          {
            name: t('inventory.listHeading'),
            href: paths.dashboard.inventario.productos.list,
          },
          { name: t('inventory.newProduct') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />
      <ProductoForm />
    </DashboardContent>
  );
}

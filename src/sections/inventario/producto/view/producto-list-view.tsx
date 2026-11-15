import { Card, Button } from '@mui/material';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import ProductosDTQ from '../producto-dtq';

// ----------------------------------------------------------------------

export function ProductoListView() {
  const { t } = useTranslate('common');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('inventory.listHeading')}
        links={[
          {
            name: t('inventory.products'),
            href: paths.dashboard.inventario.productos.root,
          },
          { name: t('inventory.listHeading') },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.inventario.productos.create}
            variant="contained"
            startIcon={<Iconify icon="mingcute:add-line" />}
          >
            {t('inventory.newProduct')}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />
      <Card>
        <ProductosDTQ />
      </Card>
    </DashboardContent>
  );
}

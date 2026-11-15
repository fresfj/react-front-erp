import type { IFindByUuid } from 'src/types/core';

import { useMemo, useState, useCallback } from 'react';

import { Tab, Tabs, Card } from '@mui/material';

import { paths } from 'src/routes/paths';
import { useParams } from 'src/routes/hooks';

import { varAlpha } from 'src/theme/styles';
import { useFindByUuid } from 'src/api/core';
import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import ProductoTrn from '../producto-trn';
import ProductoForm from '../producto-form';
import ProductoFiles from '../producto-files';
import ProductoPrecios from '../producto-precios';
import ProductoGraficos from '../producto-grafico';

// ----------------------------------------------------------------------

export function ProductoEditView() {
  const { t } = useTranslate('common');
  const params = useParams();
  const [currentTab, setCurrentTab] = useState('general');
  const { id } = params;

  const paramsFindByUuid: IFindByUuid = useMemo(
    () => ({
      tableName: 'inv_articulo',
      uuid: id || '',
    }),
    [id]
  );

  const { dataResponse: currentProduct } = useFindByUuid(paramsFindByUuid);

  const handleChangeTab = useCallback((_event: React.SyntheticEvent, newValue: string) => {
    setCurrentTab(newValue);
  }, []);

  const tabs = useMemo(
    () => [
      {
        value: 'general',
        label: t('inventory.tabs.general'),
        icon: <Iconify icon="icon-park-outline:id-card" width={24} />,
      },
      {
        value: 'transacciones',
        label: t('inventory.tabs.transactions'),
        icon: <Iconify icon="icon-park-outline:view-list" width={24} />,
      },
      {
        value: 'precios',
        label: t('inventory.tabs.prices'),
        icon: <Iconify icon="material-symbols:price-change-outline" width={24} />,
      },
      {
        value: 'archivos',
        label: t('inventory.tabs.files'),
        icon: <Iconify icon="material-symbols:folder-data-outline" width={24} />,
      },
      {
        value: 'estadisticas',
        label: t('inventory.tabs.stats'),
        icon: <Iconify icon="fluent-mdl2:b-i-dashboard" width={24} />,
      },
    ],
    [t]
  );

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('inventory.editHeading')}
        links={[
          {
            name: t('nav.inventory'),
            href: paths.dashboard.inventario.productos.root,
          },
          {
            name: t('inventory.listHeading'),
            href: paths.dashboard.inventario.productos.list,
          },
          { name: currentProduct?.nombre_inarti },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />
      <Card
        sx={{
          mb: { xs: 3, md: 5 },
        }}
      >
        <Tabs
          value={currentTab}
          onChange={handleChangeTab}
          sx={{
            px: 2.5,
            boxShadow: (theme) =>
              `inset 0 -2px 0 0 ${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)}`,
          }}
        >
          {tabs.map((tab) => (
            <Tab key={tab.value} label={tab.label} icon={tab.icon} value={tab.value} />
          ))}
        </Tabs>
      </Card>
      {currentTab === 'general' ? <ProductoForm currentProducto={currentProduct} /> : null}
      {currentTab === 'transacciones' ? <ProductoTrn currentProducto={currentProduct} /> : null}
      {currentTab === 'precios' ? <ProductoPrecios currentProducto={currentProduct} /> : null}
      {currentTab === 'archivos' ? <ProductoFiles currentProducto={currentProduct} /> : null}
      {currentTab === 'estadisticas' ? <ProductoGraficos currentProducto={currentProduct} /> : null}
    </DashboardContent>
  );
}

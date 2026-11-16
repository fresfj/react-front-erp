import type { Product } from 'src/api/firestore/products';

import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';
import { useParams } from 'src/routes/hooks';

import { useTranslate } from 'src/locales';
import { getProduct } from 'src/api/firestore/products';
import { DashboardContent } from 'src/layouts/dashboard';

import { toast } from 'src/components/snackbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import { ProductForm } from '../product-form';

// ----------------------------------------------------------------------

export function ProductEditView() {
  const { t } = useTranslate('common');
  const { id } = useParams();
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enterpriseId || !id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const product = await getProduct(enterpriseId, id);
        if (active) {
          setCurrentProduct(product);
        }
      } catch (error) {
        console.error(error);
        toast.error(t('products.loadError'));
        if (active) {
          setCurrentProduct(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [enterpriseId, id, t]);

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('products.editHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('products.title'), href: paths.dashboard.products.root },
          { name: t('products.listHeading'), href: paths.dashboard.products.list },
          { name: currentProduct?.name || t('products.editHeading') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : currentProduct ? (
        <ProductForm currentProduct={currentProduct} />
      ) : (
        <Typography color="text.secondary">{t('products.notFound')}</Typography>
      )}
    </DashboardContent>
  );
}

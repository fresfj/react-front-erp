import type { Supplier } from 'src/api/firestore/suppliers';

import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';
import { useParams } from 'src/routes/hooks';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { getSupplier } from 'src/api/firestore/suppliers';

import { toast } from 'src/components/snackbar';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import { SupplierForm } from '../supplier-form';

// ----------------------------------------------------------------------

export function SupplierEditView() {
  const { t } = useTranslate('common');
  const { id } = useParams();
  const { user } = useAuthContext();

  const enterpriseId = user?.enterpriseId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enterpriseId || !id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const supplier = await getSupplier(enterpriseId, id);
        if (active) {
          setCurrentSupplier(supplier);
        }
      } catch (error) {
        console.error(error);
        toast.error(t('suppliers.loadError'));
        if (active) {
          setCurrentSupplier(null);
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
        heading={t('suppliers.editHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('suppliers.title'), href: paths.dashboard.suppliers.root },
          { name: t('suppliers.listHeading'), href: paths.dashboard.suppliers.list },
          { name: currentSupplier?.name || t('suppliers.editHeading') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : currentSupplier ? (
        <SupplierForm currentSupplier={currentSupplier} />
      ) : (
        <Typography color="text.secondary">{t('suppliers.notFound')}</Typography>
      )}
    </DashboardContent>
  );
}

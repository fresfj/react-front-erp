import type { Enterprise } from 'src/api/firestore/platform';

import { useState, useEffect } from 'react';

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { getEnterprise } from 'src/api/firestore/platform';

import { toast } from 'src/components/snackbar';
import { EmptyContent } from 'src/components/empty-content';
import { LoadingScreen } from 'src/components/loading-screen';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import { EnterpriseForm } from '../enterprise-form';

// ----------------------------------------------------------------------

type Props = {
  enterpriseId: string;
};

export function EnterpriseEditView({ enterpriseId }: Props) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(true);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.platformAdmin || !enterpriseId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const row = await getEnterprise(enterpriseId);
        if (!cancelled) setEnterprise(row);
      } catch (error) {
        console.error(error);
        if (!cancelled) toast.error(t('enterprises.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [enterpriseId, t, user?.platformAdmin]);

  if (!user?.platformAdmin) {
    return (
      <DashboardContent>
        <EmptyContent title={t('permission.deniedTitle')} description={t('permission.deniedBody')} />
      </DashboardContent>
    );
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!enterprise) {
    return (
      <DashboardContent>
        <EmptyContent title={t('enterprises.notFound')} />
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('enterprises.editHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.enterprises'), href: paths.dashboard.enterprises.list },
          { name: enterprise.name, href: paths.dashboard.enterprises.details(enterprise.id) },
          { name: t('enterprises.editHeading') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />
      <EnterpriseForm currentEnterprise={enterprise} />
    </DashboardContent>
  );
}

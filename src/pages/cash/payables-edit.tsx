import type { Payable } from 'src/api/firestore/payables';

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import { paths } from 'src/routes/paths';
import { useParams } from 'src/routes/hooks';

import { CONFIG } from 'src/config-global';
import { getPayable } from 'src/api/firestore/payables';
import { DashboardContent } from 'src/layouts/dashboard';

import { LoadingScreen } from 'src/components/loading-screen';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { PayableForm } from 'src/sections/cash/payable-form';

import { useAuthContext } from 'src/auth/hooks';

const metadata = { title: `Editar conta a pagar - ${CONFIG.site.name}` };

export default function Page() {
  const { id = '' } = useParams();
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;
  const [current, setCurrent] = useState<Payable | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!enterpriseId || !id) return;
      try {
        const row = await getPayable(enterpriseId, id);
        if (!cancelled) setCurrent(row);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [enterpriseId, id]);

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>
      <DashboardContent>
        <CustomBreadcrumbs
          heading="Editar conta a pagar"
          links={[
            { name: 'Dashboard', href: paths.dashboard.root },
            { name: 'A pagar', href: paths.dashboard.cash.payables },
            { name: 'Editar' },
          ]}
          sx={{ mb: { xs: 3, md: 5 } }}
        />
        {current ? <PayableForm current={current} /> : null}
      </DashboardContent>
    </>
  );
}

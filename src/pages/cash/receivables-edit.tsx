import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { DashboardContent } from 'src/layouts/dashboard';
import { getReceivable } from 'src/api/firestore/receivables';
import type { Receivable } from 'src/api/firestore/receivables';

import { paths } from 'src/routes/paths';
import { useParams } from 'src/routes/hooks';

import { LoadingScreen } from 'src/components/loading-screen';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import { ReceivableForm } from 'src/sections/cash/receivable-form';

const metadata = { title: `Editar conta a receber - ${CONFIG.appName}` };

export default function Page() {
  const { id = '' } = useParams();
  const { user } = useAuthContext();
  const enterpriseId = user?.enterpriseId as string | undefined;
  const [current, setCurrent] = useState<Receivable | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!enterpriseId || !id) return;
      try {
        const row = await getReceivable(enterpriseId, id);
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
          heading="Editar conta a receber"
          links={[
            { name: 'Dashboard', href: paths.dashboard.root },
            { name: 'A receber', href: paths.dashboard.cash.receivables },
            { name: 'Editar' },
          ]}
          sx={{ mb: { xs: 3, md: 5 } }}
        />
        {current ? <ReceivableForm current={current} /> : null}
      </DashboardContent>
    </>
  );
}

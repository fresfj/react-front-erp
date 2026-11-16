import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { paths } from 'src/routes/paths';

import { ReceivableForm } from 'src/sections/cash/receivable-form';

const metadata = { title: `Nova conta a receber - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>
      <DashboardContent>
        <CustomBreadcrumbs
          heading="Nova conta a receber"
          links={[
            { name: 'Dashboard', href: paths.dashboard.root },
            { name: 'A receber', href: paths.dashboard.cash.receivables },
            { name: 'Nova' },
          ]}
          sx={{ mb: { xs: 3, md: 5 } }}
        />
        <ReceivableForm />
      </DashboardContent>
    </>
  );
}

import { Helmet } from 'react-helmet-async';

import { paths } from 'src/routes/paths';

import { CONFIG } from 'src/config-global';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { PayableForm } from 'src/sections/cash/payable-form';

const metadata = { title: `Nova conta a pagar - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>
      <DashboardContent>
        <CustomBreadcrumbs
          heading="Nova conta a pagar"
          links={[
            { name: 'Dashboard', href: paths.dashboard.root },
            { name: 'A pagar', href: paths.dashboard.cash.payables },
            { name: 'Nova' },
          ]}
          sx={{ mb: { xs: 3, md: 5 } }}
        />
        <PayableForm />
      </DashboardContent>
    </>
  );
}

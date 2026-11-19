import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { OverviewProductionView } from 'src/sections/overview/erp/view/overview-production-view';

// ----------------------------------------------------------------------

const metadata = { title: `Produção & Beneficiamento - ${CONFIG.site.name}` };

export default function OverviewProductionPage() {
  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>

      <OverviewProductionView />
    </>
  );
}

import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { OverviewSalesFinanceView } from 'src/sections/overview/erp/view/overview-sales-finance-view';

// ----------------------------------------------------------------------

const metadata = { title: `Vendas & Financeiro - ${CONFIG.site.name}` };

export default function OverviewSalesFinancePage() {
  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>

      <OverviewSalesFinanceView />
    </>
  );
}

import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { SellerRankingView } from 'src/sections/cash/view/seller-ranking-view';

// ----------------------------------------------------------------------

const metadata = { title: `Ranking | Financeiro - ${CONFIG.appName}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>

      <SellerRankingView />
    </>
  );
}

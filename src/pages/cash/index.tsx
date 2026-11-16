import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { CashSessionView } from 'src/sections/cash/view/cash-session-view';

// ----------------------------------------------------------------------

export default function CashSessionPage() {
  return (
    <>
      <Helmet>
        <title>{`Caixa e Fechamento Cego | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <CashSessionView />
    </>
  );
}

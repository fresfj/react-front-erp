import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { CashLedgerView } from 'src/sections/cash/view/cash-ledger-view';

// ----------------------------------------------------------------------

export default function CashLedgerPage() {
  return (
    <>
      <Helmet>
        <title>{`Extrato de caixa | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <CashLedgerView />
    </>
  );
}

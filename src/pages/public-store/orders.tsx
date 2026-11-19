import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { PublicOrdersView } from 'src/sections/public-store/view/public-orders-view';

// ----------------------------------------------------------------------

export default function PublicOrdersPage() {
  return (
    <>
      <Helmet>
        <title>{`Meus Pedidos | ${CONFIG.site.name}`}</title>
      </Helmet>

      <PublicOrdersView />
    </>
  );
}

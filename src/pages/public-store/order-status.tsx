import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { PublicOrderConfirmView } from 'src/sections/public-store/view/public-order-confirm-view';

// ----------------------------------------------------------------------

export default function PublicOrderStatusPage() {
  return (
    <>
      <Helmet>
        <title>{`Pedido | ${CONFIG.site.name}`}</title>
      </Helmet>

      <PublicOrderConfirmView />
    </>
  );
}

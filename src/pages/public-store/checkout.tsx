import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { PublicCheckoutView } from 'src/sections/public-store/view/public-checkout-view';

// ----------------------------------------------------------------------

export default function PublicCheckoutPage() {
  return (
    <>
      <Helmet>
        <title>{`Finalizar Pedido | ${CONFIG.site.name}`}</title>
      </Helmet>

      <PublicCheckoutView />
    </>
  );
}

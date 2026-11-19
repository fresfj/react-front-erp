import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { PublicCartProvider } from 'src/sections/public-store/public-cart-context';
import { PublicStorefrontView } from 'src/sections/public-store/view/public-storefront-view';

// ----------------------------------------------------------------------

export default function PublicStorefrontPage() {
  return (
    <>
      <Helmet>
        <title>{`Pedidos | ${CONFIG.site.name}`}</title>
      </Helmet>

      <PublicCartProvider>
        <PublicStorefrontView />
      </PublicCartProvider>
    </>
  );
}

import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { PublicStorefrontView } from 'src/sections/public-store/view/public-storefront-view';

// ----------------------------------------------------------------------

export default function PublicStorefrontPage() {
  return (
    <>
      <Helmet>
        <title>{`Pedidos | ${CONFIG.site.name}`}</title>
      </Helmet>

      <PublicStorefrontView />
    </>
  );
}

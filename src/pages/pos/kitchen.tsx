import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { KitchenKdsView } from 'src/sections/pos/kitchen/view/kitchen-kds-view';

// ----------------------------------------------------------------------

const metadata = { title: `Cozinha (KDS) | ${CONFIG.site.name}` };

export default function KitchenKdsPage() {
  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>

      <KitchenKdsView />
    </>
  );
}

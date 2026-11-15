import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { ProductoListView } from 'src/sections/inventario/producto/view';

// ----------------------------------------------------------------------

const metadata = { title: `Product list | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <ProductoListView />
    </>
  );
}

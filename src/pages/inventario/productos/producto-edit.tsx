import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { ProductoEditView } from 'src/sections/inventario/producto/view';

// ----------------------------------------------------------------------

const metadata = { title: `Product edit | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <ProductoEditView />
    </>
  );
}

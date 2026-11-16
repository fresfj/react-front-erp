import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { ProductListView } from 'src/sections/inventory/product/view';

// ----------------------------------------------------------------------

const metadata = { title: `Products | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <ProductListView />
    </>
  );
}

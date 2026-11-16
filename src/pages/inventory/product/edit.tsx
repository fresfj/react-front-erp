import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { ProductEditView } from 'src/sections/inventory/product/view';

// ----------------------------------------------------------------------

const metadata = { title: `Edit product | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <ProductEditView />
    </>
  );
}

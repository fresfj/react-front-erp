import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { SupplierEditView } from 'src/sections/supplier/view';

// ----------------------------------------------------------------------

const metadata = { title: `Edit supplier | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <SupplierEditView />
    </>
  );
}

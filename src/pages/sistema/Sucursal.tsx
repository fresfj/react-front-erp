import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { SucursalListView } from 'src/sections/sistema/sucursal/view';

// ----------------------------------------------------------------------

const metadata = { title: `Branches | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <SucursalListView />
    </>
  );
}
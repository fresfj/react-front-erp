import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { UsuarioListView } from 'src/sections/sistema/usuario/view';

// ----------------------------------------------------------------------

const metadata = { title: `User list | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <UsuarioListView />
    </>
  );
}

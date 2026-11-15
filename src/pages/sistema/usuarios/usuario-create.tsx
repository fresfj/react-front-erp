import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { UsuarioCreateView } from 'src/sections/sistema/usuario/view';

// ----------------------------------------------------------------------

const metadata = { title: `Create a new user | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <UsuarioCreateView />
    </>
  );
}

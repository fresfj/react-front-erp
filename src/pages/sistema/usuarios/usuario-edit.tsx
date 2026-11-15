import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { UsuarioEditView } from 'src/sections/sistema/usuario/view';

// ----------------------------------------------------------------------

const metadata = { title: `User edit | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <UsuarioEditView />
    </>
  );
}

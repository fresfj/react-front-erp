import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { EmpresaEditView } from 'src/sections/sistema/empresa/view';

// ----------------------------------------------------------------------

const metadata = { title: `Company | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <EmpresaEditView />
    </>
  );
}
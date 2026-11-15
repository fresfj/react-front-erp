import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { EventosAuditoriaView } from 'src/sections/auditoria/view';

// ----------------------------------------------------------------------

const metadata = { title: `Audit events | Dashboard - ${CONFIG.site.name}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <EventosAuditoriaView />
    </>
  );
}
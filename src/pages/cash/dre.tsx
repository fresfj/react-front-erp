import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { DreView } from 'src/sections/cash/view/dre-view';

// ----------------------------------------------------------------------

export default function DrePage() {
  return (
    <>
      <Helmet>
        <title>{`DRE Financeiro | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <DreView />
    </>
  );
}

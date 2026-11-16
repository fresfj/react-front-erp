import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { TeamListView } from 'src/sections/team/view/team-list-view';

// ----------------------------------------------------------------------

export default function TeamListPage() {
  return (
    <>
      <Helmet>
        <title>{`Colaboradores e Permissões | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <TeamListView />
    </>
  );
}

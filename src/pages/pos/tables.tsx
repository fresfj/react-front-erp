import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { TablesManagementView } from 'src/sections/pos/tables/view/tables-management-view';

// ----------------------------------------------------------------------

const metadata = { title: `Mesas | ${CONFIG.site.name}` };

export default function TablesManagementPage() {
  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>

      <TablesManagementView />
    </>
  );
}

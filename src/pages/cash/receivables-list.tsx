import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { ReceivableListView } from 'src/sections/cash/view/receivable-list-view';

const metadata = { title: `Contas a receber - ${CONFIG.appName}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>
      <ReceivableListView />
    </>
  );
}

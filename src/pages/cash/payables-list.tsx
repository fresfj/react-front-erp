import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';

import { PayableListView } from 'src/sections/cash/view/payable-list-view';

const metadata = { title: `Contas a pagar - ${CONFIG.appName}` };

export default function Page() {
  return (
    <>
      <Helmet>
        <title>{metadata.title}</title>
      </Helmet>
      <PayableListView />
    </>
  );
}

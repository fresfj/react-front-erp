import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { OnlineOrderListView } from 'src/sections/pos/view/online-order-list-view';

// ----------------------------------------------------------------------

export default function OnlineOrdersPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('onlineOrders.heading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <OnlineOrderListView />
    </>
  );
}

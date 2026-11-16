import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { SaleListView } from 'src/sections/pos/view/sale-list-view';

// ----------------------------------------------------------------------

export default function SaleListPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('pos.salesHeading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <SaleListView />
    </>
  );
}

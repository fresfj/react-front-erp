import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { StockMovementListView } from 'src/sections/batch/view/stock-movement-list-view';

// ----------------------------------------------------------------------

export default function StockMovementListPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('batches.movementsHeading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <StockMovementListView />
    </>
  );
}

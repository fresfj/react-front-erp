import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { BatchListView } from 'src/sections/batch/view/batch-list-view';

// ----------------------------------------------------------------------

export default function BatchListPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('batches.listHeading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <BatchListView />
    </>
  );
}

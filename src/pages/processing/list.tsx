import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { ProcessingListView } from 'src/sections/processing/view/processing-list-view';

// ----------------------------------------------------------------------

export default function ProcessingListPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('processing.listHeading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <ProcessingListView />
    </>
  );
}

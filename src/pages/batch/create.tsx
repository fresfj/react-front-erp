import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { BatchCreateView } from 'src/sections/batch/view/batch-create-view';

// ----------------------------------------------------------------------

export default function BatchCreatePage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('batches.createHeading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <BatchCreateView />
    </>
  );
}

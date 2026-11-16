import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { ProcessingCreateView } from 'src/sections/processing/view/processing-create-view';

// ----------------------------------------------------------------------

export default function ProcessingCreatePage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('processing.createHeading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <ProcessingCreateView />
    </>
  );
}

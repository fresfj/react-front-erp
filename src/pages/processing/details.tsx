import { Helmet } from 'react-helmet-async';

import { useParams } from 'src/routes/hooks';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { ProcessingDetailsView } from 'src/sections/processing/view/processing-details-view';

// ----------------------------------------------------------------------

export default function ProcessingDetailsPage() {
  const { t } = useTranslate('common');
  const { id = '' } = useParams();

  return (
    <>
      <Helmet>
        <title>{`${t('processing.detailsHeading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <ProcessingDetailsView orderId={id} />
    </>
  );
}

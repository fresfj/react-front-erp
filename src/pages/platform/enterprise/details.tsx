import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';

import { useTranslate } from 'src/locales';

import { EnterpriseDetailsView } from 'src/sections/platform/enterprise/view/enterprise-details-view';

// ----------------------------------------------------------------------

export default function EnterpriseDetailsPage() {
  const { t } = useTranslate('common');
  const { id = '' } = useParams();

  return (
    <>
      <Helmet>
        <title>{t('enterprises.detailsHeading')}</title>
      </Helmet>

      <EnterpriseDetailsView enterpriseId={id} />
    </>
  );
}

import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';

import { useTranslate } from 'src/locales';

import { EnterpriseEditView } from 'src/sections/platform/enterprise/view/enterprise-edit-view';

// ----------------------------------------------------------------------

export default function EnterpriseEditPage() {
  const { t } = useTranslate('common');
  const { id = '' } = useParams();

  return (
    <>
      <Helmet>
        <title>{t('enterprises.editHeading')}</title>
      </Helmet>

      <EnterpriseEditView enterpriseId={id} />
    </>
  );
}

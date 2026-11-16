import { Helmet } from 'react-helmet-async';

import { useTranslate } from 'src/locales';

import { EnterpriseCreateView } from 'src/sections/platform/enterprise/view/enterprise-create-view';

// ----------------------------------------------------------------------

export default function EnterpriseCreatePage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{t('enterprises.createHeading')}</title>
      </Helmet>

      <EnterpriseCreateView />
    </>
  );
}

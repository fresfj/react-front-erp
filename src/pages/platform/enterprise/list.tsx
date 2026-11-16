import { Helmet } from 'react-helmet-async';

import { useTranslate } from 'src/locales';

import { EnterpriseListView } from 'src/sections/platform/enterprise/view/enterprise-list-view';

// ----------------------------------------------------------------------

export default function EnterpriseListPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{t('enterprises.listHeading')}</title>
      </Helmet>

      <EnterpriseListView />
    </>
  );
}

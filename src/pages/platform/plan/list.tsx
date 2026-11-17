import { Helmet } from 'react-helmet-async';

import { useTranslate } from 'src/locales';

import { PlanListView } from 'src/sections/platform/plan/view/plan-list-view';

// ----------------------------------------------------------------------

export default function PlanListPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{t('billing.plansListHeading')}</title>
      </Helmet>
      <PlanListView />
    </>
  );
}

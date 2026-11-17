import { Helmet } from 'react-helmet-async';

import { useTranslate } from 'src/locales';

import { PlanCreateView } from 'src/sections/platform/plan/view/plan-create-view';

// ----------------------------------------------------------------------

export default function PlanCreatePage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{t('billing.plansCreateHeading')}</title>
      </Helmet>
      <PlanCreateView />
    </>
  );
}

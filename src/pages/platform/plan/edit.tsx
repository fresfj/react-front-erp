import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';

import { useTranslate } from 'src/locales';

import { PlanEditView } from 'src/sections/platform/plan/view/plan-edit-view';

// ----------------------------------------------------------------------

export default function PlanEditPage() {
  const { t } = useTranslate('common');
  const { id = '' } = useParams();

  return (
    <>
      <Helmet>
        <title>{t('billing.plansEditHeading')}</title>
      </Helmet>
      <PlanEditView id={id} />
    </>
  );
}

import { Helmet } from 'react-helmet-async';

import { useParams } from 'src/routes/hooks';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { CustomerEditView } from 'src/sections/customer/view/customer-edit-view';

// ----------------------------------------------------------------------

export default function CustomerEditPage() {
  const { t } = useTranslate('common');
  const { id = '' } = useParams();

  return (
    <>
      <Helmet>
        <title>{`${t('customers.editHeading', { defaultValue: 'Editar cliente' })} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <CustomerEditView customerId={id} />
    </>
  );
}

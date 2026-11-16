import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { CustomerCreateView } from 'src/sections/customer/view/customer-create-view';

// ----------------------------------------------------------------------

export default function CustomerCreatePage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('customers.createHeading', { defaultValue: 'Criar cliente' })} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <CustomerCreateView />
    </>
  );
}

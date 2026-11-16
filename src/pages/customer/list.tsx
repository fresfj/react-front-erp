import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { CustomerListView } from 'src/sections/customer/view/customer-list-view';

// ----------------------------------------------------------------------

export default function CustomerListPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('customers.listHeading', { defaultValue: 'Clientes' })} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <CustomerListView />
    </>
  );
}

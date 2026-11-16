import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { PosCheckoutView } from 'src/sections/pos/view/pos-checkout-view';

// ----------------------------------------------------------------------

export default function PosCheckoutPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{`${t('pos.checkoutHeading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <PosCheckoutView />
    </>
  );
}

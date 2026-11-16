import { Helmet } from 'react-helmet-async';

import { useParams } from 'src/routes/hooks';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';

import { SaleDetailsView } from 'src/sections/pos/view/sale-details-view';

// ----------------------------------------------------------------------

export default function SaleDetailsPage() {
  const { t } = useTranslate('common');
  const { id = '' } = useParams();

  return (
    <>
      <Helmet>
        <title>{`${t('pos.detailsHeading')} | Dashboard - ${CONFIG.site.name}`}</title>
      </Helmet>

      <SaleDetailsView saleId={id} />
    </>
  );
}

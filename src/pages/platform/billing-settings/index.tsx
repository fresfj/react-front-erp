import { Helmet } from 'react-helmet-async';

import { useTranslate } from 'src/locales';

import { BillingSettingsView } from 'src/sections/platform/billing-settings/view/billing-settings-view';

// ----------------------------------------------------------------------

export default function BillingSettingsPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title>{t('billing.settingsTitle')}</title>
      </Helmet>
      <BillingSettingsView />
    </>
  );
}

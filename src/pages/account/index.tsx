import { Helmet } from 'react-helmet-async';

import Typography from '@mui/material/Typography';

import { CONFIG } from 'src/config-global';
import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

const metadata = { title: `Account - ${CONFIG.site.name}` };

export default function AccountStubPage() {
  const { t } = useTranslate('common');

  return (
    <>
      <Helmet>
        <title> {metadata.title}</title>
      </Helmet>

      <DashboardContent>
        <Typography variant="h4">{t('nav.account')}</Typography>
        <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
          {t('common.comingSoon')}
        </Typography>
      </DashboardContent>
    </>
  );
}

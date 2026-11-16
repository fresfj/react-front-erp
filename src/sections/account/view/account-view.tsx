import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

import { paths } from 'src/routes/paths';
import { useRouter, usePathname } from 'src/routes/hooks';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { AccountGeneralForm } from '../account-general-form';
import { AccountChangePasswordForm } from '../account-change-password-form';

// ----------------------------------------------------------------------

const TAB_GENERAL = 'general';
const TAB_SECURITY = 'security';

// ----------------------------------------------------------------------

export function AccountView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const pathname = usePathname();

  const currentTab =
    pathname.includes('/change-password') || pathname.endsWith('/security')
      ? TAB_SECURITY
      : TAB_GENERAL;

  const tabs = [
    {
      value: TAB_GENERAL,
      label: t('account.tabs.general'),
      icon: <Iconify icon="solar:user-id-bold" width={24} />,
      href: paths.dashboard.account.general,
    },
    {
      value: TAB_SECURITY,
      label: t('account.tabs.security'),
      icon: <Iconify icon="ic:round-vpn-key" width={24} />,
      href: paths.dashboard.account.changePassword,
    },
  ];

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    const tab = tabs.find((item) => item.value === newValue);
    if (tab) {
      router.push(tab.href);
    }
  };

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('account.title')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('account.title') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <Tabs value={currentTab} onChange={handleTabChange} sx={{ mb: { xs: 3, md: 5 } }}>
        {tabs.map((tab) => (
          <Tab key={tab.value} label={tab.label} icon={tab.icon} value={tab.value} />
        ))}
      </Tabs>

      {currentTab === TAB_GENERAL && <AccountGeneralForm />}
      {currentTab === TAB_SECURITY && <AccountChangePasswordForm />}
    </DashboardContent>
  );
}

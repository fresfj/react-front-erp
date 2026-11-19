import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

import { paths } from 'src/routes/paths';
import { useRouter, usePathname } from 'src/routes/hooks';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

import { AccountFiscalForm } from '../account-fiscal-form';
import { AccountGeneralForm } from '../account-general-form';
import { AccountCompanyForm } from '../account-company-form';
import { AccountBillingView } from '../account-billing-view';
import { AccountOnlineStoreForm } from '../account-online-store-form';
import { AccountChangePasswordForm } from '../account-change-password-form';

// ----------------------------------------------------------------------

const TAB_GENERAL = 'general';
const TAB_SECURITY = 'security';
const TAB_COMPANY = 'company';
const TAB_FISCAL = 'fiscal';
const TAB_ONLINE_STORE = 'online-store';
const TAB_BILLING = 'billing';

// ----------------------------------------------------------------------

export function AccountView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const isTenantAdmin = user?.role === 'admin';

  const currentTab = pathname.includes('/billing')
    ? TAB_BILLING
    : pathname.includes('/online-store')
      ? TAB_ONLINE_STORE
      : pathname.includes('/fiscal')
        ? TAB_FISCAL
        : pathname.includes('/company')
          ? TAB_COMPANY
          : pathname.includes('/change-password') || pathname.endsWith('/security')
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
    ...(enterpriseId
      ? [
          {
            value: TAB_COMPANY,
            label: t('account.tabs.company'),
            icon: <Iconify icon="solar:buildings-bold" width={24} />,
            href: paths.dashboard.account.company,
          },
          {
            value: TAB_FISCAL,
            label: t('account.tabs.fiscal'),
            icon: <Iconify icon="solar:bill-list-bold" width={24} />,
            href: paths.dashboard.account.fiscal,
          },
          {
            value: TAB_ONLINE_STORE,
            label: t('account.tabs.onlineStore'),
            icon: <Iconify icon="solar:shop-bold" width={24} />,
            href: paths.dashboard.account.onlineStore,
          },
        ]
      : []),
    ...(isTenantAdmin
      ? [
          {
            value: TAB_BILLING,
            label: t('account.tabs.billing'),
            icon: <Iconify icon="solar:card-bold" width={24} />,
            href: paths.dashboard.account.billing,
          },
        ]
      : []),
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

      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: { xs: 3, md: 5 } }}
      >
        {tabs.map((tab) => (
          <Tab key={tab.value} label={tab.label} icon={tab.icon} value={tab.value} />
        ))}
      </Tabs>

      {currentTab === TAB_GENERAL && <AccountGeneralForm />}
      {currentTab === TAB_SECURITY && <AccountChangePasswordForm />}
      {currentTab === TAB_COMPANY && <AccountCompanyForm />}
      {currentTab === TAB_FISCAL && <AccountFiscalForm />}
      {currentTab === TAB_ONLINE_STORE && <AccountOnlineStoreForm />}
      {currentTab === TAB_BILLING && <AccountBillingView />}
    </DashboardContent>
  );
}

import type { NavSectionProps } from 'src/components/nav-section';

import { useMemo } from 'react';

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { CONFIG } from 'src/config-global';

import { SvgColor } from 'src/components/svg-color';

// ----------------------------------------------------------------------

const icon = (name: string) => (
  <SvgColor src={`${CONFIG.site.basePath}/assets/icons/navbar/${name}.svg`} />
);

const ICONS = {
  user: icon('ic-user'),
  product: icon('ic-product'),
  dashboard: icon('ic-dashboard'),
  ecommerce: icon('ic-ecommerce'),
};

// ----------------------------------------------------------------------

export function useNavData(): NavSectionProps['data'] {
  const { t } = useTranslate('common');

  return useMemo(
    () => [
      {
        subheader: t('nav.overview'),
        items: [
          { title: t('nav.app'), path: paths.dashboard.root, icon: ICONS.dashboard },
          {
            title: t('nav.suppliers'),
            path: paths.dashboard.suppliers.list,
            icon: ICONS.ecommerce,
          },
          {
            title: t('nav.products'),
            path: paths.dashboard.products.list,
            icon: ICONS.product,
          },
          {
            title: t('nav.account'),
            path: paths.dashboard.account.general,
            icon: ICONS.user,
          },
        ],
      },
    ],
    [t]
  );
}

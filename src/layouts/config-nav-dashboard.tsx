import { useMemo } from 'react';

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { CONFIG } from 'src/config-global';

import { SvgColor } from 'src/components/svg-color';

import type { NavSectionProps } from 'src/components/nav-section';

// ----------------------------------------------------------------------

const icon = (name: string) => (
  <SvgColor src={`${CONFIG.site.basePath}/assets/icons/navbar/${name}.svg`} />
);

const ICONS = {
  user: icon('ic-user'),
  lock: icon('ic-lock'),
  product: icon('ic-product'),
  dashboard: icon('ic-dashboard'),
};

// ----------------------------------------------------------------------

export function useNavData(): NavSectionProps['data'] {
  const { t } = useTranslate('common');

  return useMemo(
    () => [
      {
        subheader: t('nav.overview'),
        items: [{ title: t('nav.app'), path: paths.dashboard.root, icon: ICONS.dashboard }],
      },
      {
        subheader: t('nav.management'),
        items: [
          {
            title: t('nav.administration'),
            path: paths.dashboard.sistema.empresa,
            icon: ICONS.user,
            children: [
              { title: t('nav.company'), path: paths.dashboard.sistema.empresa },
              { title: t('nav.branches'), path: paths.dashboard.sistema.sucursal },
              { title: t('nav.users'), path: paths.dashboard.sistema.usuarios.list },
            ],
          },
          {
            title: t('nav.inventory'),
            path: paths.dashboard.inventario.productos.list,
            icon: ICONS.product,
            children: [
              { title: t('nav.products'), path: paths.dashboard.inventario.productos.list },
            ],
          },
          {
            title: t('nav.audit'),
            path: paths.dashboard.auditoria.root,
            icon: ICONS.lock,
            roles: ['admin', 'gerente'],
            children: [
              {
                title: t('nav.events'),
                path: paths.dashboard.auditoria.eventosAuditoria,
                roles: ['admin', 'gerente'],
              },
            ],
          },
        ],
      },
    ],
    [t]
  );
}

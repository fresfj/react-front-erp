import { paths } from 'src/routes/paths';

import { CONFIG } from 'src/config-global';

import { SvgColor } from 'src/components/svg-color';

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

export const navData = [
  {
    subheader: 'Overview',
    items: [{ title: 'App', path: paths.dashboard.root, icon: ICONS.dashboard }],
  },
  {
    subheader: 'Management',
    items: [
      {
        title: 'Administración',
        path: paths.dashboard.sistema.empresa,
        icon: ICONS.user,
        children: [
          { title: 'Empresa', path: paths.dashboard.sistema.empresa },
          { title: 'Sucursales', path: paths.dashboard.sistema.sucursal },
          { title: 'Usuarios', path: paths.dashboard.sistema.usuarios.list },
        ],
      },
      {
        title: 'Inventario',
        path: paths.dashboard.inventario.productos.list,
        icon: ICONS.product,
        children: [
          { title: 'Productos', path: paths.dashboard.inventario.productos.list },
        ],
      },
      {
        title: 'Auditoría',
        path: paths.dashboard.auditoria.root,
        icon: ICONS.lock,
        children: [
          { title: 'Eventos', path: paths.dashboard.auditoria.eventosAuditoria },
        ],
      },
    ],
  },
];

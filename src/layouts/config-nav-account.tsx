import { paths } from 'src/routes/paths';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

export const _account = [
  {
    label: 'Configuração',
    href: paths.dashboard.account.general,
    icon: <Iconify icon="solar:settings-bold-duotone" />,
  },
  {
    label: 'Assinatura',
    href: paths.dashboard.account.billing,
    icon: <Iconify icon="solar:card-bold-duotone" />,
  },
];

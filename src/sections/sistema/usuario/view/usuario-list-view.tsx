import { Card, Button } from '@mui/material';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import UsuariosDTQ from '../usuario-dtq';

// ----------------------------------------------------------------------

export function UsuarioListView() {
  const { t } = useTranslate('common');

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('users.listHeading')}
        links={[
          {
            name: t('users.title'),
            href: paths.dashboard.sistema.usuarios.root,
          },
          { name: t('users.listHeading') },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.sistema.usuarios.create}
            variant="contained"
            startIcon={<Iconify icon="mingcute:add-line" />}
          >
            {t('users.newUser')}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />
      <Card>
        <UsuariosDTQ />
      </Card>
    </DashboardContent>
  );
}

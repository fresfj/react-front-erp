import { paths } from 'src/routes/paths';
import { useParams } from 'src/routes/hooks';

import { useTranslate } from 'src/locales';
import { useFormTable } from 'src/core/components/form';
import { useTableQueryUsuario } from 'src/api/usuarios';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import UsuarioFRT from '../usuario-frt';

// ----------------------------------------------------------------------

export function UsuarioEditView() {
  const { t } = useTranslate('common');
  const { id = '' } = useParams();
  const frmTable = useFormTable({ config: useTableQueryUsuario(id) });

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('users.editHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('users.title'), href: paths.dashboard.sistema.usuarios.list },
          { name: frmTable.getValue('nom_usua') || '' },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <UsuarioFRT useFormTable={frmTable} />
    </DashboardContent>
  );
}

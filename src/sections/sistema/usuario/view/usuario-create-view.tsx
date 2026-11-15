import { useEffect } from 'react';

import { paths } from 'src/routes/paths';
import { useRouter } from 'src/routes/hooks';

import { useTranslate } from 'src/locales';
import { useFormTable } from 'src/core/components/form';
import { useTableQueryUsuario } from 'src/api/usuarios';
import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import UsuarioFRT from '../usuario-frt';

// ----------------------------------------------------------------------

export function UsuarioCreateView() {
  const { t } = useTranslate('common');
  const router = useRouter();
  const frmTable = useFormTable({ config: useTableQueryUsuario('') });

  useEffect(() => {
    if (frmTable.isSuccessSubmit === true) {
      frmTable.setIsSuccessSubmit(false);
      router.push(paths.dashboard.sistema.usuarios.list);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frmTable.isSuccessSubmit]);

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={t('users.createHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('users.title'), href: paths.dashboard.sistema.usuarios.list },
          { name: t('users.newUser') },
        ]}
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <UsuarioFRT useFormTable={frmTable} />
    </DashboardContent>
  );
}

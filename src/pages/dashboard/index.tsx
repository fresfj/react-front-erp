import { Helmet } from 'react-helmet-async';

import { CONFIG } from 'src/config-global';
import { getEffectivePermissions } from 'src/api/firestore/members';

import { EmptyContent } from 'src/components/empty-content';
import { SplashScreen } from 'src/components/loading-screen';

import { OverviewAppView } from 'src/sections/overview/app/view';
import { OverviewSellerView } from 'src/sections/overview/erp/view';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

export default function OverviewAppPage() {
  const { user, loading } = useAuthContext();

  const perms = getEffectivePermissions(
    user?.role,
    user?.permissions as string[] | undefined
  );
  const isManager =
    Boolean(user?.platformAdmin) || user?.role === 'admin' || user?.role === 'gestor';

  const showAdminOverview = isManager || perms.has('dre');
  const showSellerHome = !showAdminOverview && perms.has('pos');

  const title = showSellerHome
    ? `Meu dia - ${CONFIG.site.name}`
    : `Dashboard - ${CONFIG.site.name}`;

  if (loading) {
    return <SplashScreen />;
  }

  return (
    <>
      <Helmet>
        <title> {title}</title>
      </Helmet>

      {showAdminOverview ? (
        <OverviewAppView />
      ) : showSellerHome ? (
        <OverviewSellerView />
      ) : (
        <EmptyContent
          filled
          title="Sem módulos liberados"
          description="Peça ao administrador para liberar o PDV ou outros acessos."
          sx={{ py: 10 }}
        />
      )}
    </>
  );
}

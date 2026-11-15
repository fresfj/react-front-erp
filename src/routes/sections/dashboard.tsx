import { lazy, Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';

import { paths } from 'src/routes/paths';

import { CONFIG } from 'src/config-global';
import { DashboardLayout } from 'src/layouts/dashboard';

import { LoadingScreen } from 'src/components/loading-screen';

import { AuthGuard, ClaimsGuard } from 'src/auth/guard';

// ----------------------------------------------------------------------

const IndexPage = lazy(() => import('src/pages/dashboard'));

const SuppliersStubPage = lazy(() => import('src/pages/suppliers'));
const ProductsStubPage = lazy(() => import('src/pages/products'));
const AccountStubPage = lazy(() => import('src/pages/account'));

// ----------------------------------------------------------------------

const layoutContent = (
  <ClaimsGuard>
    <DashboardLayout>
      <Suspense fallback={<LoadingScreen />}>
        <Outlet />
      </Suspense>
    </DashboardLayout>
  </ClaimsGuard>
);

export const dashboardRoutes = [
  {
    path: 'dashboard',
    element: CONFIG.auth.skip ? <>{layoutContent}</> : <AuthGuard>{layoutContent}</AuthGuard>,
    children: [
      { element: <IndexPage />, index: true },
      {
        path: 'suppliers',
        children: [
          { element: <Navigate to={paths.dashboard.suppliers.list} replace />, index: true },
          { path: 'list', element: <SuppliersStubPage /> },
          { path: 'create', element: <SuppliersStubPage /> },
          { path: ':id/edit', element: <SuppliersStubPage /> },
        ],
      },
      {
        path: 'products',
        children: [
          { element: <Navigate to={paths.dashboard.products.list} replace />, index: true },
          { path: 'list', element: <ProductsStubPage /> },
          { path: 'create', element: <ProductsStubPage /> },
          { path: ':id/edit', element: <ProductsStubPage /> },
        ],
      },
      {
        path: 'account',
        children: [
          { element: <Navigate to={paths.dashboard.account.general} replace />, index: true },
          { path: 'general', element: <AccountStubPage /> },
          { path: 'change-password', element: <AccountStubPage /> },
        ],
      },
      // Legacy URLs → dashboard root (page sources kept, unrouted)
      { path: 'sistema/*', element: <Navigate to={paths.dashboard.root} replace /> },
      { path: 'usuarios/*', element: <Navigate to={paths.dashboard.root} replace /> },
      { path: 'auditoria/*', element: <Navigate to={paths.dashboard.root} replace /> },
      { path: 'productos/*', element: <Navigate to={paths.dashboard.root} replace /> },
      { path: 'inventario/*', element: <Navigate to={paths.dashboard.root} replace /> },
    ],
  },
];

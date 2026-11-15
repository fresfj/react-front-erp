import { lazy, Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';

import { CONFIG } from 'src/config-global';
import { DashboardLayout } from 'src/layouts/dashboard';

import { LoadingScreen } from 'src/components/loading-screen';

import { AuthGuard, ClaimsGuard } from 'src/auth/guard';

// ----------------------------------------------------------------------

const IndexPage = lazy(() => import('src/pages/dashboard'));

// ----ERP
// Auditoria
const EventosAuditoria = lazy(() => import('src/pages/auditoria/EventosAuditoria'));
// Sistema
const Simple = lazy(() => import('src/pages/sistema/Simple'));
const SimpleUI = lazy(() => import('src/pages/sistema/SimpleUi'));
const Recursiva = lazy(() => import('src/pages/sistema/Recursiva'));
const Doble = lazy(() => import('src/pages/sistema/Doble'));
const Empresa = lazy(() => import('src/pages/sistema/Empresa'));
const Sucursal = lazy(() => import('src/pages/sistema/Sucursal'));

// Usuarios
const UsuarioListPage = lazy(() => import('src/pages/sistema/usuarios/usuario-list'));
const UsuarioEditPage = lazy(() => import('src/pages/sistema/usuarios/usuario-edit'));
const UsuarioCreatePage = lazy(() => import('src/pages/sistema/usuarios/usuario-create'));

// Productos
const ProductoListPage = lazy(() => import('src/pages/inventario/productos/producto-list'));
const ProductoCreatePage = lazy(() => import('src/pages/inventario/productos/producto-create'));
const ProductoEditPage = lazy(() => import('src/pages/inventario/productos/producto-edit'));

// ----------------------------------------------------------------------

const pantallasGenericas = [
  { path: 'simple', element: <Simple /> },
  { path: 'simple-ui/:id', element: <SimpleUI /> },
  { path: 'recursiva/:id', element: <Recursiva /> },
  { path: 'doble/:id', element: <Doble /> },
];

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
        path: 'auditoria',
        children: [
          { element: <Navigate to="/dashboard/auditoria" replace />, index: true },
          ...pantallasGenericas,
          { path: 'eventos-auditoria', element: <EventosAuditoria /> },
        ],
      },
      {
        path: 'sistema',
        children: [
          { element: <Navigate to="/dashboard/sistema" replace />, index: true },
          ...pantallasGenericas,
          { path: 'empresa', element: <Empresa /> },
          { path: 'sucursal', element: <Sucursal /> },
        ],
      },
      {
        path: 'usuarios',
        children: [
          { element: <Navigate to="/dashboard/usuarios" replace />, index: true },
          ...pantallasGenericas,
          { path: 'list', element: <UsuarioListPage /> },
          { path: ':id/edit', element: <UsuarioEditPage /> },
          { path: 'create', element: <UsuarioCreatePage /> },
        ],
      },
      {
        path: 'productos',
        children: [
          { element: <Navigate to="/dashboard/productos" replace />, index: true },
          ...pantallasGenericas,
          { path: 'list', element: <ProductoListPage /> },
          { path: 'create', element: <ProductoCreatePage /> },
          { path: ':id/edit', element: <ProductoEditPage /> },
        ],
      },
    ],
  },
];

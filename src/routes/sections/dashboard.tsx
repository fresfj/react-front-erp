import { lazy, Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';

import { paths } from 'src/routes/paths';

import { CONFIG } from 'src/config-global';
import { DashboardLayout } from 'src/layouts/dashboard';

import { LoadingScreen } from 'src/components/loading-screen';

import { AuthGuard, ClaimsGuard } from 'src/auth/guard';

// ----------------------------------------------------------------------

// Overview / Minimals demos
const IndexPage = lazy(() => import('src/pages/dashboard'));
const OverviewEcommercePage = lazy(() => import('src/pages/dashboard/ecommerce'));
const OverviewAnalyticsPage = lazy(() => import('src/pages/dashboard/analytics'));
const OverviewBankingPage = lazy(() => import('src/pages/dashboard/banking'));
const OverviewBookingPage = lazy(() => import('src/pages/dashboard/booking'));
const OverviewFilePage = lazy(() => import('src/pages/dashboard/file'));
const OverviewCoursePage = lazy(() => import('src/pages/dashboard/course'));
// Shop product (Minimals) — path: /dashboard/product
const DemoProductDetailsPage = lazy(() => import('src/pages/dashboard/product/details'));
const DemoProductListPage = lazy(() => import('src/pages/dashboard/product/list'));
const DemoProductCreatePage = lazy(() => import('src/pages/dashboard/product/new'));
const DemoProductEditPage = lazy(() => import('src/pages/dashboard/product/edit'));
// Order
const OrderListPage = lazy(() => import('src/pages/dashboard/order/list'));
const OrderDetailsPage = lazy(() => import('src/pages/dashboard/order/details'));
// Invoice
const InvoiceListPage = lazy(() => import('src/pages/dashboard/invoice/list'));
const InvoiceDetailsPage = lazy(() => import('src/pages/dashboard/invoice/details'));
const InvoiceCreatePage = lazy(() => import('src/pages/dashboard/invoice/new'));
const InvoiceEditPage = lazy(() => import('src/pages/dashboard/invoice/edit'));
// User
const UserProfilePage = lazy(() => import('src/pages/dashboard/user/profile'));
const UserCardsPage = lazy(() => import('src/pages/dashboard/user/cards'));
const UserListPage = lazy(() => import('src/pages/dashboard/user/list'));
const UserAccountPage = lazy(() => import('src/pages/dashboard/user/account'));
const UserCreatePage = lazy(() => import('src/pages/dashboard/user/new'));
const UserEditPage = lazy(() => import('src/pages/dashboard/user/edit'));
// Blog
const BlogPostsPage = lazy(() => import('src/pages/dashboard/post/list'));
const BlogPostPage = lazy(() => import('src/pages/dashboard/post/details'));
const BlogNewPostPage = lazy(() => import('src/pages/dashboard/post/new'));
const BlogEditPostPage = lazy(() => import('src/pages/dashboard/post/edit'));
// Job
const JobDetailsPage = lazy(() => import('src/pages/dashboard/job/details'));
const JobListPage = lazy(() => import('src/pages/dashboard/job/list'));
const JobCreatePage = lazy(() => import('src/pages/dashboard/job/new'));
const JobEditPage = lazy(() => import('src/pages/dashboard/job/edit'));
// Tour
const TourDetailsPage = lazy(() => import('src/pages/dashboard/tour/details'));
const TourListPage = lazy(() => import('src/pages/dashboard/tour/list'));
const TourCreatePage = lazy(() => import('src/pages/dashboard/tour/new'));
const TourEditPage = lazy(() => import('src/pages/dashboard/tour/edit'));
// Apps
const FileManagerPage = lazy(() => import('src/pages/dashboard/file-manager'));
const ChatPage = lazy(() => import('src/pages/dashboard/chat'));
const MailPage = lazy(() => import('src/pages/dashboard/mail'));
const CalendarPage = lazy(() => import('src/pages/dashboard/calendar'));
const KanbanPage = lazy(() => import('src/pages/dashboard/kanban'));
const PermissionDeniedPage = lazy(() => import('src/pages/dashboard/permission'));
const ParamsPage = lazy(() => import('src/pages/dashboard/params'));
const BlankPage = lazy(() => import('src/pages/dashboard/blank'));

// ERP Firestore
const SupplierListPage = lazy(() => import('src/pages/supplier/list'));
const SupplierCreatePage = lazy(() => import('src/pages/supplier/create'));
const SupplierEditPage = lazy(() => import('src/pages/supplier/edit'));
const ProductListPage = lazy(() => import('src/pages/inventory/product/list'));
const ProductCreatePage = lazy(() => import('src/pages/inventory/product/create'));
const ProductEditPage = lazy(() => import('src/pages/inventory/product/edit'));
const AccountPage = lazy(() => import('src/pages/account'));

// ERP legacy
const EventosAuditoria = lazy(() => import('src/pages/auditoria/EventosAuditoria'));
const Simple = lazy(() => import('src/pages/sistema/Simple'));
const SimpleUI = lazy(() => import('src/pages/sistema/SimpleUi'));
const Recursiva = lazy(() => import('src/pages/sistema/Recursiva'));
const Doble = lazy(() => import('src/pages/sistema/Doble'));
const Empresa = lazy(() => import('src/pages/sistema/Empresa'));
const Sucursal = lazy(() => import('src/pages/sistema/Sucursal'));
const UsuarioListPage = lazy(() => import('src/pages/sistema/usuarios/usuario-list'));
const UsuarioEditPage = lazy(() => import('src/pages/sistema/usuarios/usuario-edit'));
const UsuarioCreatePage = lazy(() => import('src/pages/sistema/usuarios/usuario-create'));
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
      { path: 'ecommerce', element: <OverviewEcommercePage /> },
      { path: 'analytics', element: <OverviewAnalyticsPage /> },
      { path: 'banking', element: <OverviewBankingPage /> },
      { path: 'booking', element: <OverviewBookingPage /> },
      { path: 'file', element: <OverviewFilePage /> },
      { path: 'course', element: <OverviewCoursePage /> },

      // ERP Firestore
      {
        path: 'suppliers',
        children: [
          { element: <Navigate to={paths.dashboard.suppliers.list} replace />, index: true },
          { path: 'list', element: <SupplierListPage /> },
          { path: 'create', element: <SupplierCreatePage /> },
          { path: ':id/edit', element: <SupplierEditPage /> },
        ],
      },
      {
        path: 'products',
        children: [
          { element: <Navigate to={paths.dashboard.products.list} replace />, index: true },
          { path: 'list', element: <ProductListPage /> },
          { path: 'create', element: <ProductCreatePage /> },
          { path: ':id/edit', element: <ProductEditPage /> },
        ],
      },
      {
        path: 'account',
        children: [
          { element: <Navigate to={paths.dashboard.account.general} replace />, index: true },
          { path: 'general', element: <AccountPage /> },
          { path: 'change-password', element: <AccountPage /> },
        ],
      },

      // ERP legacy
      {
        path: 'auditoria',
        children: [
          { element: <Navigate to={paths.dashboard.auditoria.eventosAuditoria} replace />, index: true },
          ...pantallasGenericas,
          { path: 'eventos-auditoria', element: <EventosAuditoria /> },
        ],
      },
      {
        path: 'sistema',
        children: [
          { element: <Navigate to={paths.dashboard.sistema.empresa} replace />, index: true },
          ...pantallasGenericas,
          { path: 'empresa', element: <Empresa /> },
          { path: 'sucursal', element: <Sucursal /> },
        ],
      },
      {
        path: 'usuarios',
        children: [
          { element: <Navigate to={paths.dashboard.sistema.usuarios.list} replace />, index: true },
          ...pantallasGenericas,
          { path: 'list', element: <UsuarioListPage /> },
          { path: ':id/edit', element: <UsuarioEditPage /> },
          { path: 'create', element: <UsuarioCreatePage /> },
        ],
      },
      {
        path: 'productos',
        children: [
          { element: <Navigate to={paths.dashboard.inventario.productos.list} replace />, index: true },
          ...pantallasGenericas,
          { path: 'list', element: <ProductoListPage /> },
          { path: 'create', element: <ProductoCreatePage /> },
          { path: ':id/edit', element: <ProductoEditPage /> },
        ],
      },

      // Minimals demos
      {
        path: 'user',
        children: [
          { element: <UserProfilePage />, index: true },
          { path: 'profile', element: <UserProfilePage /> },
          { path: 'cards', element: <UserCardsPage /> },
          { path: 'list', element: <UserListPage /> },
          { path: 'new', element: <UserCreatePage /> },
          { path: ':id/edit', element: <UserEditPage /> },
          { path: 'account', element: <UserAccountPage /> },
        ],
      },
      {
        path: 'product',
        children: [
          { element: <DemoProductListPage />, index: true },
          { path: 'list', element: <DemoProductListPage /> },
          { path: ':id', element: <DemoProductDetailsPage /> },
          { path: 'new', element: <DemoProductCreatePage /> },
          { path: ':id/edit', element: <DemoProductEditPage /> },
        ],
      },
      {
        path: 'order',
        children: [
          { element: <OrderListPage />, index: true },
          { path: 'list', element: <OrderListPage /> },
          { path: ':id', element: <OrderDetailsPage /> },
        ],
      },
      {
        path: 'invoice',
        children: [
          { element: <InvoiceListPage />, index: true },
          { path: 'list', element: <InvoiceListPage /> },
          { path: ':id', element: <InvoiceDetailsPage /> },
          { path: ':id/edit', element: <InvoiceEditPage /> },
          { path: 'new', element: <InvoiceCreatePage /> },
        ],
      },
      {
        path: 'post',
        children: [
          { element: <BlogPostsPage />, index: true },
          { path: 'list', element: <BlogPostsPage /> },
          { path: ':title', element: <BlogPostPage /> },
          { path: ':title/edit', element: <BlogEditPostPage /> },
          { path: 'new', element: <BlogNewPostPage /> },
        ],
      },
      {
        path: 'job',
        children: [
          { element: <JobListPage />, index: true },
          { path: 'list', element: <JobListPage /> },
          { path: ':id', element: <JobDetailsPage /> },
          { path: 'new', element: <JobCreatePage /> },
          { path: ':id/edit', element: <JobEditPage /> },
        ],
      },
      {
        path: 'tour',
        children: [
          { element: <TourListPage />, index: true },
          { path: 'list', element: <TourListPage /> },
          { path: ':id', element: <TourDetailsPage /> },
          { path: 'new', element: <TourCreatePage /> },
          { path: ':id/edit', element: <TourEditPage /> },
        ],
      },
      { path: 'file-manager', element: <FileManagerPage /> },
      { path: 'mail', element: <MailPage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'kanban', element: <KanbanPage /> },
      { path: 'permission', element: <PermissionDeniedPage /> },
      { path: 'params', element: <ParamsPage /> },
      { path: 'blank', element: <BlankPage /> },
    ],
  },
];

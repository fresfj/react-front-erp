import { lazy, Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';

import { paths } from 'src/routes/paths';

import { CONFIG } from 'src/config-global';
import { DashboardLayout } from 'src/layouts/dashboard';

import { LoadingScreen } from 'src/components/loading-screen';

import { AuthGuard, ClaimsGuard, PermissionGuard } from 'src/auth/guard';

// ----------------------------------------------------------------------

const IndexPage = lazy(() => import('src/pages/dashboard'));

// ERP Firestore
const SupplierListPage = lazy(() => import('src/pages/supplier/list'));
const SupplierCreatePage = lazy(() => import('src/pages/supplier/create'));
const SupplierEditPage = lazy(() => import('src/pages/supplier/edit'));
const CustomerListPage = lazy(() => import('src/pages/customer/list'));
const CustomerCreatePage = lazy(() => import('src/pages/customer/create'));
const CustomerEditPage = lazy(() => import('src/pages/customer/edit'));
const ProductListPage = lazy(() => import('src/pages/inventory/product/list'));
const ProductCreatePage = lazy(() => import('src/pages/inventory/product/create'));
const ProductEditPage = lazy(() => import('src/pages/inventory/product/edit'));
const ProcessingListPage = lazy(() => import('src/pages/processing/list'));
const ProcessingCreatePage = lazy(() => import('src/pages/processing/create'));
const ProcessingDetailsPage = lazy(() => import('src/pages/processing/details'));
const BatchListPage = lazy(() => import('src/pages/batch/list'));
const BatchCreatePage = lazy(() => import('src/pages/batch/create'));
const StockMovementListPage = lazy(() => import('src/pages/batch/movements'));
const PosCheckoutPage = lazy(() => import('src/pages/pos/checkout'));
const SaleListPage = lazy(() => import('src/pages/pos/list'));
const SaleDetailsPage = lazy(() => import('src/pages/pos/details'));
const CashSessionPage = lazy(() => import('src/pages/cash'));
const DrePage = lazy(() => import('src/pages/cash/dre'));
const CashLedgerPage = lazy(() => import('src/pages/cash/ledger'));
const SellerRankingPage = lazy(() => import('src/pages/cash/ranking'));
const PayableListPage = lazy(() => import('src/pages/cash/payables-list'));
const PayableCreatePage = lazy(() => import('src/pages/cash/payables-create'));
const PayableEditPage = lazy(() => import('src/pages/cash/payables-edit'));
const ReceivableListPage = lazy(() => import('src/pages/cash/receivables-list'));
const ReceivableCreatePage = lazy(() => import('src/pages/cash/receivables-create'));
const ReceivableEditPage = lazy(() => import('src/pages/cash/receivables-edit'));
const TeamListPage = lazy(() => import('src/pages/team/list'));
const AccountPage = lazy(() => import('src/pages/account'));
const EnterpriseListPage = lazy(() => import('src/pages/platform/enterprise/list'));
const EnterpriseCreatePage = lazy(() => import('src/pages/platform/enterprise/create'));
const EnterpriseEditPage = lazy(() => import('src/pages/platform/enterprise/edit'));
const EnterpriseDetailsPage = lazy(() => import('src/pages/platform/enterprise/details'));
const PlanListPage = lazy(() => import('src/pages/platform/plan/list'));
const PlanCreatePage = lazy(() => import('src/pages/platform/plan/create'));
const PlanEditPage = lazy(() => import('src/pages/platform/plan/edit'));
const BillingSettingsPage = lazy(() => import('src/pages/platform/billing-settings'));

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
        element: (
          <PermissionGuard permission="suppliers">
            <Outlet />
          </PermissionGuard>
        ),
        children: [
          { element: <Navigate to={paths.dashboard.suppliers.list} replace />, index: true },
          { path: 'list', element: <SupplierListPage /> },
          { path: 'create', element: <SupplierCreatePage /> },
          { path: ':id/edit', element: <SupplierEditPage /> },
        ],
      },
      {
        path: 'customers',
        element: (
          <PermissionGuard permission="customers">
            <Outlet />
          </PermissionGuard>
        ),
        children: [
          { element: <Navigate to={paths.dashboard.customers.list} replace />, index: true },
          { path: 'list', element: <CustomerListPage /> },
          { path: 'create', element: <CustomerCreatePage /> },
          { path: ':id/edit', element: <CustomerEditPage /> },
        ],
      },
      {
        path: 'products',
        element: (
          <PermissionGuard permission="products">
            <Outlet />
          </PermissionGuard>
        ),
        children: [
          { element: <Navigate to={paths.dashboard.products.list} replace />, index: true },
          { path: 'list', element: <ProductListPage /> },
          { path: 'create', element: <ProductCreatePage /> },
          { path: ':id/edit', element: <ProductEditPage /> },
        ],
      },
      {
        path: 'processing',
        element: (
          <PermissionGuard permission="processing">
            <Outlet />
          </PermissionGuard>
        ),
        children: [
          { element: <Navigate to={paths.dashboard.processing.list} replace />, index: true },
          { path: 'list', element: <ProcessingListPage /> },
          { path: 'create', element: <ProcessingCreatePage /> },
          { path: ':id', element: <ProcessingDetailsPage /> },
        ],
      },
      {
        path: 'batches',
        children: [
          { element: <Navigate to={paths.dashboard.batches.list} replace />, index: true },
          {
            element: (
              <PermissionGuard permission="batches_read">
                <Outlet />
              </PermissionGuard>
            ),
            children: [
              { path: 'list', element: <BatchListPage /> },
              { path: 'movements', element: <StockMovementListPage /> },
            ],
          },
          {
            path: 'create',
            element: (
              <PermissionGuard permission="batches_write">
                <BatchCreatePage />
              </PermissionGuard>
            ),
          },
        ],
      },
      {
        path: 'pos',
        element: (
          <PermissionGuard permission="pos">
            <Outlet />
          </PermissionGuard>
        ),
        children: [
          { element: <PosCheckoutPage />, index: true },
          { path: 'sales', element: <SaleListPage /> },
          { path: 'sales/:id', element: <SaleDetailsPage /> },
        ],
      },
      {
        path: 'cash',
        children: [
          {
            index: true,
            element: (
              <PermissionGuard permission="cash_close">
                <CashSessionPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'dre',
            element: (
              <PermissionGuard permission="dre">
                <DrePage />
              </PermissionGuard>
            ),
          },
          {
            path: 'ledger',
            element: (
              <PermissionGuard permission="dre">
                <CashLedgerPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'ranking',
            element: (
              <PermissionGuard permission="dre">
                <SellerRankingPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'payables',
            element: (
              <PermissionGuard permission="dre">
                <Outlet />
              </PermissionGuard>
            ),
            children: [
              { element: <PayableListPage />, index: true },
              { path: 'new', element: <PayableCreatePage /> },
              { path: ':id/edit', element: <PayableEditPage /> },
            ],
          },
          {
            path: 'receivables',
            element: (
              <PermissionGuard permission="dre">
                <Outlet />
              </PermissionGuard>
            ),
            children: [
              { element: <ReceivableListPage />, index: true },
              { path: 'new', element: <ReceivableCreatePage /> },
              { path: ':id/edit', element: <ReceivableEditPage /> },
            ],
          },
        ],
      },
      {
        path: 'team',
        element: (
          <PermissionGuard roles={['admin', 'gestor']}>
            <Outlet />
          </PermissionGuard>
        ),
        children: [
          { element: <Navigate to={paths.dashboard.team.list} replace />, index: true },
          { path: 'list', element: <TeamListPage /> },
        ],
      },
      {
        path: 'account',
        children: [
          { element: <Navigate to={paths.dashboard.account.general} replace />, index: true },
          { path: 'general', element: <AccountPage /> },
          { path: 'change-password', element: <AccountPage /> },
          { path: 'company', element: <AccountPage /> },
          {
            path: 'billing',
            element: (
              <PermissionGuard roles={['admin']}>
                <AccountPage />
              </PermissionGuard>
            ),
          },
        ],
      },
      {
        path: 'enterprises',
        element: (
          <PermissionGuard requirePlatformAdmin>
            <Outlet />
          </PermissionGuard>
        ),
        children: [
          { element: <Navigate to={paths.dashboard.enterprises.list} replace />, index: true },
          { path: 'list', element: <EnterpriseListPage /> },
          { path: 'create', element: <EnterpriseCreatePage /> },
          { path: ':id/edit', element: <EnterpriseEditPage /> },
          { path: ':id', element: <EnterpriseDetailsPage /> },
        ],
      },
      {
        path: 'plans',
        element: (
          <PermissionGuard requirePlatformAdmin>
            <Outlet />
          </PermissionGuard>
        ),
        children: [
          { element: <Navigate to={paths.dashboard.plans.list} replace />, index: true },
          { path: 'list', element: <PlanListPage /> },
          { path: 'create', element: <PlanCreatePage /> },
          { path: ':id/edit', element: <PlanEditPage /> },
        ],
      },
      {
        path: 'billing-settings',
        element: (
          <PermissionGuard requirePlatformAdmin>
            <BillingSettingsPage />
          </PermissionGuard>
        ),
      },

      // Catch-all: demos / legado → home ERP
      { path: '*', element: <Navigate to={paths.dashboard.root} replace /> },
    ],
  },
];

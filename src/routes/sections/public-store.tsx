import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import { SplashScreen } from 'src/components/loading-screen';

import { PublicCartProvider } from 'src/sections/public-store/public-cart-context';

// ----------------------------------------------------------------------

const StorefrontPage = lazy(() => import('src/pages/public-store/storefront'));
const CheckoutPage = lazy(() => import('src/pages/public-store/checkout'));
const OrdersPage = lazy(() => import('src/pages/public-store/orders'));
const OrderStatusPage = lazy(() => import('src/pages/public-store/order-status'));

export const publicStoreRoutes = [
  {
    path: 'p',
    element: (
      <PublicCartProvider>
        <Suspense fallback={<SplashScreen />}>
          <Outlet />
        </Suspense>
      </PublicCartProvider>
    ),
    children: [
      { path: ':slug', element: <StorefrontPage /> },
      { path: ':slug/checkout', element: <CheckoutPage /> },
      { path: ':slug/orders', element: <OrdersPage /> },
      { path: ':slug/order/:orderId', element: <OrderStatusPage /> },
    ],
  },
];

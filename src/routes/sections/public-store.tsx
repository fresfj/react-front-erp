import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import { SplashScreen } from 'src/components/loading-screen';

// ----------------------------------------------------------------------

const StorefrontPage = lazy(() => import('src/pages/public-store/storefront'));
const OrderStatusPage = lazy(() => import('src/pages/public-store/order-status'));

export const publicStoreRoutes = [
  {
    path: 'p',
    element: (
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
    ),
    children: [
      { path: ':slug', element: <StorefrontPage /> },
      { path: ':slug/order/:orderId', element: <OrderStatusPage /> },
    ],
  },
];

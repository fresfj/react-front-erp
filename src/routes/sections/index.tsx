import { lazy, Suspense } from 'react';
import { Navigate, useRoutes } from 'react-router-dom';

import { paths } from 'src/routes/paths';

import { CONFIG } from 'src/config-global';

import { SplashScreen } from 'src/components/loading-screen';

import { authRoutes } from './auth';
import { dashboardRoutes } from './dashboard';
import { publicStoreRoutes } from './public-store';

// ----------------------------------------------------------------------

const Page404 = lazy(() => import('src/pages/error/404'));
const Page403 = lazy(() => import('src/pages/error/403'));
const Page500 = lazy(() => import('src/pages/error/500'));

const homeRedirect =
  CONFIG.auth.method === 'firebase' ? paths.auth.firebase.signIn : CONFIG.auth.redirectPath;

export function Router() {
  return useRoutes([
    {
      path: '/',
      element: <Navigate to={homeRedirect} replace />,
    },
    ...publicStoreRoutes,
    ...authRoutes,
    ...dashboardRoutes,
    {
      path: 'error',
      children: [
        {
          path: '403',
          element: (
            <Suspense fallback={<SplashScreen />}>
              <Page403 />
            </Suspense>
          ),
        },
        {
          path: '404',
          element: (
            <Suspense fallback={<SplashScreen />}>
              <Page404 />
            </Suspense>
          ),
        },
        {
          path: '500',
          element: (
            <Suspense fallback={<SplashScreen />}>
              <Page500 />
            </Suspense>
          ),
        },
      ],
    },
    {
      path: '404',
      element: (
        <Suspense fallback={<SplashScreen />}>
          <Page404 />
        </Suspense>
      ),
    },
    { path: '*', element: <Navigate to="/404" replace /> },
  ]);
}

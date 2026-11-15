import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import { AuthSplitLayout } from 'src/layouts/auth-split';

import { SplashScreen } from 'src/components/loading-screen';

import { GuestGuard } from 'src/auth/guard';

// ----------------------------------------------------------------------

const Jwt = {
  SignInPage: lazy(() => import('src/pages/auth/jwt/sign-in')),
  SignUpPage: lazy(() => import('src/pages/auth/jwt/sign-up')),
};

const Firebase = {
  SignInPage: lazy(() => import('src/pages/auth/firebase/sign-in')),
  SignUpPage: lazy(() => import('src/pages/auth/firebase/sign-up')),
  VerifyPage: lazy(() => import('src/pages/auth/firebase/verify')),
  ResetPasswordPage: lazy(() => import('src/pages/auth/firebase/reset-password')),
};

export const authRoutes = [
  {
    path: 'auth',
    element: (
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
    ),
    children: [
      {
        path: 'jwt',
        children: [
          {
            path: 'sign-in',
            element: (
              <GuestGuard>
                <AuthSplitLayout section={{ title: 'Hi, Welcome back' }}>
                  <Jwt.SignInPage />
                </AuthSplitLayout>
              </GuestGuard>
            ),
          },
          {
            path: 'sign-up',
            element: (
              <GuestGuard>
                <AuthSplitLayout>
                  <Jwt.SignUpPage />
                </AuthSplitLayout>
              </GuestGuard>
            ),
          },
        ],
      },
      {
        path: 'firebase',
        children: [
          {
            path: 'sign-in',
            element: (
              <GuestGuard>
                <AuthSplitLayout section={{ title: 'Bem-vindo de volta' }}>
                  <Firebase.SignInPage />
                </AuthSplitLayout>
              </GuestGuard>
            ),
          },
          {
            path: 'sign-up',
            element: (
              <GuestGuard>
                <AuthSplitLayout>
                  <Firebase.SignUpPage />
                </AuthSplitLayout>
              </GuestGuard>
            ),
          },
          {
            path: 'verify',
            element: (
              <AuthSplitLayout>
                <Firebase.VerifyPage />
              </AuthSplitLayout>
            ),
          },
          {
            path: 'reset-password',
            element: (
              <AuthSplitLayout>
                <Firebase.ResetPasswordPage />
              </AuthSplitLayout>
            ),
          },
        ],
      },
    ],
  },
];
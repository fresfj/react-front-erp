import { lazy, Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';

import { paths } from 'src/routes/paths';

import { AuthSplitLayout } from 'src/layouts/auth-split';
import { AuthCenteredLayout } from 'src/layouts/auth-centered';

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

function FirebaseAuthPage({ children }: { children: React.ReactNode }) {
  return <AuthCenteredLayout>{children}</AuthCenteredLayout>;
}

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
        path: 'sign-in',
        element: (
          <GuestGuard>
            <FirebaseAuthPage>
              <Firebase.SignInPage />
            </FirebaseAuthPage>
          </GuestGuard>
        ),
      },
      {
        path: 'sign-up',
        element: (
          <GuestGuard>
            <FirebaseAuthPage>
              <Firebase.SignUpPage />
            </FirebaseAuthPage>
          </GuestGuard>
        ),
      },
      {
        path: 'verify',
        element: (
          <FirebaseAuthPage>
            <Firebase.VerifyPage />
          </FirebaseAuthPage>
        ),
      },
      {
        path: 'reset-password',
        element: (
          <FirebaseAuthPage>
            <Firebase.ResetPasswordPage />
          </FirebaseAuthPage>
        ),
      },
      // Compat: /auth/firebase/* → /auth/*
      {
        path: 'firebase',
        children: [
          { path: 'sign-in', element: <Navigate to={paths.auth.signIn} replace /> },
          { path: 'sign-up', element: <Navigate to={paths.auth.signUp} replace /> },
          { path: 'verify', element: <Navigate to={paths.auth.verify} replace /> },
          {
            path: 'reset-password',
            element: <Navigate to={paths.auth.resetPassword} replace />,
          },
        ],
      },
    ],
  },
];

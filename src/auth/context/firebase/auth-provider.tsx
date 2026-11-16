import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useMemo, useEffect, useCallback } from 'react';

import { useSetState } from 'src/hooks/use-set-state';

import axios from 'src/utils/axios';

import { AUTH, FIRESTORE } from 'src/lib/firebase';

import { parseFirebaseSessionClaims } from 'src/auth/firebase-claims';

import { AuthContext } from '../auth-context';

import type { AuthState } from '../../types';

// ----------------------------------------------------------------------

type Props = {
  children: React.ReactNode;
};

async function buildUserState(user: NonNullable<AuthState['user']>) {
  let profileData: Record<string, unknown> = {};

  try {
    const userProfile = doc(FIRESTORE, 'users', user.uid);
    const docSnap = await getDoc(userProfile);
    profileData = (docSnap.data() as Record<string, unknown>) || {};
  } catch (profileError) {
    console.warn('Firebase profile lookup skipped:', profileError);
  }

  const accessToken = await user.getIdToken();
  const tokenResult = await user.getIdTokenResult();
  const session = parseFirebaseSessionClaims(tokenResult.claims as Record<string, unknown>);

  return {
    ...user,
    ...profileData,
    accessToken,
    enterpriseId: session.tenant?.enterpriseId ?? null,
    role: session.tenant?.role ?? null,
    platformAdmin: session.platformAdmin,
    claimsValid: session.claimsValid,
  };
}

export function AuthProvider({ children }: Props) {
  const { state, setState } = useSetState<AuthState>({
    user: null,
    loading: true,
  });

  const checkUserSession = useCallback(async () => {
    try {
      const user = AUTH.currentUser;

      if (user && user.emailVerified) {
        const nextUser = await buildUserState(user);
        setState({ user: nextUser, loading: false });
        axios.defaults.headers.common.Authorization = `Bearer ${nextUser.accessToken}`;
        return;
      }

      setState({ user: null, loading: false });
      delete axios.defaults.headers.common.Authorization;
    } catch (error) {
      console.error(error);
      setState({ user: null, loading: false });
      delete axios.defaults.headers.common.Authorization;
    }
  }, [setState]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(AUTH, async (user) => {
      try {
        if (user && user.emailVerified) {
          const nextUser = await buildUserState(user);
          setState({ user: nextUser, loading: false });
          axios.defaults.headers.common.Authorization = `Bearer ${nextUser.accessToken}`;
        } else {
          setState({ user: null, loading: false });
          delete axios.defaults.headers.common.Authorization;
        }
      } catch (error) {
        console.error(error);
        setState({ user: null, loading: false });
        delete axios.defaults.headers.common.Authorization;
      }
    });

    return () => unsubscribe();
  }, [setState]);

  const checkAuthenticated = state.user ? 'authenticated' : 'unauthenticated';

  const status = state.loading ? 'loading' : checkAuthenticated;

  const memoizedValue = useMemo(
    () => ({
      user: state.user
        ? {
            ...state.user,
            id: state.user?.uid,
            accessToken: state.user?.accessToken,
            displayName: state.user?.displayName,
            photoURL: state.user?.photoURL,
            role: state.user?.role ?? null,
            enterpriseId: state.user?.enterpriseId ?? null,
            platformAdmin: Boolean(state.user?.platformAdmin),
            claimsValid: Boolean(state.user?.claimsValid),
          }
        : null,
      checkUserSession,
      loading: status === 'loading',
      authenticated: status === 'authenticated',
      unauthenticated: status === 'unauthenticated',
    }),
    [checkUserSession, state.user, status]
  );

  return <AuthContext.Provider value={memoizedValue}>{children}</AuthContext.Provider>;
}
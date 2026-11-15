import type { FirebaseApp } from 'firebase/app';
import type { Auth as AuthType } from 'firebase/auth';
import type { Database as DatabaseType } from 'firebase/database';
import type { Firestore as FirestoreType } from 'firebase/firestore';

import { getAuth } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

import { CONFIG } from 'src/config-global';

// ----------------------------------------------------------------------

const hasFirebaseConfig = Boolean(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);

const firebaseOptions = {
  apiKey: CONFIG.firebase.apiKey,
  authDomain: CONFIG.firebase.authDomain,
  databaseURL: CONFIG.firebase.databaseURL,
  projectId: CONFIG.firebase.projectId,
  storageBucket: CONFIG.firebase.storageBucket,
  messagingSenderId: CONFIG.firebase.messagingSenderId,
  appId: CONFIG.firebase.appId,
  measurementId: CONFIG.firebase.measurementId,
};

export const firebaseApp: FirebaseApp = hasFirebaseConfig
  ? initializeApp(firebaseOptions)
  : ({} as FirebaseApp);

export const AUTH: AuthType = hasFirebaseConfig ? getAuth(firebaseApp) : ({} as AuthType);

export const DATABASE: DatabaseType = hasFirebaseConfig
  ? getDatabase(firebaseApp)
  : ({} as DatabaseType);

function createFirestore(): FirestoreType {
  if (!hasFirebaseConfig) {
    return {} as FirestoreType;
  }

  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    console.warn('Firestore persistent cache init skipped:', error);
    return getFirestore(firebaseApp);
  }
}

export const FIRESTORE: FirestoreType = createFirestore();
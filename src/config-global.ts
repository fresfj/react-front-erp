import { paths } from 'src/routes/paths';

import packageJson from '../package.json';

// ----------------------------------------------------------------------

export type ConfigValue = {
  site: {
    name: string;
    serverUrl: string;
    assetURL: string;
    basePath: string;
    version: string;
  };
  auth: {
    method: 'jwt' | 'firebase';
    skip: boolean;
    redirectPath: string;
  };
  mapbox: {
    apiKey: string;
  };
  firebase: {
    apiKey: string;
    authDomain: string;
    databaseURL: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
  };
  dateformat: {
    formatDateBdd: string;
    formatTimeBdd: string;
    formatDateFront: string;
    formatTimeFront: string;
  };
};

// ----------------------------------------------------------------------

export const CONFIG: ConfigValue = {
  site: {
    name: 'Minimals',
    serverUrl: import.meta.env.VITE_SERVER_URL ?? '',
    assetURL: import.meta.env.VITE_ASSET_URL ?? '',
    basePath: import.meta.env.VITE_BASE_PATH ?? '',
    version: packageJson.version,
  },
  /**
   * Auth padrão do sistema: Firebase
   */
  auth: {
    method: 'firebase',
    skip: false,
    redirectPath: paths.dashboard.root,
  },
  mapbox: {
    apiKey: import.meta.env.VITE_MAPBOX_API_KEY ?? '',
  },
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APPID ?? '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
  },
  dateformat: {
    formatDateBdd: import.meta.env.VITE_FORMAT_DATE_BD ?? '',
    formatTimeBdd: import.meta.env.VITE_FORMAT_TIME_BD ?? '',
    formatDateFront: import.meta.env.VITE_FORMAT_DATE_FRONT ?? '',
    formatTimeFront: import.meta.env.VITE_FORMAT_TIME_FRONT ?? '',
  },
};
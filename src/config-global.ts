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
    method: 'jwt';
    skip: boolean;
    redirectPath: string;
  };
  mapbox: {
    apiKey: string;
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
   * Auth
   * @method jwt
   */
  auth: {
    method: 'jwt',
    skip: false,
    redirectPath: paths.dashboard.root,
  },
  /**
   * Mapbox
   */
  mapbox: {
    apiKey: import.meta.env.VITE_MAPBOX_API_KEY ?? '',
  },
  /**
   * DateFormat
   */
  dateformat: {
    formatDateBdd: import.meta.env.VITE_FORMAT_DATE_BD ?? '',
    formatTimeBdd: import.meta.env.VITE_FORMAT_TIME_BD ?? '',
    formatDateFront: import.meta.env.VITE_FORMAT_DATE_FRONT ?? '',
    formatTimeFront: import.meta.env.VITE_FORMAT_TIME_FRONT ?? '',
  },
};

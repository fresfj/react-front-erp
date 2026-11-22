import type { MapRef, MapProps } from 'react-map-gl';

import MapGL from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import { forwardRef } from 'react';

import { CONFIG } from 'src/config-global';

// ----------------------------------------------------------------------

export const Map = forwardRef<MapRef, MapProps>(({ style, ...other }, ref) => (
  <MapGL
    ref={ref}
    mapLib={mapboxgl as unknown as MapProps['mapLib']}
    mapboxAccessToken={CONFIG.mapbox.apiKey}
    style={{ width: '100%', height: '100%', ...style }}
    {...other}
  />
));

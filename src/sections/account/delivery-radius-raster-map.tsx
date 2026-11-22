import type { DeliveryRadiusTier } from 'src/sections/online-store/delivery-area-domain';

import { useRef, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';

import { CONFIG } from 'src/config-global';

import { Iconify } from 'src/components/iconify';

import { RADIUS_TIER_COLORS } from 'src/sections/online-store/delivery-area-domain';

// ----------------------------------------------------------------------

const TILE_SIZE = 256;

function latLngToWorldPx(lat: number, lng: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldPxToLatLng(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

type Props = {
  lat: number;
  lng: number;
  hasOrigin: boolean;
  activeTiersDesc: DeliveryRadiusTier[];
  initialZoom?: number;
  disabled?: boolean;
  onSelectOrigin: (lat: number, lng: number) => void;
};

export function DeliveryRadiusRasterMap({
  lat,
  lng,
  hasOrigin,
  activeTiersDesc,
  initialZoom = 12,
  disabled,
  onSelectOrigin,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(Math.round(initialZoom));

  const mapboxToken = CONFIG.mapbox.apiKey;
  const centerWorld = useMemo(() => latLngToWorldPx(lat, lng, zoom), [lat, lng, zoom]);
  const mpp = useMemo(() => metersPerPixel(lat, zoom), [lat, zoom]);

  const tiles = useMemo(() => {
    const centerTileX = Math.floor(centerWorld.x / TILE_SIZE);
    const centerTileY = Math.floor(centerWorld.y / TILE_SIZE);
    const maxTile = 2 ** zoom;
    const list: Array<{ key: string; url: string; left: number; top: number }> = [];

    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const tx = (((centerTileX + dx) % maxTile) + maxTile) % maxTile;
        const ty = centerTileY + dy;
        if (ty >= 0 && ty < maxTile) {
          const tileWorldX = (centerTileX + dx) * TILE_SIZE;
          const tileWorldY = ty * TILE_SIZE;
          const url = mapboxToken
            ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/${zoom}/${tx}/${ty}@2x?access_token=${encodeURIComponent(mapboxToken)}`
            : `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
          list.push({
            key: `${zoom}-${tx}-${ty}-${dx}-${dy}`,
            url,
            left: tileWorldX - centerWorld.x,
            top: tileWorldY - centerWorld.y,
          });
        }
      }
    }
    return list;
  }, [centerWorld.x, centerWorld.y, zoom, mapboxToken]);

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickOffsetX = e.clientX - rect.left - rect.width / 2;
    const clickOffsetY = e.clientY - rect.top - rect.height / 2;
    const target = worldPxToLatLng(centerWorld.x + clickOffsetX, centerWorld.y + clickOffsetY, zoom);
    onSelectOrigin(Number(target.lat.toFixed(6)), Number(target.lng.toFixed(6)));
  };

  return (
    <Box
      ref={containerRef}
      onClick={handleMapClick}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        bgcolor: '#e5e7eb',
        cursor: disabled ? 'default' : 'crosshair',
        userSelect: 'none',
      }}
    >
      {/* Grade de tiles centrada */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
        }}
      >
        {tiles.map((tile) => (
          <Box
            key={tile.key}
            component="img"
            src={tile.url}
            alt=""
            draggable={false}
            sx={{
              position: 'absolute',
              left: tile.left,
              top: tile.top,
              width: TILE_SIZE,
              height: TILE_SIZE,
              maxWidth: 'none',
              pointerEvents: 'none',
            }}
          />
        ))}
      </Box>

      {/* Círculos concêntricos de raio em SVG */}
      {hasOrigin && activeTiersDesc.length > 0 && (
        <Box
          component="svg"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {activeTiersDesc.map((tier, idx) => {
            const color = tier.color || RADIUS_TIER_COLORS[idx % RADIUS_TIER_COLORS.length];
            const radiusPx = Math.max(8, (tier.maxKm * 1000) / mpp);
            return (
              <circle
                key={tier.id}
                cx="50%"
                cy="50%"
                r={radiusPx}
                fill={color}
                fillOpacity={0.14}
                stroke={color}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            );
          })}
        </Box>
      )}

      {/* Pin da loja no centro */}
      {hasOrigin && (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 34,
            height: 34,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            color: 'common.white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 4,
            border: '2px solid #fff',
            pointerEvents: 'none',
          }}
        >
          <Iconify icon="solar:shop-bold" width={18} />
        </Box>
      )}

      {/* Controles de zoom */}
      <Paper
        elevation={2}
        onClick={(e) => e.stopPropagation()}
        sx={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 5,
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <Stack>
          <IconButton
            size="small"
            aria-label="Aumentar zoom"
            onClick={() => setZoom((z) => Math.min(18, z + 1))}
          >
            <Iconify icon="mingcute:add-line" width={18} />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Diminuir zoom"
            onClick={() => setZoom((z) => Math.max(8, z - 1))}
          >
            <Iconify icon="mingcute:minimize-line" width={18} />
          </IconButton>
        </Stack>
      </Paper>
    </Box>
  );
}

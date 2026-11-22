import { CONFIG } from 'src/config-global';

// ----------------------------------------------------------------------

export type DeliveryPricingMode = 'fixed' | 'radius' | 'neighborhood';

export type DeliveryRadiusTier = {
  id: string;
  maxKm: number;
  fee: number;
  estimatedMinutes: number;
  active: boolean;
  color?: string;
};

export type DeliveryNeighborhoodRule = {
  id: string;
  name: string;
  city?: string;
  fee: number;
  estimatedMinutes: number;
  active: boolean;
};

export type DeliveryAreaConfig = {
  mode: DeliveryPricingMode;
  originLat?: number;
  originLng?: number;
  originLabel?: string;
  /** Fator multiplicador para aproximar distância em linha reta ao trajeto urbano (padrão 1.25). */
  distanceFactor?: number;
  radiusTiers: DeliveryRadiusTier[];
  neighborhoods: DeliveryNeighborhoodRule[];
  blockOutsideArea: boolean;
};

export type DeliveryQuoteInput = {
  lat?: number;
  lng?: number;
  neighborhood?: string;
  city?: string;
};

export type DeliveryQuoteReason =
  | 'outside_radius'
  | 'neighborhood_not_served'
  | 'address_coords_missing'
  | 'origin_not_configured';

export type DeliveryQuoteResult = {
  deliverable: boolean;
  fee: number;
  estimatedMinutes: number;
  distanceKm?: number;
  matchedLabel?: string;
  reason?: DeliveryQuoteReason;
};

export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
  provider: 'mapbox' | 'nominatim';
};

// ----------------------------------------------------------------------

export const RADIUS_TIER_COLORS = [
  '#00A76F',
  '#00B8D9',
  '#FFAB00',
  '#FF5630',
  '#8E33FF',
  '#3366FF',
];

export const DEFAULT_DISTANCE_FACTOR = 1.25;

export function createDefaultRadiusTiers(): DeliveryRadiusTier[] {
  return [
    { id: 'tier-1', maxKm: 2, fee: 5, estimatedMinutes: 25, active: true, color: '#00A76F' },
    { id: 'tier-2', maxKm: 5, fee: 9, estimatedMinutes: 35, active: true, color: '#00B8D9' },
    { id: 'tier-3', maxKm: 8, fee: 14, estimatedMinutes: 45, active: true, color: '#FFAB00' },
  ];
}

export function createDefaultDeliveryAreaConfig(): DeliveryAreaConfig {
  return {
    mode: 'fixed',
    distanceFactor: DEFAULT_DISTANCE_FACTOR,
    radiusTiers: createDefaultRadiusTiers(),
    neighborhoods: [],
    blockOutsideArea: true,
  };
}

export function normalizeAreaText(value: string | undefined | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculateHaversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function computeEffectiveDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  distanceFactor = DEFAULT_DISTANCE_FACTOR
): number {
  const straightKm = calculateHaversineKm(lat1, lng1, lat2, lng2);
  const factor = Number.isFinite(distanceFactor) && distanceFactor >= 1 ? distanceFactor : 1;
  return Math.round(straightKm * factor * 100) / 100;
}

export function getMaxActiveRadiusKm(area?: DeliveryAreaConfig): number {
  if (!area || !Array.isArray(area.radiusTiers)) return 0;
  const active = area.radiusTiers.filter((t) => t.active && Number(t.maxKm) > 0);
  if (active.length === 0) return 0;
  return Math.max(...active.map((t) => Number(t.maxKm)));
}

export function resolveDeliveryQuote(
  area: DeliveryAreaConfig | undefined,
  fallbackFee: number,
  fallbackMinutes: number,
  input: DeliveryQuoteInput
): DeliveryQuoteResult {
  const safeFallbackFee = Math.max(0, Number(fallbackFee || 0));
  const safeFallbackMin = Math.max(1, Number(fallbackMinutes || 40));

  if (!area || area.mode === 'fixed') {
    return {
      deliverable: true,
      fee: safeFallbackFee,
      estimatedMinutes: safeFallbackMin,
      matchedLabel: 'Taxa fixa',
    };
  }

  if (area.mode === 'radius') {
    const hasOrigin =
      typeof area.originLat === 'number' &&
      Number.isFinite(area.originLat) &&
      typeof area.originLng === 'number' &&
      Number.isFinite(area.originLng);

    if (!hasOrigin) {
      return {
        deliverable: !area.blockOutsideArea,
        fee: safeFallbackFee,
        estimatedMinutes: safeFallbackMin,
        reason: 'origin_not_configured',
      };
    }

    const activeTiers = [...(area.radiusTiers || [])]
      .filter((t) => t.active && Number(t.maxKm) > 0)
      .sort((a, b) => a.maxKm - b.maxKm);

    if (activeTiers.length === 0) {
      return {
        deliverable: true,
        fee: safeFallbackFee,
        estimatedMinutes: safeFallbackMin,
      };
    }

    const hasDest =
      typeof input.lat === 'number' &&
      Number.isFinite(input.lat) &&
      typeof input.lng === 'number' &&
      Number.isFinite(input.lng);

    if (!hasDest) {
      return {
        deliverable: false,
        fee: safeFallbackFee,
        estimatedMinutes: safeFallbackMin,
        reason: 'address_coords_missing',
      };
    }

    const distanceKm = computeEffectiveDistanceKm(
      area.originLat as number,
      area.originLng as number,
      input.lat as number,
      input.lng as number,
      area.distanceFactor ?? DEFAULT_DISTANCE_FACTOR
    );

    const matched = activeTiers.find((tier) => distanceKm <= tier.maxKm);
    if (matched) {
      return {
        deliverable: true,
        fee: Math.max(0, Number(matched.fee || 0)),
        estimatedMinutes: Math.max(1, Number(matched.estimatedMinutes || safeFallbackMin)),
        distanceKm,
        matchedLabel: `Até ${matched.maxKm} km`,
      };
    }

    const lastTier = activeTiers[activeTiers.length - 1];
    return {
      deliverable: !area.blockOutsideArea,
      fee: Math.max(0, Number(lastTier?.fee ?? safeFallbackFee)),
      estimatedMinutes: Math.max(1, Number(lastTier?.estimatedMinutes ?? safeFallbackMin)),
      distanceKm,
      reason: 'outside_radius',
    };
  }

  // mode === 'neighborhood'
  const activeRules = (area.neighborhoods || []).filter(
    (n) => n.active && normalizeAreaText(n.name).length > 0
  );

  if (activeRules.length === 0) {
    return {
      deliverable: true,
      fee: safeFallbackFee,
      estimatedMinutes: safeFallbackMin,
    };
  }

  const targetNeighborhood = normalizeAreaText(input.neighborhood);
  const targetCity = normalizeAreaText(input.city);

  if (!targetNeighborhood) {
    return {
      deliverable: false,
      fee: safeFallbackFee,
      estimatedMinutes: safeFallbackMin,
      reason: 'neighborhood_not_served',
    };
  }

  const matchedRule = activeRules.find((rule) => {
    const ruleName = normalizeAreaText(rule.name);
    const ruleCity = normalizeAreaText(rule.city);
    const nameMatch =
      ruleName === targetNeighborhood ||
      targetNeighborhood.includes(ruleName) ||
      ruleName.includes(targetNeighborhood);
    if (!nameMatch) return false;
    if (ruleCity && targetCity) {
      return ruleCity === targetCity;
    }
    return true;
  });

  if (matchedRule) {
    return {
      deliverable: true,
      fee: Math.max(0, Number(matchedRule.fee || 0)),
      estimatedMinutes: Math.max(1, Number(matchedRule.estimatedMinutes || safeFallbackMin)),
      matchedLabel: matchedRule.name,
    };
  }

  return {
    deliverable: !area.blockOutsideArea,
    fee: safeFallbackFee,
    estimatedMinutes: safeFallbackMin,
    reason: 'neighborhood_not_served',
  };
}

/**
 * Gera um polígono GeoJSON representando um círculo em km ao redor de (lng, lat)
 * para exibição como Source/Layer no Mapbox GL.
 */
export function createCircleGeoJson(
  lng: number,
  lat: number,
  radiusKm: number,
  points = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const distanceX = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;

  for (let i = 0; i < points; i += 1) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([lng + x, lat + y]);
  }
  coords.push(coords[0]);

  return {
    type: 'Feature',
    properties: { radiusKm },
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
  };
}

/**
 * Geocodifica um endereço brasileiro usando Mapbox Geocoding API (quando VITE_MAPBOX_API_KEY está configurado)
 * com fallback automático para Nominatim (OpenStreetMap).
 */
export async function geocodeAddressBrazil(
  addressQuery: string,
  mapboxTokenOverride?: string
): Promise<GeocodeResult | null> {
  const cleanQuery = addressQuery.trim();
  if (!cleanQuery) return null;

  const mapboxToken = mapboxTokenOverride ?? CONFIG.mapbox.apiKey;

  if (mapboxToken) {
    try {
      const encoded = encodeURIComponent(cleanQuery);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?country=br&language=pt&limit=1&access_token=${encodeURIComponent(mapboxToken)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          features?: Array<{ center?: [number, number]; place_name?: string }>;
        };
        const feat = data.features?.[0];
        if (feat?.center && feat.center.length === 2) {
          return {
            lng: feat.center[0],
            lat: feat.center[1],
            label: feat.place_name || cleanQuery,
            provider: 'mapbox',
          };
        }
      }
    } catch {
      // Fallback para Nominatim
    }
  }

  try {
    const encoded = encodeURIComponent(`${cleanQuery}, Brasil`);
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encoded}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const items = (await res.json()) as Array<{
        lat?: string;
        lon?: string;
        display_name?: string;
      }>;
      const first = items?.[0];
      if (first?.lat && first?.lon) {
        const lat = Number(first.lat);
        const lng = Number(first.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return {
            lat,
            lng,
            label: first.display_name || cleanQuery,
            provider: 'nominatim',
          };
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function buildAddressSearchQuery(fields: {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
}): string {
  return [
    fields.street,
    fields.number && fields.number.toUpperCase() !== 'S/N' ? fields.number : undefined,
    fields.neighborhood,
    fields.city,
    fields.state,
    fields.cep,
  ]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ');
}

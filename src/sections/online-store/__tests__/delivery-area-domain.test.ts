import { it, expect, describe } from 'vitest';

import {
  normalizeAreaText,
  createCircleGeoJson,
  calculateHaversineKm,
  resolveDeliveryQuote,
  getMaxActiveRadiusKm,
  createDefaultRadiusTiers,
} from '../delivery-area-domain';

import type { DeliveryAreaConfig } from '../delivery-area-domain';

describe('delivery-area-domain', () => {
  it('normaliza acentos e pontuação de bairros', () => {
    expect(normalizeAreaText('  Nazaré - Belém! ')).toBe('nazare belem');
    expect(normalizeAreaText('São Brás')).toBe('sao bras');
  });

  it('calcula distância Haversine aproximada corretamente', () => {
    // ~1.11 km em latitude (0.01 grau)
    const km = calculateHaversineKm(-1.4558, -48.4902, -1.4458, -48.4902);
    expect(km).toBeGreaterThan(1.0);
    expect(km).toBeLessThan(1.2);
  });

  it('resolve modo fixo com fallback', () => {
    const quote = resolveDeliveryQuote(undefined, 7.5, 35, {});
    expect(quote.deliverable).toBe(true);
    expect(quote.fee).toBe(7.5);
    expect(quote.estimatedMinutes).toBe(35);
  });

  it('resolve faixas de raio em ordem crescente e bloqueia fora do raio máximo', () => {
    const area: DeliveryAreaConfig = {
      mode: 'radius',
      originLat: -1.4558,
      originLng: -48.4902,
      distanceFactor: 1,
      radiusTiers: createDefaultRadiusTiers(), // 2km (R$5), 5km (R$9), 8km (R$14)
      neighborhoods: [],
      blockOutsideArea: true,
    };

    expect(getMaxActiveRadiusKm(area)).toBe(8);

    // ~1.11 km -> faixa até 2 km
    const near = resolveDeliveryQuote(area, 10, 40, { lat: -1.4458, lng: -48.4902 });
    expect(near.deliverable).toBe(true);
    expect(near.fee).toBe(5);
    expect(near.estimatedMinutes).toBe(25);

    // ~3.33 km -> faixa até 5 km
    const mid = resolveDeliveryQuote(area, 10, 40, { lat: -1.4258, lng: -48.4902 });
    expect(mid.deliverable).toBe(true);
    expect(mid.fee).toBe(9);
    expect(mid.estimatedMinutes).toBe(35);

    // ~11.1 km -> fora do raio máximo (8 km)
    const far = resolveDeliveryQuote(area, 10, 40, { lat: -1.3558, lng: -48.4902 });
    expect(far.deliverable).toBe(false);
    expect(far.reason).toBe('outside_radius');
  });

  it('resolve modo por bairros ignorando acentos e bloqueando bairros não atendidos', () => {
    const area: DeliveryAreaConfig = {
      mode: 'neighborhood',
      radiusTiers: [],
      neighborhoods: [
        { id: 'n1', name: 'Nazaré', city: 'Belém', fee: 6, estimatedMinutes: 30, active: true },
        { id: 'n2', name: 'Umarizal', fee: 8, estimatedMinutes: 35, active: true },
        { id: 'n3', name: 'Pedreira', fee: 10, estimatedMinutes: 40, active: false },
      ],
      blockOutsideArea: true,
    };

    const ok = resolveDeliveryQuote(area, 5, 40, { neighborhood: 'Nazare', city: 'Belem' });
    expect(ok.deliverable).toBe(true);
    expect(ok.fee).toBe(6);
    expect(ok.estimatedMinutes).toBe(30);

    const inactive = resolveDeliveryQuote(area, 5, 40, { neighborhood: 'Pedreira' });
    expect(inactive.deliverable).toBe(false);
    expect(inactive.reason).toBe('neighborhood_not_served');
  });

  it('gera polígono GeoJSON fechado para o círculo de raio', () => {
    const circle = createCircleGeoJson(-48.4902, -1.4558, 3, 32);
    expect(circle.geometry.type).toBe('Polygon');
    expect(circle.geometry.coordinates[0]).toHaveLength(33);
    expect(circle.geometry.coordinates[0][0]).toEqual(circle.geometry.coordinates[0][32]);
  });
});

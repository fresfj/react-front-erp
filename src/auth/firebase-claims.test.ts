import { it, expect, describe } from 'vitest';

import {
  isTenantRole,
  parseFirebaseTenantClaims,
  parseFirebaseSessionClaims,
} from './firebase-claims';

describe('isTenantRole', () => {
  it('accepts admin|gestor|operador only', () => {
    expect(isTenantRole('admin')).toBe(true);
    expect(isTenantRole('gestor')).toBe(true);
    expect(isTenantRole('operador')).toBe(true);
    expect(isTenantRole('gerente')).toBe(false);
    expect(isTenantRole('vendedor')).toBe(false);
  });
});

describe('parseFirebaseTenantClaims', () => {
  it('returns null without enterpriseId or valid role', () => {
    expect(parseFirebaseTenantClaims({ empresaId: 'x', role: 'admin' })).toBeNull();
    expect(parseFirebaseTenantClaims({ enterpriseId: 'e1', role: 'gerente' })).toBeNull();
  });

  it('parses enterpriseId + role', () => {
    expect(parseFirebaseTenantClaims({ enterpriseId: 'ent-1', role: 'operador' })).toEqual({
      enterpriseId: 'ent-1',
      role: 'operador',
    });
  });

  it('coerces numeric enterpriseId to string', () => {
    expect(parseFirebaseTenantClaims({ enterpriseId: 42, role: 'admin' })).toEqual({
      enterpriseId: '42',
      role: 'admin',
    });
  });
});

describe('parseFirebaseSessionClaims', () => {
  it('allows platformAdmin without tenant', () => {
    expect(parseFirebaseSessionClaims({ platformAdmin: true })).toEqual({
      platformAdmin: true,
      tenant: null,
      claimsValid: true,
    });
  });

  it('allows tenant without platformAdmin', () => {
    expect(
      parseFirebaseSessionClaims({ enterpriseId: 'ent-1', role: 'admin' })
    ).toMatchObject({
      platformAdmin: false,
      claimsValid: true,
      tenant: { enterpriseId: 'ent-1', role: 'admin' },
    });
  });

  it('rejects empty claims', () => {
    expect(parseFirebaseSessionClaims({})).toEqual({
      platformAdmin: false,
      tenant: null,
      claimsValid: false,
    });
  });
});
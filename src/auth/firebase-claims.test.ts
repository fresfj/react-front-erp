import { describe, expect, it } from 'vitest';

import {
  isTenantRole,
  parseFirebaseTenantClaims,
} from './firebase-claims';

describe('isTenantRole', () => {
  it('accepts only admin|gerente|vendedor', () => {
    expect(isTenantRole('admin')).toBe(true);
    expect(isTenantRole('gerente')).toBe(true);
    expect(isTenantRole('vendedor')).toBe(true);
    expect(isTenantRole('super_admin')).toBe(false);
    expect(isTenantRole('')).toBe(false);
    expect(isTenantRole(null)).toBe(false);
  });
});

describe('parseFirebaseTenantClaims', () => {
  it('returns null when empresaId or role missing/invalid', () => {
    expect(parseFirebaseTenantClaims(undefined)).toBeNull();
    expect(parseFirebaseTenantClaims({})).toBeNull();
    expect(parseFirebaseTenantClaims({ empresaId: 'e1' })).toBeNull();
    expect(parseFirebaseTenantClaims({ role: 'admin' })).toBeNull();
    expect(parseFirebaseTenantClaims({ empresaId: 'e1', role: 'boss' })).toBeNull();
    expect(parseFirebaseTenantClaims({ empresaId: '', role: 'admin' })).toBeNull();
  });

  it('returns empresaId + role when valid', () => {
    expect(parseFirebaseTenantClaims({ empresaId: 'emp-1', role: 'vendedor' })).toEqual({
      empresaId: 'emp-1',
      role: 'vendedor',
    });
  });

  it('coerces numeric empresaId to string', () => {
    expect(parseFirebaseTenantClaims({ empresaId: 42, role: 'admin' })).toEqual({
      empresaId: '42',
      role: 'admin',
    });
  });
});
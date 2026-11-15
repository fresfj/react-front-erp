import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearClientAuthStorage,
  getErpSessionParams,
  resolveUserRole,
  tryGetErpSessionParams,
  USER_STORAGE_KEY,
} from './erp-session';
import { STORAGE_KEY } from '../context/jwt/constant';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  // @ts-expect-error minimal sessionStorage mock
  globalThis.sessionStorage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
  };
});

describe('resolveUserRole', () => {
  it('returns null when role missing (does not invent admin)', () => {
    expect(resolveUserRole({})).toBeNull();
    expect(resolveUserRole({ role: '' })).toBeNull();
    expect(resolveUserRole(null)).toBeNull();
  });

  it('returns role when present', () => {
    expect(resolveUserRole({ role: 'editor' })).toBe('editor');
  });
});

describe('getErpSessionParams', () => {
  it('throws when user storage missing', () => {
    expect(() => getErpSessionParams()).toThrow(/Incomplete ERP session/);
  });

  it('returns mapped params when complete', () => {
    sessionStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({
        ide_empr: 1,
        ide_sucu: 2,
        ide_usua: 3,
        ide_perf: 4,
        login: 'demo',
        ip: '10.0.0.1',
        device: 'web',
      })
    );
    expect(getErpSessionParams()).toEqual({
      ideEmpr: 1,
      ideSucu: 2,
      ideUsua: 3,
      idePerf: 4,
      login: 'demo',
      ip: '10.0.0.1',
      device: 'web',
    });
  });

  it('tryGet returns null instead of throw', () => {
    expect(tryGetErpSessionParams()).toBeNull();
  });
});

describe('clearClientAuthStorage', () => {
  it('removes user and jwt keys', () => {
    sessionStorage.setItem(USER_STORAGE_KEY, '{}');
    sessionStorage.setItem(STORAGE_KEY, 'token');
    clearClientAuthStorage();
    expect(sessionStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
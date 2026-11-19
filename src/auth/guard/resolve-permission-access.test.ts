import { it, expect, describe } from 'vitest';

import { resolvePermissionAccess } from './resolve-permission-access';

describe('resolvePermissionAccess', () => {
  it('allows platformAdmin when requirePlatformAdmin', () => {
    expect(
      resolvePermissionAccess({
        platformAdmin: true,
        requirePlatformAdmin: true,
      })
    ).toBe(true);
  });

  it('denies non-platformAdmin when requirePlatformAdmin', () => {
    expect(
      resolvePermissionAccess({
        platformAdmin: false,
        role: 'admin',
        requirePlatformAdmin: true,
      })
    ).toBe(false);
  });

  it('allows platformAdmin for any module permission', () => {
    expect(
      resolvePermissionAccess({
        platformAdmin: true,
        permission: 'dre',
      })
    ).toBe(true);
  });

  it('allows admin role for any permission via getEffectivePermissions', () => {
    expect(
      resolvePermissionAccess({
        role: 'admin',
        permission: 'dre',
      })
    ).toBe(true);
  });

  it('allows operador only when custom permissions include key', () => {
    expect(
      resolvePermissionAccess({
        role: 'operador',
        permissions: ['pos'],
        permission: 'pos',
      })
    ).toBe(true);
    expect(
      resolvePermissionAccess({
        role: 'operador',
        permissions: ['pos'],
        permission: 'products',
      })
    ).toBe(false);
  });

  it('allows any-of when permission is an array', () => {
    expect(
      resolvePermissionAccess({
        role: 'operador',
        permissions: ['batches_read'],
        permission: ['batches_read', 'batches_write'],
      })
    ).toBe(true);
  });

  it('allows only listed roles when roles prop is set', () => {
    expect(
      resolvePermissionAccess({
        role: 'gestor',
        roles: ['admin', 'gestor'],
      })
    ).toBe(true);
    expect(
      resolvePermissionAccess({
        role: 'operador',
        roles: ['admin', 'gestor'],
      })
    ).toBe(false);
  });

  it('allows platformAdmin when roles prop is set', () => {
    expect(
      resolvePermissionAccess({
        platformAdmin: true,
        role: undefined,
        roles: ['admin', 'gestor'],
      })
    ).toBe(true);
  });
});

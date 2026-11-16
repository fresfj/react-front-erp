import type { TenantRole } from 'src/auth/firebase-claims';
import type { MemberPermissionKey } from 'src/api/firestore/members';

import { getEffectivePermissions } from 'src/api/firestore/members';

export type PermissionAccessInput = {
  platformAdmin?: boolean;
  role?: TenantRole | string | null;
  permissions?: string[] | null;
  requirePlatformAdmin?: boolean;
  roles?: TenantRole[];
  permission?: MemberPermissionKey | MemberPermissionKey[];
};

export function resolvePermissionAccess(input: PermissionAccessInput): boolean {
  const {
    platformAdmin,
    role,
    permissions,
    requirePlatformAdmin,
    roles,
    permission,
  } = input;

  if (requirePlatformAdmin) {
    return platformAdmin === true;
  }

  if (platformAdmin === true) {
    return true;
  }

  if (roles && roles.length > 0) {
    return typeof role === 'string' && (roles as string[]).includes(role);
  }

  if (permission == null) {
    return true;
  }

  const effective = getEffectivePermissions(role, permissions);
  const required = Array.isArray(permission) ? permission : [permission];
  return required.some((key) => effective.has(key));
}

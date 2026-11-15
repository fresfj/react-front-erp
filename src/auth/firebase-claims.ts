export type TenantRole = 'admin' | 'gerente' | 'vendedor';

export const TENANT_ROLES = ['admin', 'gerente', 'vendedor'] as const;

export type FirebaseTenantClaims = {
  empresaId: string;
  role: TenantRole;
};

export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && (TENANT_ROLES as readonly string[]).includes(value);
}

export function parseFirebaseTenantClaims(
  claims: Record<string, unknown> | null | undefined
): FirebaseTenantClaims | null {
  if (!claims) return null;

  const rawEmpresa = claims.empresaId;
  const empresaId =
    typeof rawEmpresa === 'string' || typeof rawEmpresa === 'number'
      ? String(rawEmpresa).trim()
      : '';

  if (!empresaId) return null;
  if (!isTenantRole(claims.role)) return null;

  return { empresaId, role: claims.role };
}
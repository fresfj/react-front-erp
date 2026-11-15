export type TenantRole = 'admin' | 'gestor' | 'operador';
export const TENANT_ROLES = ['admin', 'gestor', 'operador'] as const;

export type FirebaseTenantClaims = {
  enterpriseId: string;
  role: TenantRole;
};

export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && (TENANT_ROLES as readonly string[]).includes(value);
}

export function parseFirebaseTenantClaims(
  claims: Record<string, unknown> | null | undefined
): FirebaseTenantClaims | null {
  if (!claims) return null;
  const raw = claims.enterpriseId;
  const enterpriseId =
    typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!enterpriseId || !isTenantRole(claims.role)) return null;
  return { enterpriseId, role: claims.role };
}
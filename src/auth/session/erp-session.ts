import { STORAGE_KEY } from 'src/auth/context/jwt/constant';

export const USER_STORAGE_KEY = 'user';
export { STORAGE_KEY as JWT_STORAGE_KEY };

export type ErpSessionParams = {
  ideEmpr: string | number;
  ideSucu: string | number;
  ideUsua: string | number;
  idePerf: string | number;
  login: string;
  ip: string;
  device?: string;
};

export function readStoredUser(): Record<string, unknown> | null {
  const raw = sessionStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function getErpSessionParams(): ErpSessionParams {
  const user = readStoredUser();
  if (
    !user ||
    user.ide_empr == null ||
    user.ide_sucu == null ||
    user.ide_usua == null ||
    user.ide_perf == null ||
    !user.login
  ) {
    throw new Error('Incomplete ERP session');
  }
  return {
    ideEmpr: user.ide_empr as string | number,
    ideSucu: user.ide_sucu as string | number,
    ideUsua: user.ide_usua as string | number,
    idePerf: user.ide_perf as string | number,
    login: String(user.login),
    ip: (user.ip as string) || '127.0.0.1',
    device: user.device as string | undefined,
  };
}

export function tryGetErpSessionParams(): ErpSessionParams | null {
  try {
    return getErpSessionParams();
  } catch {
    return null;
  }
}

export function clearClientAuthStorage(): void {
  sessionStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

export function resolveUserRole(user: Record<string, unknown> | null | undefined): string | null {
  const role = user?.role;
  return typeof role === 'string' && role.trim() ? role : null;
}
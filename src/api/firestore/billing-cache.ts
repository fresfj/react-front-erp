// ----------------------------------------------------------------------
// In-memory TTL cache for billing reads (avoid refetch on remount)

type CacheEntry<T> = { data: T; at: number };

const store = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 60_000;

export function peekBillingCache<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | undefined {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.data;
  }
  return undefined;
}

export async function getCachedBilling<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number; force?: boolean }
): Promise<T> {
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;
  if (!opts?.force) {
    const hit = peekBillingCache<T>(key, ttl);
    if (hit !== undefined) {
      return hit;
    }
  }
  const data = await fetcher();
  store.set(key, { data, at: Date.now() });
  return data;
}

export function invalidateBillingCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  Array.from(store.keys()).forEach((key) => {
    if (key.startsWith(prefix)) store.delete(key);
  });
}

import type { Product } from 'src/api/firestore/products';

import useSWR from 'swr';
import { useMemo } from 'react';

import { listProducts } from 'src/api/firestore/products';

// ----------------------------------------------------------------------

const MEMORY_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  items: Product[];
  fetchedAt: number;
};

const enterpriseProductsCache = new Map<string, CacheEntry>();

async function fetchEnterpriseProductsCached(enterpriseId: string): Promise<Product[]> {
  const existing = enterpriseProductsCache.get(enterpriseId);
  if (existing && Date.now() - existing.fetchedAt < MEMORY_TTL_MS) {
    return existing.items;
  }
  const items = await listProducts(enterpriseId);
  enterpriseProductsCache.set(enterpriseId, { items, fetchedAt: Date.now() });
  return items;
}

export function invalidateEnterpriseProductsCache(enterpriseId?: string) {
  if (enterpriseId) {
    enterpriseProductsCache.delete(enterpriseId);
  } else {
    enterpriseProductsCache.clear();
  }
}

/**
 * Global in-memory store (SWR + module cache) for enterprise products.
 * Avoids hitting Firestore repeatedly when opening/closing POS tables or dialogs.
 */
export function useEnterpriseProductsStore(enterpriseId?: string) {
  const swrKey = enterpriseId ? ['enterprise-products-store', enterpriseId] : null;
  const fallback = enterpriseId ? enterpriseProductsCache.get(enterpriseId)?.items : undefined;

  const { data, isLoading, isValidating, error, mutate } = useSWR<Product[]>(
    swrKey,
    () => fetchEnterpriseProductsCached(enterpriseId!),
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: MEMORY_TTL_MS,
    }
  );

  const products = useMemo(() => data ?? [], [data]);

  const refreshProducts = async () => {
    if (!enterpriseId) return;
    invalidateEnterpriseProductsCache(enterpriseId);
    await mutate();
  };

  return {
    products,
    productsLoading: Boolean(enterpriseId) && isLoading && !fallback,
    productsValidating: isValidating,
    productsError: error,
    refreshProducts,
  };
}

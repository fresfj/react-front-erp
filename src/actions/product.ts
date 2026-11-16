import type { IProductItem } from 'src/types/product';

import { useMemo } from 'react';

import { _products } from 'src/_mock';

// ----------------------------------------------------------------------
// Demo product actions use local mocks so /dashboard/product works without
// the Minimals mock API server (CONFIG.site.serverUrl).

function getProductById(productId: string): IProductItem | undefined {
  return _products.find((item) => item.id === productId);
}

// ----------------------------------------------------------------------

export function useGetProducts() {
  const memoizedValue = useMemo(
    () => ({
      products: _products,
      productsLoading: false,
      productsError: null as Error | null,
      productsValidating: false,
      productsEmpty: !_products.length,
    }),
    []
  );

  return memoizedValue;
}

// ----------------------------------------------------------------------

export function useGetProduct(productId: string) {
  const memoizedValue = useMemo(() => {
    const product = productId ? getProductById(productId) : undefined;

    return {
      product,
      productLoading: false,
      productError: productId && !product ? new Error('Product not found') : null,
      productValidating: false,
    };
  }, [productId]);

  return memoizedValue;
}

// ----------------------------------------------------------------------

export function useSearchProducts(query: string) {
  const memoizedValue = useMemo(() => {
    const q = query.trim().toLowerCase();
    const results = q
      ? _products.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.sku.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q)
        )
      : [];

    return {
      searchResults: results,
      searchLoading: false,
      searchError: null as Error | null,
      searchValidating: false,
      searchEmpty: !results.length,
    };
  }, [query]);

  return memoizedValue;
}

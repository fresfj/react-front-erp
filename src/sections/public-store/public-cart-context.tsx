import type { ReactNode } from 'react';
import type { PublicStorefrontProduct } from 'src/api/firestore/online-orders';

import { useMemo, useState, useContext, useCallback, createContext } from 'react';

// ----------------------------------------------------------------------

export type PublicCartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  imageUrl?: string;
  notes?: string;
};

type PublicCartContextValue = {
  lines: PublicCartLine[];
  addLine: (product: PublicStorefrontProduct, qty: number, notes?: string) => void;
  updateQty: (productId: string, qty: number) => void;
  removeLine: (productId: string) => void;
  clear: () => void;
  itemCount: number;
  subtotal: number;
};

const PublicCartContext = createContext<PublicCartContextValue | null>(null);

export function PublicCartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<PublicCartLine[]>([]);

  const addLine = useCallback((product: PublicStorefrontProduct, qty: number, notes?: string) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id
            ? { ...l, qty: l.qty + qty, notes: notes ?? l.notes }
            : l
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPrice: product.salePrice,
          qty,
          imageUrl: product.imageUrl,
          notes,
        },
      ];
    });
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty } : l))
        .filter((l) => l.qty > 0)
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(() => {
    const subtotal = Math.round(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100;
    const itemCount = lines.reduce((s, l) => s + l.qty, 0);
    return { lines, addLine, updateQty, removeLine, clear, itemCount, subtotal };
  }, [lines, addLine, updateQty, removeLine, clear]);

  return <PublicCartContext.Provider value={value}>{children}</PublicCartContext.Provider>;
}

export function usePublicCart() {
  const ctx = useContext(PublicCartContext);
  if (!ctx) throw new Error('usePublicCart must be used within PublicCartProvider');
  return ctx;
}

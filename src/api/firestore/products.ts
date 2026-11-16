import {
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteField,
} from 'firebase/firestore';

import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';

// ----------------------------------------------------------------------

export type ProductType = 'raw' | 'finished';

export type Product = {
  id: string;
  name: string;
  sku: string;
  ean?: string;
  type: ProductType;
  category?: string;
  unit: string;
  costPrice?: number;
  salePrice?: number;
  minStock?: number;
  expirationDate?: string;
  supplierId?: string;
  supplierName?: string;
  variant?: string;
  tags?: string[];
  taxPercent?: number;
  imageUrl?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function productRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'products'), id);
}

function optStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

function mapProduct(id: string, data: Record<string, unknown>): Product {
  const type = data.type === 'raw' ? 'raw' : 'finished';

  return {
    id,
    name: String(data.name ?? ''),
    sku: String(data.sku ?? ''),
    ean: optStr(data.ean),
    type,
    category: optStr(data.category),
    unit: String(data.unit ?? 'un'),
    costPrice: typeof data.costPrice === 'number' ? data.costPrice : undefined,
    salePrice: typeof data.salePrice === 'number' ? data.salePrice : undefined,
    minStock: typeof data.minStock === 'number' ? data.minStock : undefined,
    expirationDate: optStr(data.expirationDate),
    supplierId: optStr(data.supplierId),
    supplierName: optStr(data.supplierName),
    variant: optStr(data.variant),
    tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t)) : undefined,
    taxPercent: typeof data.taxPercent === 'number' ? data.taxPercent : undefined,
    imageUrl: optStr(data.imageUrl),
    active: data.active !== false,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

// ----------------------------------------------------------------------

export async function listProducts(enterpriseId: string): Promise<Product[]> {
  const col = enterpriseCollection(enterpriseId, 'products');
  const snap = await getDocs(col);
  return snap.docs.map((d) => mapProduct(d.id, d.data() as Record<string, unknown>));
}

export async function getProduct(enterpriseId: string, id: string): Promise<Product | null> {
  const snap = await getDoc(productRef(enterpriseId, id));
  if (!snap.exists()) {
    return null;
  }
  return mapProduct(snap.id, snap.data() as Record<string, unknown>);
}

export async function createProduct(
  enterpriseId: string,
  data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const col = enterpriseCollection(enterpriseId, 'products');
  const timestamp = nowIso();
  const ref = await addDoc(
    col,
    omitUndefined({
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  );
  return ref.id;
}

export async function updateProduct(
  enterpriseId: string,
  id: string,
  data: Partial<Product>
): Promise<void> {
  const updates = { ...data };
  delete updates.id;
  delete updates.createdAt;

  const clearVariant =
    Object.prototype.hasOwnProperty.call(data, 'variant') && data.variant === undefined;

  await updateDoc(productRef(enterpriseId, id), {
    ...omitUndefined({
      ...updates,
      updatedAt: nowIso(),
    }),
    ...(clearVariant ? { variant: deleteField() } : {}),
  });
}

export async function deactivateProduct(enterpriseId: string, id: string): Promise<void> {
  await updateDoc(productRef(enterpriseId, id), {
    active: false,
    updatedAt: nowIso(),
  });
}

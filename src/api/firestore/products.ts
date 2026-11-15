import {
  doc,
  query,
  where,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';

import { enterpriseCollection } from './paths';

// ----------------------------------------------------------------------

export type ProductType = 'raw' | 'finished';

export type Product = {
  id: string;
  name: string;
  sku: string;
  type: ProductType;
  unit: string;
  costPrice?: number;
  salePrice?: number;
  variant?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function productRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, 'products'), id);
}

function mapProduct(id: string, data: Record<string, unknown>): Product {
  const type = data.type === 'finished' ? 'finished' : 'raw';

  return {
    id,
    name: String(data.name ?? ''),
    sku: String(data.sku ?? ''),
    type,
    unit: String(data.unit ?? ''),
    costPrice: typeof data.costPrice === 'number' ? data.costPrice : undefined,
    salePrice: typeof data.salePrice === 'number' ? data.salePrice : undefined,
    variant: data.variant != null ? String(data.variant) : undefined,
    active: Boolean(data.active),
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
  const q = query(col, where('active', '==', true));
  const snap = await getDocs(q);
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
  const ref = await addDoc(col, {
    ...data,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
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
  await updateDoc(productRef(enterpriseId, id), {
    ...updates,
    updatedAt: nowIso(),
  });
}

export async function deactivateProduct(enterpriseId: string, id: string): Promise<void> {
  await updateDoc(productRef(enterpriseId, id), {
    active: false,
    updatedAt: nowIso(),
  });
}
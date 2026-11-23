import type { ProductDiscountType } from 'src/utils/product-pricing';
import type { ProductServingTemp } from 'src/components/product-badges/product-image-badges';

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

export type { ProductServingTemp, ProductDiscountType };

export type ProductType = 'raw' | 'finished';

export type ProductComboItem = {
  productId: string;
  productName: string;
  qty: number;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  ean?: string;
  type: ProductType;
  category?: string;
  description?: string;
  unit: string;
  costPrice?: number;
  salePrice?: number;
  promoActive?: boolean;
  discountType?: ProductDiscountType;
  discountValue?: number;
  servingTemperature?: ProductServingTemp;
  isCombo?: boolean;
  comboItems?: ProductComboItem[];
  servesCount?: number;
  featured?: boolean;
  minStock?: number;
  expirationDate?: string;
  supplierId?: string;
  supplierName?: string;
  variant?: string;
  tags?: string[];
  taxPercent?: number;
  ncm?: string;
  origin?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  cfopSaleDefault?: string;
  cstOrCsosn?: string;
  commercialUnit?: string;
  cest?: string;
  taxBenefitCode?: string;
  cbsRate?: number;
  ibsRate?: number;
  cClassTrib?: string;
  taxClassificationNotes?: string;
  imageUrl?: string;
  showOnline?: boolean;
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

function mapServingTemp(val: unknown): ProductServingTemp | undefined {
  if (val === 'cold' || val === 'hot' || val === 'none') return val;
  return undefined;
}

function mapComboItems(raw: unknown): ProductComboItem[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw
    .map((item) => {
      const rec = item as Record<string, unknown>;
      return {
        productId: String(rec.productId ?? ''),
        productName: String(rec.productName ?? ''),
        qty: Math.max(1, Number(rec.qty ?? 1)),
      };
    })
    .filter((i) => Boolean(i.productId));
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
    description: optStr(data.description),
    unit: String(data.unit ?? 'un'),
    costPrice: typeof data.costPrice === 'number' ? data.costPrice : undefined,
    salePrice: typeof data.salePrice === 'number' ? data.salePrice : undefined,
    promoActive: data.promoActive === true,
    discountType: data.discountType === 'fixed' ? 'fixed' : data.discountType === 'percent' ? 'percent' : undefined,
    discountValue: typeof data.discountValue === 'number' ? data.discountValue : undefined,
    servingTemperature: mapServingTemp(data.servingTemperature),
    isCombo: data.isCombo === true,
    comboItems: mapComboItems(data.comboItems),
    servesCount: typeof data.servesCount === 'number' ? data.servesCount : undefined,
    featured: data.featured === true,
    minStock: typeof data.minStock === 'number' ? data.minStock : undefined,
    expirationDate: optStr(data.expirationDate),
    supplierId: optStr(data.supplierId),
    supplierName: optStr(data.supplierName),
    variant: optStr(data.variant),
    tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t)) : undefined,
    taxPercent: typeof data.taxPercent === 'number' ? data.taxPercent : undefined,
    ncm: optStr(data.ncm),
    origin:
      typeof data.origin === 'number' &&
      Number.isInteger(data.origin) &&
      data.origin >= 0 &&
      data.origin <= 8
        ? (data.origin as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8)
        : undefined,
    cfopSaleDefault: optStr(data.cfopSaleDefault),
    cstOrCsosn: optStr(data.cstOrCsosn),
    commercialUnit: optStr(data.commercialUnit),
    cest: optStr(data.cest),
    taxBenefitCode: optStr(data.taxBenefitCode),
    cbsRate: typeof data.cbsRate === 'number' ? data.cbsRate : undefined,
    ibsRate: typeof data.ibsRate === 'number' ? data.ibsRate : undefined,
    cClassTrib: optStr(data.cClassTrib),
    taxClassificationNotes: optStr(data.taxClassificationNotes),
    imageUrl: optStr(data.imageUrl),
    showOnline: data.showOnline === true,
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

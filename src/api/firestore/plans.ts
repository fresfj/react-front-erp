import { doc, getDoc, getDocs, collection } from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

// ----------------------------------------------------------------------

export type PlanCode = 'free' | 'pro' | 'ultra';

export type Plan = {
  id: string;
  code: PlanCode;
  name: string;
  description?: string;
  priceMonthly: number;
  currency: 'BRL';
  features: string[];
  entitlements: string[];
  sortOrder: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function mapPlan(id: string, data: Record<string, unknown>): Plan {
  const codeRaw = String(data.code ?? 'free');
  const code: PlanCode =
    codeRaw === 'pro' || codeRaw === 'ultra' || codeRaw === 'free' ? codeRaw : 'free';

  return {
    id,
    code,
    name: String(data.name ?? ''),
    description: data.description != null ? String(data.description) : undefined,
    priceMonthly: Number(data.priceMonthly ?? 0),
    currency: 'BRL',
    features: Array.isArray(data.features)
      ? data.features.map((f) => String(f))
      : [],
    entitlements: Array.isArray(data.entitlements)
      ? data.entitlements.map((e) => String(e))
      : [],
    sortOrder: Number(data.sortOrder ?? 0),
    active: data.active !== false,
    createdAt: data.createdAt != null ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
  };
}

export async function listPlans(opts?: { activeOnly?: boolean }): Promise<Plan[]> {
  const snap = await getDocs(collection(FIRESTORE, 'plans'));
  let plans = snap.docs.map((item) => mapPlan(item.id, item.data() as Record<string, unknown>));
  if (opts?.activeOnly) {
    plans = plans.filter((p) => p.active);
  }
  return plans.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getPlan(id: string): Promise<Plan | null> {
  const snap = await getDoc(doc(FIRESTORE, 'plans', id));
  if (!snap.exists()) return null;
  return mapPlan(snap.id, snap.data() as Record<string, unknown>);
}

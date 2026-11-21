import type { TenantRole } from 'src/auth/firebase-claims';

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';

import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';

// ----------------------------------------------------------------------

export type MemberPermissionKey =
  | 'pos' // Emitir Venda (PDV)
  | 'tables' // Salão, Mesas e Garçom
  | 'customers' // Clientes
  | 'cash_close' // Fechar Caixa (Sem relatórios financeiros DRE)
  | 'batches_read' // Consultar Estoque / Lotes
  | 'products' // Gerenciar Produtos
  | 'suppliers' // Gerenciar Fornecedores
  | 'processing' // Ordens de Beneficiamento
  | 'batches_write' // Entrada de Lotes
  | 'dre'; // Relatórios Financeiros (DRE)

export const DEFAULT_OPERATOR_PERMISSIONS: MemberPermissionKey[] = [
  'pos',
  'customers',
  'cash_close',
  'batches_read',
];

export const ALL_MEMBER_PERMISSIONS: {
  key: MemberPermissionKey;
  label: string;
  description: string;
  defaultForOperator?: boolean;
}[] = [
  {
    key: 'pos',
    label: 'Emitir Venda (PDV)',
    description: 'Acesso à Frente de Caixa e emissão de vendas',
    defaultForOperator: true,
  },
  {
    key: 'tables',
    label: 'Mesas e Garçom (Salão)',
    description: 'Abrir mesas, lançar pedidos de salão e encerrar comandas de mesas',
    defaultForOperator: true,
  },
  {
    key: 'customers',
    label: 'Clientes',
    description: 'Cadastrar, consultar clientes e gerenciar débitos/crediário',
    defaultForOperator: true,
  },
  {
    key: 'cash_close',
    label: 'Fechar Caixa',
    description: 'Abertura, sangria, suprimento e fechamento cego de caixa',
    defaultForOperator: true,
  },
  {
    key: 'batches_read',
    label: 'Consultar Estoque e Lotes',
    description: 'Visualizar lotes FIFO e movimentações de estoque',
    defaultForOperator: true,
  },
  {
    key: 'products',
    label: 'Cadastro de Produtos',
    description: 'Criar e editar produtos acabados e insumos',
  },
  {
    key: 'suppliers',
    label: 'Fornecedores',
    description: 'Criar e editar fornecedores da empresa',
  },
  {
    key: 'processing',
    label: 'Beneficiamento e Produção',
    description: 'Registrar ordens de beneficiamento e rateio de lotes',
  },
  {
    key: 'batches_write',
    label: 'Entrada de Lotes / Compras',
    description: 'Dar entrada em novos lotes de mercadoria',
  },
  {
    key: 'dre',
    label: 'Relatórios Financeiros (DRE)',
    description: 'Visualizar lucro líquido, margens e demonstrativo financeiro',
  },
];

export type TeamMember = {
  uid: string;
  email: string;
  displayName?: string;
  phone?: string;
  photoURL?: string;
  role: TenantRole;
  permissions: MemberPermissionKey[];
  discountLimitPercent?: number;
  active: boolean;
  invitedAt?: string;
  updatedAt?: string;
};

function memberRef(enterpriseId: string, uid: string) {
  return doc(enterpriseCollection(enterpriseId, 'members'), uid);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function getEffectivePermissions(
  role?: TenantRole | string | null,
  customPermissions?: string[] | null
): Set<MemberPermissionKey> {
  if (role === 'admin' || role === 'gestor') {
    return new Set(ALL_MEMBER_PERMISSIONS.map((p) => p.key));
  }
  if (Array.isArray(customPermissions) && customPermissions.length > 0) {
    return new Set(customPermissions as MemberPermissionKey[]);
  }
  return new Set(DEFAULT_OPERATOR_PERMISSIONS);
}

function mapTeamMember(uid: string, data: Record<string, unknown>): TeamMember {
  const role: TenantRole =
    data.role === 'admin' || data.role === 'gestor' ? data.role : 'operador';
  const rawPerms = Array.isArray(data.permissions)
    ? (data.permissions.map((p) => String(p)) as MemberPermissionKey[])
    : role === 'operador'
      ? DEFAULT_OPERATOR_PERMISSIONS
      : ALL_MEMBER_PERMISSIONS.map((p) => p.key);

  return {
    uid,
    email: String(data.email ?? ''),
    displayName: data.displayName != null ? String(data.displayName) : undefined,
    phone: data.phone != null ? String(data.phone) : undefined,
    photoURL: data.photoURL != null ? String(data.photoURL) : undefined,
    role,
    permissions: rawPerms,
    discountLimitPercent:
      typeof data.discountLimitPercent === 'number' ? data.discountLimitPercent : undefined,
    active: data.active !== false,
    invitedAt: data.invitedAt != null ? String(data.invitedAt) : undefined,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
  };
}

// ----------------------------------------------------------------------

export type MemberProfile = {
  displayName?: string;
  phone?: string;
  photoURL?: string;
  birthDate?: string;
  zipCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  updatedAt: string;
};

function optMemberStr(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val);
}

export async function getMember(
  enterpriseId: string,
  uid: string
): Promise<MemberProfile | null> {
  const snap = await getDoc(memberRef(enterpriseId, uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    displayName: optMemberStr(data.displayName),
    phone: optMemberStr(data.phone),
    photoURL: optMemberStr(data.photoURL),
    birthDate: optMemberStr(data.birthDate),
    zipCode: optMemberStr(data.zipCode),
    address: optMemberStr(data.address),
    addressNumber: optMemberStr(data.addressNumber),
    complement: optMemberStr(data.complement),
    neighborhood: optMemberStr(data.neighborhood),
    city: optMemberStr(data.city),
    state: optMemberStr(data.state),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export async function setMember(
  enterpriseId: string,
  uid: string,
  data: Partial<Omit<MemberProfile, 'updatedAt'>>
): Promise<void> {
  await setDoc(
    memberRef(enterpriseId, uid),
    omitUndefined({
      ...data,
      updatedAt: nowIso(),
    }),
    { merge: true }
  );
}

export async function listTeamMembers(enterpriseId: string): Promise<TeamMember[]> {
  const col = enterpriseCollection(enterpriseId, 'members');
  const snap = await getDocs(col);
  const rows = snap.docs.map((d) => mapTeamMember(d.id, d.data() as Record<string, unknown>));
  return rows.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
}

export async function getTeamMember(
  enterpriseId: string,
  uid: string
): Promise<TeamMember | null> {
  const snap = await getDoc(memberRef(enterpriseId, uid));
  if (!snap.exists()) return null;
  return mapTeamMember(snap.id, snap.data() as Record<string, unknown>);
}

export async function updateTeamMemberPermissions(
  enterpriseId: string,
  uid: string,
  patch: {
    role?: TenantRole;
    permissions?: MemberPermissionKey[];
    displayName?: string;
    discountLimitPercent?: number;
    active?: boolean;
  }
): Promise<void> {
  await setDoc(
    memberRef(enterpriseId, uid),
    omitUndefined({
      ...patch,
      updatedAt: nowIso(),
    }),
    { merge: true }
  );
}

export async function deactivateTeamMember(enterpriseId: string, uid: string): Promise<void> {
  await updateDoc(memberRef(enterpriseId, uid), {
    active: false,
    updatedAt: nowIso(),
  });
}

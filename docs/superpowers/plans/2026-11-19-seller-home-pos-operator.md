# Seller Home (operador PDV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operador com `pos` entra em `/dashboard` numa Home do vendedor (vendas da loja hoje, pedidos online, atalhos PDV) em vez do overview zerado; catálogo continua só no checkout.

**Architecture:** Page index `/dashboard` escolhe view por claims/perms (`dre`|admin|gestor → overview atual; `pos` → Seller Home). Agregações do dia em helper puro testável + view Minimals Card/analytics. Nav ganha “Meu dia” para operador. Sem liberar `products`.

**Tech Stack:** React 18, MUI, Firestore client (`listSales`, `subscribeOnlineOrders` / `listOnlineOrders`, `getOpenCashSession`), `getEffectivePermissions`, Vitest, i18n pt/en/es.

**Spec:** `docs/superpowers/specs/2026-11-19-seller-home-pos-operator-design.md`

## Global Constraints

- Não inventar `role: 'admin'` no client; usar claims + `getEffectivePermissions`.
- Não adicionar `products` a `DEFAULT_OPERATOR_PERMISSIONS`.
- Vendas do dia = **todas da loja** (não filtrar por `sellerUid` no MVP).
- UI PT default; chaves em `pt`/`en`/`es` `common.json`.
- Skeleton wave (não spinner de página cheia).
- Antes de fechar qualquer task: `eslint --fix` + `eslint --max-warnings=0` nos `.ts`/`.tsx` alterados + `tsc --noEmit`.
- Commits só se o usuário pedir (neste repo); steps de commit do plano são opcionais.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/sections/overview/erp/seller-day-stats.ts` | Pure: bounds do dia local + agregação vendas/pedidos |
| `src/sections/overview/erp/__tests__/seller-day-stats.test.ts` | Vitest da agregação |
| `src/sections/overview/erp/view/overview-seller-view.tsx` | UI Seller Home |
| `src/sections/overview/erp/view/index.ts` | Export view (criar/atualizar) |
| `src/pages/dashboard/index.tsx` | Switch admin overview vs Seller Home vs fallback |
| `src/layouts/config-nav-dashboard.tsx` | Item “Meu dia” para operador com `pos` |
| `src/locales/langs/{pt,en,es}/common.json` | Strings `sellerHome.*` / `nav.sellerHome` |
| `src/api/firestore/sales.ts` | Reuso `listSales` (sem mudança obrigatória) |
| `src/api/firestore/cash-sessions.ts` | Reuso `getOpenCashSession` |
| `src/api/firestore/online-orders.ts` / `use-online-orders-monitor` | Contagens / lista aberta |

---

### Task 1: Helper de estatísticas do dia (TDD)

**Files:**
- Create: `src/sections/overview/erp/seller-day-stats.ts`
- Create: `src/sections/overview/erp/__tests__/seller-day-stats.test.ts`

**Interfaces:**
- Produces:
  - `getLocalDayBoundsIso(now?: Date): { startIso: string; endIso: string }`
  - `summarizeSellerDay(input: { sales: Array<{ createdAt: string; total?: number; grandTotal?: number; status?: string }>; onlineOrders: Array<{ status: string; createdAt?: string }>; dayStartIso: string; dayEndIso: string }): { salesCount: number; salesTotal: number; pendingOnlineCount: number; inProgressOnlineCount: number; todaySales: typeof sales; openOnlineOrders: typeof onlineOrders }`
- Consumes: nenhum módulo ERP além de tipos inline / imports type de Sale/OnlineOrder se preferir

- [x] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { getLocalDayBoundsIso, summarizeSellerDay } from '../seller-day-stats';

describe('seller-day-stats', () => {
  it('getLocalDayBoundsIso returns start before end covering now', () => {
    const now = new Date('2026-11-19T15:00:00');
    const { startIso, endIso } = getLocalDayBoundsIso(now);
    expect(startIso < endIso).toBe(true);
    expect(startIso <= now.toISOString()).toBe(true);
    expect(endIso >= now.toISOString()).toBe(true);
  });

  it('summarizeSellerDay counts all store sales in day and online statuses', () => {
    const { startIso, endIso } = getLocalDayBoundsIso(new Date('2026-11-19T12:00:00'));
    const result = summarizeSellerDay({
      dayStartIso: startIso,
      dayEndIso: endIso,
      sales: [
        { createdAt: '2026-11-19T10:00:00.000Z', grandTotal: 100 },
        { createdAt: '2026-11-18T10:00:00.000Z', grandTotal: 50 },
      ],
      onlineOrders: [
        { status: 'pending', createdAt: '2026-11-19T11:00:00.000Z' },
        { status: 'accepted', createdAt: '2026-11-19T11:30:00.000Z' },
        { status: 'delivered', createdAt: '2026-11-19T09:00:00.000Z' },
      ],
    });
    expect(result.salesCount).toBe(1);
    expect(result.salesTotal).toBe(100);
    expect(result.pendingOnlineCount).toBe(1);
    expect(result.inProgressOnlineCount).toBe(1);
    expect(result.openOnlineOrders).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/sections/overview/erp/__tests__/seller-day-stats.test.ts`  
Expected: FAIL (module/export missing)

- [ ] **Step 3: Implement `seller-day-stats.ts`**

- Day bounds: start/end of local calendar day as ISO.
- Sales in `[start, end)`; total = `grandTotal ?? total ?? 0`.
- `pendingOnlineCount` = status `pending`.
- `inProgressOnlineCount` = statuses in preparo atuais do domínio (`accepted`, e se existir `preparing` / `ready` no tipo, incluir; **não** `rejected`/`delivered`/`cancelled`).
- `openOnlineOrders` = pending + in-progress, sorted newest first.
- `todaySales` = filtered sales sorted newest first.

- [ ] **Step 4: Run test — expect PASS**

Run: `yarn test src/sections/overview/erp/__tests__/seller-day-stats.test.ts`  
Expected: PASS

- [ ] **Step 5: ESLint zero-warnings nos arquivos da task**

Run:
```bash
./node_modules/.bin/eslint --fix src/sections/overview/erp/seller-day-stats.ts src/sections/overview/erp/__tests__/seller-day-stats.test.ts
./node_modules/.bin/eslint --max-warnings=0 src/sections/overview/erp/seller-day-stats.ts src/sections/overview/erp/__tests__/seller-day-stats.test.ts
```

---

### Task 2: i18n + OverviewSellerView UI

**Files:**
- Create: `src/sections/overview/erp/view/overview-seller-view.tsx`
- Modify or create: `src/sections/overview/erp/view/index.ts`
- Modify: `src/locales/langs/pt/common.json`
- Modify: `src/locales/langs/en/common.json`
- Modify: `src/locales/langs/es/common.json`

**Interfaces:**
- Consumes: `summarizeSellerDay`, `getLocalDayBoundsIso`, `listSales`, `listOnlineOrders` ou `subscribeOnlineOrders`, `getOpenCashSession`, `useAuthContext`, `getEffectivePermissions`, `paths.dashboard.pos.*`, `ErpTableAnalytic` / `ErpKpiCard` / Skeleton
- Produces: `export function OverviewSellerView()`

- [ ] **Step 1: Add locale keys**

Under e.g. `sellerHome` and `nav.sellerHome`:

- pt: “Meu dia”, “Vendas hoje”, “Pedidos pendentes”, “Em andamento”, “Caixa”, “Abrir PDV”, “Pedidos online”, “Histórico”, empties.
- en/es: equivalents.

- [ ] **Step 2: Implement OverviewSellerView**

Structure:

1. `DashboardContent` + `CustomBreadcrumbs` (Meu dia).
2. Load `enterpriseId` from user; if missing → `EmptyContent`.
3. `useEffect`: `listSales` + `listOnlineOrders` (ou subscribe se já for o padrão da fila); `getOpenCashSession` se `cash_close`.
4. `summarizeSellerDay` with local day bounds.
5. Strip de **até 4** analytics (`ErpTableAnalytic` ou `ErpKpiCard` — seguir padrão visual de `sale-list-view` / ERP).
6. Stack de `Button`/`LoadingButton` RouterLink: checkout, onlineOrders, sales.
7. Duas listas curtas (Table ou Stack) + links “ver todos”.
8. Skeleton enquanto `loading`.

- [ ] **Step 3: Export from view/index.ts**

- [ ] **Step 4: ESLint + tsc**

```bash
./node_modules/.bin/eslint --fix <arquivos_alterados>
./node_modules/.bin/eslint --max-warnings=0 <arquivos_alterados>
./node_modules/.bin/tsc --noEmit
```

Smoke manual: render com user mock não obrigatório nesta task se Index ainda não switcha.

---

### Task 3: Dashboard index switch + nav

**Files:**
- Modify: `src/pages/dashboard/index.tsx`
- Modify: `src/layouts/config-nav-dashboard.tsx`
- Modify: `src/routes/sections/dashboard.tsx` only if `*` / PermissionGuard on index needs tweak (hoje IndexPage sem PermissionGuard `dre` — ok)

**Interfaces:**
- Consumes: `getEffectivePermissions`, `OverviewSellerView`, `OverviewAppView` (atual)
- Produces: index page routing logic

- [ ] **Step 1: Switch in `src/pages/dashboard/index.tsx`**

```tsx
// Pseudocódigo
const perms = getEffectivePermissions(user?.role, user?.permissions);
const isManager =
  Boolean(user?.platformAdmin) || user?.role === 'admin' || user?.role === 'gestor';

if (loading) return <SplashScreen /> or skeleton;
if (isManager || perms.has('dre')) return <OverviewAppView />; // comportamento atual
if (perms.has('pos')) return <OverviewSellerView />;
return <EmptyContent title=... />; // ou Navigate customers
```

Helmet title: Seller Home vs Dashboard conforme branch.

- [ ] **Step 2: Nav “Meu dia”**

In `config-nav-dashboard.tsx` `overviewItems`:

- Se **não** (`dre` || admin/gestor) **e** `perms.has('pos')`: push item `{ title: t('nav.sellerHome'), path: paths.dashboard.root, icon: ICONS.dashboard }`.
- Manter blocos DRE/produção só para quem já tem.

- [ ] **Step 3: Verify catch-all**

`{ path: '*', element: <Navigate to={paths.dashboard.root} replace /> }` already lands on index — index switch covers operador. No change unless something else hardcodes OverviewApp.

- [ ] **Step 4: ESLint + tsc nos arquivos tocados**

- [ ] **Step 5: Manual smoke checklist**

1. Conta operador `pos` → `/dashboard` = Seller Home com números da loja.  
2. Conta admin → overview atual.  
3. Menu sem Produtos; PDV checkout ainda lista produtos.  
4. Atalhos PDV / pedidos / histórico funcionam.

---

### Task 4: Verification gate

**Files:** none new

- [ ] **Step 1: Unit tests**

Run: `yarn test src/sections/overview/erp/__tests__/seller-day-stats.test.ts`  
Expected: PASS

- [ ] **Step 2: Full typecheck**

Run: `./node_modules/.bin/tsc --noEmit`  
Expected: exit 0

- [ ] **Step 3: ESLint all touched files `--max-warnings=0`**

- [ ] **Step 4: Update SDD ledger** (optional) `.superpowers/sdd/progress.md` note “Seller Home MVP done”

- [ ] **Step 5: Ask user before commit/push** (não commitar sem pedido explícito)

---

## Execution handoff

Após o plano aprovado / “seguir”:

1. Usar **subagent-driven-development** ou **executing-plans**.
2. Ordem: Task 1 → 2 → 3 → 4.
3. Não expandir para CRUD produtos ou ranking individual.

# Accrual DRE + Dashboard Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sangria-based DRE expenses with AP-by-competence accrual reporting and feed Overview KPIs/charts from the same pure engine.

**Architecture:** New pure module `buildAccrualDre` in `src/sections/cash/accrual-dre.ts` (TDD). Extend `Payable` with `competenceDate` + optional `dreClass`. Wire `dre-view.tsx` and `overview-app-view.tsx` to the engine. Keep `calculateDreReport` only for payment-method breakdown / cash helpers.

**Tech Stack:** Vitest, Dayjs + `PeriodBounds`, React Hook Form + Zod, MUI charts (`AppWidgetSummary`, `AppCurrentDownload` or Apex via existing overview components), i18n pt/en/es, Firestore payables.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-16-accrual-dre-dashboard-design.md`
- Revenue = PDV sales `completed` only; CMV = `sale.totalCost`
- AP `supplier` default `cogs_inventory` → **not** in OpEx
- Cancelled sales/payables always excluded; paid/open AP treated equally
- No Firestore rules change; no AR in DRE; no Cloud Function rollups
- i18n pt/en/es for new labels
- Do not commit unrelated dirty working-tree files

## File map

| File | Role |
|------|------|
| `src/sections/cash/accrual-dre.ts` | Engine + `DreClass` resolve helpers |
| `src/sections/cash/accrual-dre.test.ts` | Vitest coverage |
| `src/api/firestore/payables.ts` | Types, map, create payload |
| `src/sections/cash/payable-form.tsx` | competenceDate + dreClass fields |
| `src/sections/cash/view/dre-view.tsx` | Accrual DRE UI |
| `src/sections/overview/app/view/overview-app-view.tsx` | KPIs + charts |
| `src/locales/langs/{pt,en,es}/common.json` | Strings |
| `docs/agents/antigravity-erp-handoff.md` | Status note |

---

### Task 1: `buildAccrualDre` engine (TDD)

**Files:**
- Create: `src/sections/cash/accrual-dre.ts`
- Create: `src/sections/cash/accrual-dre.test.ts`

**Interfaces:**
- Consumes: `Sale` from `src/api/firestore/sales`; `Payable`, `FinancialCategory` from payables (define `DreClass` in accrual-dre and re-export or mirror on Payable in Task 2); `PeriodBounds` from `src/components/period-filter`
- Produces:
  - `export type DreClass = 'operating' | 'cogs_inventory' | 'other_income' | 'ignore'`
  - `export type AccrualDreExpenseLine = { category: FinancialCategory; dreClass: DreClass; amount: number; pctOfRevenue: number }`
  - `export type AccrualDreDailyPoint = { date: string; revenue: number; cogs: number; operatingExpenses: number; netProfit: number }`
  - `export type AccrualDreReport = { salesCount; grossRevenue; discounts; netRevenue; cogs; grossProfit; grossMarginPercent; operatingExpenses; expenseLines; netProfit; netMarginPercent; dailySeries }`
  - `export function defaultDreClassForCategory(category: FinancialCategory): DreClass`
  - `export function resolvePayableDreClass(p: { category: FinancialCategory; dreClass?: DreClass }): DreClass`
  - `export function isDateOnlyInPeriodBounds(dateOnly: string, bounds: PeriodBounds): boolean`
  - `export function buildAccrualDre(params: { sales: Sale[]; payables: PayableLike[]; bounds: PeriodBounds }): AccrualDreReport`

For Task 1, use a minimal `PayableLike` type inside the engine file (or import Payable if already extended). Prefer defining `DreClass` + helpers in `accrual-dre.ts` first; Task 2 imports `DreClass` into payables.

- [ ] **Step 1: Write failing tests** in `accrual-dre.test.ts`

```ts
import type { Sale } from 'src/api/firestore/sales';
import type { Payable } from 'src/api/firestore/payables';

import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import { buildAccrualDre, resolvePayableDreClass } from './accrual-dre';

const bounds = {
  start: dayjs('2026-11-01').startOf('day'),
  end: dayjs('2026-11-30').endOf('day'),
};

const makeSale = (o: Partial<Sale> = {}): Sale =>
  ({
    id: 's1',
    code: 'VD-01',
    items: [],
    subtotal: 100,
    discountAmount: 5,
    discountPercent: 5,
    total: 95,
    totalCost: 45,
    grossProfit: 50,
    payments: [],
    paidAmount: 95,
    changeAmount: 0,
    status: 'completed',
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...o,
  }) as Sale;

const makePayable = (o: Partial<Payable> = {}): Payable =>
  ({
    id: 'p1',
    description: 'Rent',
    category: 'rent',
    amount: 20,
    startDate: '2026-11-05',
    dueDate: '2026-11-10',
    competenceDate: '2026-11-05',
    recurrence: 'none',
    status: 'open',
    installmentIndex: 1,
    installmentCount: 1,
    active: true,
    createdAt: '',
    updatedAt: '',
    ...o,
  }) as Payable;

describe('resolvePayableDreClass', () => {
  it('maps supplier → cogs_inventory by default', () => {
    expect(resolvePayableDreClass({ category: 'supplier' })).toBe('cogs_inventory');
  });
  it('honors explicit dreClass override', () => {
    expect(resolvePayableDreClass({ category: 'supplier', dreClass: 'operating' })).toBe(
      'operating'
    );
  });
});

describe('buildAccrualDre', () => {
  it('excludes cancelled sales and uses completed revenue/cogs', () => {
    const report = buildAccrualDre({
      sales: [makeSale({}), makeSale({ id: 's2', status: 'cancelled', total: 50, totalCost: 10 })],
      payables: [],
      bounds,
    });
    expect(report.salesCount).toBe(1);
    expect(report.netRevenue).toBe(95);
    expect(report.cogs).toBe(45);
    expect(report.grossProfit).toBe(50);
    expect(report.operatingExpenses).toBe(0);
    expect(report.netProfit).toBe(50);
  });

  it('includes open and paid AP equally; excludes cancelled', () => {
    const report = buildAccrualDre({
      sales: [makeSale({})],
      payables: [
        makePayable({ id: 'a', status: 'open', amount: 10 }),
        makePayable({ id: 'b', status: 'paid', amount: 5 }),
        makePayable({ id: 'c', status: 'cancelled', amount: 99 }),
      ],
      bounds,
    });
    expect(report.operatingExpenses).toBe(15);
    expect(report.netProfit).toBe(35);
  });

  it('falls back competenceDate → startDate', () => {
    const report = buildAccrualDre({
      sales: [],
      payables: [
        makePayable({
          competenceDate: undefined as unknown as string,
          startDate: '2026-11-08',
          amount: 7,
        }),
      ],
      bounds,
    });
    expect(report.operatingExpenses).toBe(7);
  });

  it('excludes supplier (cogs_inventory) from OpEx; includes rent', () => {
    const report = buildAccrualDre({
      sales: [makeSale({})],
      payables: [
        makePayable({ id: 'sup', category: 'supplier', amount: 100 }),
        makePayable({ id: 'rent', category: 'rent', amount: 20 }),
      ],
      bounds,
    });
    expect(report.operatingExpenses).toBe(20);
    expect(report.expenseLines).toEqual([
      expect.objectContaining({ category: 'rent', amount: 20 }),
    ]);
  });

  it('builds dailySeries with revenue/cogs/opex/netProfit', () => {
    const report = buildAccrualDre({
      sales: [makeSale({ createdAt: '2026-11-10T15:00:00.000Z' })],
      payables: [makePayable({ competenceDate: '2026-11-10', amount: 10 })],
      bounds,
    });
    const day = report.dailySeries.find((d) => d.date === '2026-11-10');
    expect(day).toEqual({
      date: '2026-11-10',
      revenue: 95,
      cogs: 45,
      operatingExpenses: 10,
      netProfit: 40,
    });
  });
});
```

Note: if `Payable` lacks `competenceDate` until Task 2, temporarily use `as Payable` / local type in tests — or add optional fields on Payable in the same commit as the engine (allowed if needed for compile). Prefer adding optional `competenceDate?: string; dreClass?: DreClass` stubs on Payable type at start of Task 1 so tests typecheck, then Task 2 fills map/create.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
yarn vitest run src/sections/cash/accrual-dre.test.ts
```

Expected: fail (module/export missing).

- [ ] **Step 3: Implement `accrual-dre.ts`**

Core logic (implement fully; round money to 2 decimals like `cash-calculator`):

```ts
import type { Sale } from 'src/api/firestore/sales';
import type { FinancialCategory } from 'src/api/firestore/payables';

import dayjs from 'dayjs';

import type { PeriodBounds } from 'src/components/period-filter';
import { isIsoInPeriodBounds } from 'src/components/period-filter';

export type DreClass = 'operating' | 'cogs_inventory' | 'other_income' | 'ignore';

export type AccrualPayableInput = {
  category: FinancialCategory;
  amount: number;
  startDate: string;
  competenceDate?: string;
  dreClass?: DreClass;
  status: string;
  active?: boolean;
};

export function defaultDreClassForCategory(category: FinancialCategory): DreClass {
  if (category === 'supplier') return 'cogs_inventory';
  return 'operating';
}

export function resolvePayableDreClass(p: {
  category: FinancialCategory;
  dreClass?: DreClass;
}): DreClass {
  return p.dreClass ?? defaultDreClassForCategory(p.category);
}

export function isDateOnlyInPeriodBounds(dateOnly: string, bounds: PeriodBounds): boolean {
  if (!dateOnly) return false;
  if (!bounds.start && !bounds.end) return true;
  const t = dayjs(dateOnly).startOf('day');
  if (!t.isValid()) return false;
  if (bounds.start && t.isBefore(bounds.start.startOf('day'))) return false;
  if (bounds.end && t.isAfter(bounds.end.endOf('day'))) return false;
  return true;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ... AccrualDreReport types ...

export function buildAccrualDre(params: {
  sales: Sale[];
  payables: AccrualPayableInput[];
  bounds: PeriodBounds;
}): AccrualDreReport {
  // 1) filter completed sales in bounds via isIsoInPeriodBounds(createdAt)
  // 2) sum gross/discount/net/cogs
  // 3) filter payables: active !== false, status !== cancelled, competence in bounds
  // 4) OpEx only if resolvePayableDreClass === 'operating'
  // 5) group expenseLines by category; pctOfRevenue vs netRevenue
  // 6) dailySeries: union of sale days + opex days; sort by date asc
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
yarn vitest run src/sections/cash/accrual-dre.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/sections/cash/accrual-dre.ts src/sections/cash/accrual-dre.test.ts src/api/firestore/payables.ts
git commit -m "$(cat <<'EOF'
feat(cash): buildAccrualDre competence engine

EOF
)"
```

(Only include `payables.ts` in this commit if type stubs were required for compile.)

---

### Task 2: Payable fields + form + i18n

**Files:**
- Modify: `src/api/firestore/payables.ts`
- Modify: `src/sections/cash/payable-form.tsx`
- Modify: `src/locales/langs/pt/common.json`
- Modify: `src/locales/langs/en/common.json`
- Modify: `src/locales/langs/es/common.json`

**Interfaces:**
- Consumes: `DreClass` from `src/sections/cash/accrual-dre` (or define `DreClass` in payables and import in accrual-dre — pick **one** home: prefer `accrual-dre.ts` export, payables imports type)
- Produces: `Payable.competenceDate: string`; `Payable.dreClass?: DreClass`; create/update persist both

- [ ] **Step 1: Extend payables types + map + create**

In `Payable` / `CreatePayableInput`:

```ts
import type { DreClass } from 'src/sections/cash/accrual-dre';

competenceDate: string;
dreClass?: DreClass;
```

In `mapPayable`:

```ts
competenceDate: String(data.competenceDate ?? data.startDate ?? ''),
dreClass: data.dreClass as DreClass | undefined, // only if valid enum
```

In `createPayableWithInstallments` payload (each installment):

```ts
competenceDate: input.competenceDate || input.startDate,
dreClass: input.dreClass,
```

Use `omitUndefined` so missing `dreClass` is not written.

- [ ] **Step 2: Update `payable-form.tsx`**

- Add Zod: `competenceDate: zod.string().min(1)`, `dreClass: zod.enum(['operating','cogs_inventory','other_income','ignore']).optional().or(zod.literal(''))`
- Defaults: `competenceDate: current?.competenceDate || current?.startDate || ''`, `dreClass: current?.dreClass || ''`
- UI: `Field.DatePicker` or existing date string field pattern used for `startDate`/`dueDate`; `Field.Select` for dreClass with MenuItem value `''` = automático
- On create/update pass `competenceDate` and `dreClass: data.dreClass || undefined`

- [ ] **Step 3: i18n keys** (pt/en/es under `dre.*` / `finance.*` / `overview.*` as in spec §9)

Examples PT:

```json
"dre": {
  "competenceDate": "Data de competência",
  "dreClass": "Classificação DRE",
  "dreClassAuto": "Automático (categoria)",
  "operatingExpenses": "Despesas operacionais",
  "netProfit": "Lucro líquido",
  "expenseByCategory": "Despesas por categoria",
  "accrualSubtitle": "Regime de competência (vendas PDV + contas a pagar)"
},
"overview": {
  "kpiNetRevenue": "Receita líquida no período",
  "kpiExpenses": "Despesas operacionais",
  "kpiNetProfit": "Lucro líquido",
  "chartRevenueProfit": "Receita × Lucro líquido",
  "chartExpensesByCategory": "Despesas por categoria"
}
```

(Merge into existing JSON structure without breaking keys.)

- [ ] **Step 4: Commit**

```bash
git add src/api/firestore/payables.ts src/sections/cash/payable-form.tsx src/locales/langs/pt/common.json src/locales/langs/en/common.json src/locales/langs/es/common.json
git commit -m "$(cat <<'EOF'
feat(finance): payable competenceDate and dreClass

EOF
)"
```

---

### Task 3: Wire DRE view to accrual engine

**Files:**
- Modify: `src/sections/cash/view/dre-view.tsx`

**Interfaces:**
- Consumes: `buildAccrualDre`, `listSales`, `listPayables`, `PeriodFilterBar` bounds
- Produces: DRE table + summary cards without sangria

- [ ] **Step 1: Replace data load**

```ts
import { listPayables } from 'src/api/firestore/payables';
import { buildAccrualDre } from '../accrual-dre';

// remove listCashSessions / totalWithdrawals for OpEx
const [payables, setPayables] = useState<Payable[]>([]);
// Promise.all([listSales, listPayables])
```

- [ ] **Step 2: Compute report**

```ts
const dre = useMemo(
  () => buildAccrualDre({ sales, payables, bounds }),
  [sales, payables, bounds]
);
```

(Engine already filters by bounds — do **not** double-filter sales before calling, or pass full lists + bounds only.)

- [ ] **Step 3: Update table/cards**

- Cards: `dre.netRevenue`, `dre.operatingExpenses`, `dre.netProfit`
- Table rows: keep revenue/discount/net/CMV/grossProfit; replace single “sangria” expense row with `dre.expenseLines.map(...)` then total OpEx then netProfit
- Subheader: use `t('dre.accrualSubtitle')` + `dre.salesCount`
- Remove cash session withdrawal UI copy

- [ ] **Step 4: Smoke mentally / run vitest engine still green**

```bash
yarn vitest run src/sections/cash/accrual-dre.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/sections/cash/view/dre-view.tsx
git commit -m "$(cat <<'EOF'
feat(cash): DRE view uses accrual competence engine

EOF
)"
```

---

### Task 4: Overview KPIs + charts

**Files:**
- Modify: `src/sections/overview/app/view/overview-app-view.tsx`

**Interfaces:**
- Consumes: `buildAccrualDre`, `listPayables`, existing `AppWidgetSummary` / `AppCurrentDownload`
- Produces: KPIs Receita / Despesas / Lucro; daily series chart; expenses-by-category chart; keep payment-method donut via `calculateDreReport`

- [ ] **Step 1: Load payables** in `loadDashboardData` (`listPayables` in Promise.all)

- [ ] **Step 2: Compute accrual + keep payment dre**

```ts
const accrual = useMemo(
  () => buildAccrualDre({ sales, payables, bounds }),
  [sales, payables, bounds]
);

const paymentDre = useMemo(
  () => calculateDreReport({ sales: filteredSales }),
  [filteredSales]
);
```

Use `accrual` for KPI totals; `paymentDre.byMethod` for donut (or filter sales the same way engine does — prefer `accrual` period consistency: build `filteredSales` only for payment chart from completed sales in bounds).

- [ ] **Step 3: Replace KPI trio**

1. Receita líquida → `accrual.netRevenue` (sparkline from `accrual.dailySeries.map(d => d.revenue)`)
2. Despesas → `accrual.operatingExpenses` (sparkline from daily opex)
3. Lucro líquido → `accrual.netProfit` (sparkline from daily netProfit)  
   Remove “Produtos cadastrados” from this top trio (products can remain elsewhere if already shown; do not add new product KPI here).

Percent props: use `accrual.grossMarginPercent` / `accrual.netMarginPercent` / expenses as `% of netRevenue` (`operatingExpenses/netRevenue*100` or 0).

- [ ] **Step 4: Charts**

- Reuse `AppCurrentDownload` (or similar) for **despesas por categoria**:  
  `accrual.expenseLines.map(l => ({ label: t(`finance.category.${l.category}`), value: l.amount }))` with fallback if empty.
- Add a second chart card for **Receita × Lucro** using an existing overview chart that accepts categories + dual series (e.g. pattern from `ecommerce-yearly-sales` **or** two `AppWidgetSummary` sparklines already cover trend — if adding a full card, prefer minimal Apex `Chart` with categories = `dailySeries.date`, series = revenue + netProfit). Keep change small: if dual-line card is heavy, ship sparklines on KPIs + category donut + payment donut (3 charts) which satisfies spec “2–3 charts”.

Minimum acceptable chart set for this task:

1. KPI sparklines (revenue / profit from `dailySeries`)
2. Donut despesas por categoria
3. Existing donut métodos de pagamento

- [ ] **Step 5: Commit**

```bash
git add src/sections/overview/app/view/overview-app-view.tsx
git commit -m "$(cat <<'EOF'
feat(overview): accrual KPIs and expense charts

EOF
)"
```

---

### Task 5: Verify + handoff

**Files:**
- Modify: `docs/agents/antigravity-erp-handoff.md`

- [ ] **Step 1: Tests**

```bash
yarn vitest run src/sections/cash/accrual-dre.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Typecheck touched surface**

```bash
yarn tsc --noEmit 2>&1 | head -n 80
```

Do not expand scope to fix unrelated pre-existing errors; ensure no new errors in accrual-dre / payables / dre-view / overview / payable-form.

- [ ] **Step 3: Update handoff**

Add short note: Accrual DRE + Overview analytics done; engine `buildAccrualDre`; AP `competenceDate`/`dreClass`; sangria no longer feeds DRE expenses.

- [ ] **Step 4: Commit**

```bash
git add docs/agents/antigravity-erp-handoff.md
git commit -m "$(cat <<'EOF'
docs: handoff accrual DRE dashboard slice

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| `buildAccrualDre` + tests §7/§11 | T1 |
| Payable `competenceDate` / `dreClass` + form §6/§8.3 | T2 |
| DRE UI without sangria §8.1 | T3 |
| Overview KPIs + charts §8.2 | T4 |
| i18n §9 | T2 (+ T3/T4 consume) |
| Acceptance checklist §12 | T5 |
| Non-goals (AR, rules, CF) | Not scheduled |

Type names consistent: `DreClass`, `AccrualDreReport`, `buildAccrualDre`, `PeriodBounds`. No TBD placeholders.

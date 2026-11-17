# Design: DRE por competência + Dashboard analytics

**Date:** 2026-11-16  
**Status:** Draft for user review  
**Stack:** Firebase Auth + Firestore (offline-first) + Minimals Vite React  
**Approach:** Engine puro `buildAccrualDre` compartilhado por DRE e Overview  

## 1. Context and problem

Hoje `calculateDreReport` (`src/sections/cash/cash-calculator.ts`) calcula receita/CMV a partir de vendas PDV, mas:

- Despesas operacionais na tela DRE vêm de **sangrias** (`cashSessions` WITHDRAWAL), não de contas a pagar.
- Status de pagamento AP/AR e datas de competência não entram no resultado.
- Overview (`overview-app-view.tsx`) mostra Receita e Lucro bruto sem bloco de despesas por competência, e o 3º KPI é “produtos cadastrados”.
- Incluir compras de estoque (AP `supplier`) junto com CMV das vendas geraria **double-count**.

Esta fatia corrige o DRE para **regime de competência** e alimenta o dashboard com o mesmo engine.

Relacionada (não substitui): `2026-11-16-finance-dre-ranking-ap-ar-design.md` (AP/AR CRUD + DRE inicial por caixa). Esta spec **substitui a regra de despesa do DRE** (sangria → AP competência) e adiciona analytics no Overview.

## 2. Goals

1. Engine puro de DRE competência: receita PDV + CMV de vendas + despesas AP por competência.
2. Tela `/dashboard/cash/dre` usa o engine (sem sangria como despesa).
3. Overview: cards Receita / Despesas / Lucro líquido + 2–3 gráficos a partir do mesmo report.
4. AP: campos `competenceDate` e `dreClass` opcional (defaults por `category`).
5. Testes Vitest do engine; i18n pt/en/es.

## 3. Non-goals (deferred)

- Contas a receber no DRE (receita = só PDV).
- Rollups em Cloud Functions.
- Backfill batch de documentos legados (só fallback no map/read).
- Coluna competência na listagem AP (form basta nesta fatia).
- Alterar `firestore.rules` (campos novos opcionais sob as mesmas rules `payables`).
- Ranking de vendedores, NFC-e, Nest/Postgres.

## 4. Locked decisions

| # | Tema | Decisão |
|---|------|---------|
| 1 | Receita | Só vendas PDV (`Sale`, status `completed`) |
| 2 | Data competência AP | Campo novo `competenceDate` (default `startDate`) |
| 3 | Classificação | Defaults por `category` + override opcional `dreClass` |
| 4 | Escopo UI | DRE + Dashboard (cards + 2–3 gráficos) |
| 5 | AP estoque / fornecedor | Fora das despesas (`cogs_inventory`); CMV só via `sale.totalCost` |
| 6 | Cancelados | Sempre excluídos (`Sale.status === 'cancelled'`, `Payable.status === 'cancelled'`) |
| 7 | Status pago/aberto | Ignorado no DRE (competência manda) |
| 8 | Engine | Módulo novo `buildAccrualDre` (não inchando só `calculateDreReport`) |

## 5. Architecture

```
listSales + listPayables
        │
        ▼
 PeriodFilterBar bounds (resolvePeriodBounds / isIsoInPeriodBounds)
        │
        ▼
 buildAccrualDre({ sales, payables, bounds })
        │
        ├── AccrualDreReport → DreView (tabela + cards)
        └── AccrualDreReport → OverviewAppView (KPIs + charts)
```

- `calculateDreReport` permanece para breakdown por método de pagamento / lógica de caixa; **não** é a fonte de despesas do DRE competência.
- Sangrias continuam no extrato de caixa (`cash-ledger`); não no DRE.

### 5.1 Module layout

| Artifact | Path |
|----------|------|
| Engine + types | `src/sections/cash/accrual-dre.ts` |
| Tests | `src/sections/cash/accrual-dre.test.ts` |
| DRE view | `src/sections/cash/view/dre-view.tsx` |
| Overview | `src/sections/overview/app/view/overview-app-view.tsx` |
| Payable API | `src/api/firestore/payables.ts` |
| Payable form | `src/sections/cash/payable-form.tsx` |
| i18n | `src/locales/langs/{pt,en,es}/common.json` |

## 6. Data model

### 6.1 Payable extensions

```ts
export type DreClass =
  | 'operating'
  | 'cogs_inventory'
  | 'other_income'
  | 'ignore';

// on Payable + CreatePayableInput:
competenceDate: string; // YYYY-MM-DD
dreClass?: DreClass;    // omit = derive from category
```

**Map / create / update:**

- Se `competenceDate` ausente no doc → `startDate`.
- Persist `competenceDate` sempre no create/update (form default = `startDate` se usuário não alterar).
- `dreClass` só grava se usuário escolheu override; senão omit/undefined e o engine deriva.

### 6.2 Category → default `dreClass`

| `FinancialCategory` | Default `dreClass` |
|---------------------|--------------------|
| `supplier` | `cogs_inventory` |
| `utilities_power` | `operating` |
| `utilities_internet` | `operating` |
| `rent` | `operating` |
| `other` | `operating` |

Helper: `resolvePayableDreClass(payable): DreClass`.

### 6.3 Sale period key

- Filtrar por `sale.createdAt` (ISO) com `isIsoInPeriodBounds`.
- Incluir só `status === 'completed'`.
- CMV = soma de `sale.totalCost`.
- Receita bruta / descontos / líquida = `subtotal` / `discountAmount` / `total` (mesmo critério de `calculateDreReport`).

### 6.4 Payable period key

- Usar `competenceDate` (ou fallback `startDate`) como `YYYY-MM-DD`.
- Inclusão: dia de competência dentro de `bounds` (mesma semântica de período que o PeriodFilter; tratar date-only de forma consistente — comparar via dayjs startOf('day') / helpers existentes ou wrapper `isDateOnlyInPeriodBounds`).
- Excluir: `status === 'cancelled'` ou `active === false`.
- Incluir em despesas só se `resolvePayableDreClass(p)` ∈ `{ operating }` nesta fatia.  
  - `cogs_inventory` / `ignore` → fora das despesas.  
  - `other_income` → fora do bloco de despesas nesta fatia (não soma em receita PDV; reservado para fatia futura).

## 7. Engine contract

```ts
export type AccrualDreExpenseLine = {
  category: FinancialCategory;
  dreClass: DreClass;
  amount: number;
  pctOfRevenue: number; // vs netRevenue; 0 if netRevenue === 0
};

export type AccrualDreDailyPoint = {
  date: string; // YYYY-MM-DD
  revenue: number;
  cogs: number;
  operatingExpenses: number;
  netProfit: number;
};

export type AccrualDreReport = {
  salesCount: number;
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  expenseLines: AccrualDreExpenseLine[];
  netProfit: number;
  netMarginPercent: number;
  dailySeries: AccrualDreDailyPoint[];
};

export function buildAccrualDre(params: {
  sales: Sale[];
  payables: Payable[];
  bounds: PeriodBounds; // same type as PeriodFilter
}): AccrualDreReport;
```

**Fórmulas:**

- `grossProfit = netRevenue - cogs`
- `netProfit = grossProfit - operatingExpenses`
- Margens % sobre `netRevenue` (0 se receita 0).
- `expenseLines`: agrupar por `category` (só linhas operating), ordenar por `amount` desc.
- `dailySeries`:
  - receita/CMV por dia de `createdAt` da venda;
  - despesas por dia de `competenceDate`;
  - `netProfit` do dia = revenue − cogs − operatingExpenses daquele dia;
  - dias sem movimento podem ser omitidos (charts usam os pontos retornados).

## 8. UI

### 8.1 DRE (`dre-view.tsx`)

- `PeriodFilterBar` inalterado.
- Load: `listSales` + `listPayables` (remover dependência de sangria/`listCashSessions` para despesas).
- Tabela: receita bruta → descontos → líquida → CMV → lucro bruto → linhas despesa por categoria → total despesas → lucro líquido (AV %).
- Cards resumo: Receita líquida / Despesas / Lucro líquido.
- Copy: deixar claro “competência / contas a pagar”; remover menção a sangria = despesa.

### 8.2 Overview (`overview-app-view.tsx`)

- Load payables além das fontes atuais (ou reutilizar se já carregar).
- KPIs principais do período: **Receita líquida | Despesas operacionais | Lucro líquido** (substituir o card “Produtos cadastrados” no trio principal).
- Gráficos:
  1. Área/linha: Receita vs Lucro líquido (`dailySeries`).
  2. Pizza ou barra: despesas por categoria (`expenseLines`).
  3. Manter chart de métodos de pagamento via `calculateDreReport({ sales: filteredSales })` (só vendas).
- Welcome / fiado / lotes: permanecem.

### 8.3 Payable form

- Date field **Data de competência** → `competenceDate` (default `startDate`).
- Select opcional **Classificação DRE** (`dreClass`); opção “Automático (categoria)” = undefined.
- Validação Zod: `competenceDate` string date required on submit (preenchida).

## 9. i18n

Chaves em `common.json` (pt/en/es), exemplos:

- `dre.accrualTitle`, `dre.operatingExpenses`, `dre.netProfit`, `dre.expenseByCategory`
- `dre.competenceDate`, `dre.dreClass`, `dre.dreClassAuto`
- `overview.kpiNetRevenue`, `overview.kpiExpenses`, `overview.kpiNetProfit`
- `overview.chartRevenueProfit`, `overview.chartExpensesByCategory`

DefaultValue PT nos `t()` onde já for padrão do projeto.

## 10. RBAC / security

- Rotas DRE/AP: já `PermissionGuard permission="dre"` — sem mudança.
- Overview: acesso dashboard existente.
- `firestore.rules`: sem alteração nesta fatia (payables já gated por `hasPerm`).

## 11. Testing and verification

**Vitest (`accrual-dre.test.ts`):**

1. Cancelled sales excluded; completed included.
2. Cancelled payables excluded; open/paid included equally.
3. Missing `competenceDate` falls back to `startDate`.
4. `supplier` default excluded from OpEx; `rent` included.
5. Explicit `dreClass: 'operating'` on supplier includes; `ignore` excludes.
6. `pctOfRevenue` correct; zero revenue → 0%.
7. `dailySeries` buckets by day; netProfit = revenue − cogs − opex that day.

**Manual smoke:**

- Criar AP aluguel com competência no período → aparece em Despesas.
- Criar AP supplier → não aparece em Despesas; CMV sobe só com venda.
- Cancelar venda → some da receita.
- Overview e DRE batem nos mesmos totais para o mesmo período.

**Commands:** `npx vitest run src/sections/cash/accrual-dre.test.ts`; `npx tsc --noEmit` (não introduzir erros novos nos arquivos tocados).

## 12. Acceptance criteria

- [ ] `buildAccrualDre` implementado e testado.
- [ ] DRE sem sangria; despesas = AP por competência filtrada.
- [ ] Overview: 3 KPIs Receita/Despesas/Lucro + série diária + despesas por categoria (+ métodos PDV).
- [ ] Form AP persiste `competenceDate` e `dreClass` opcional.
- [ ] Docs legados sem `competenceDate` funcionam via fallback `startDate`.
- [ ] i18n pt/en/es para labels novas.
- [ ] Nenhum double-count CMV (compras `cogs_inventory` fora de OpEx).

## 13. Implementation sketch (for plan)

1. T1 — `accrual-dre.ts` + testes (TDD).
2. T2 — `payables.ts` types/map/create/update + form fields + i18n.
3. T3 — `dre-view.tsx` wired to engine.
4. T4 — `overview-app-view.tsx` KPIs + charts.
5. T5 — verify (vitest + smoke checklist).

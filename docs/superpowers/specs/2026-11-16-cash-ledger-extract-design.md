# Design: Extrato de Caixa / Cash Ledger (Slice G)

**Date:** 2026-11-16  
**Status:** Draft (awaiting user review of this file)  
**Stack:** React + MUI DataGrid + existing `cashSessions` (no new Firestore collection)

## 1. Context

Cash sessions already store `openingBalance` and `movements[]` (`SUPPLY` | `WITHDRAWAL` | `RECEIPT` | `PAYMENT`). There is no cross-session extract UI. DRE covers P&L; operators with `dre` need a cash-flow style ledger.

User choices:

| Topic | Choice |
|-------|--------|
| Scope | **A** — read-only flatten of existing session data |
| Access | **A** — `PermissionGuard` / nav key `dre` |
| UI | **C** — DataGrid + summary cards + running balance |
| Opening | **B** — synthetic `OPENING` row per session |
| Approach | **1** — pure client `buildCashLedger` |

## 2. Goals

1. Route `/dashboard/cash/ledger` under Financeiro, guarded by `dre`.
2. Pure builder flattens sessions → ledger lines with signed amounts and running balance.
3. Period filter (`PeriodFilterBar`), type filter, export via DataGrid toolbar.
4. Summary cards: inflow / outflow / net for the filtered period.
5. Unit tests for the builder; i18n pt/en/es.

## 3. Non-goals

- Bank accounts, manual journal entries, new Firestore collection
- PDV sale lines in the extract (sales stay on DRE)
- Blind-close difference (sobra/quebra) as ledger rows
- Changes to `firestore.rules`
- Smoke E/F, Artifact Registry setpolicy, package-lock

## 4. Domain model

```ts
type CashLedgerLineType =
  | 'OPENING' | 'SUPPLY' | 'WITHDRAWAL' | 'RECEIPT' | 'PAYMENT';

type CashLedgerLine = {
  id: string;                 // `${sessionId}:opening` | `${sessionId}:${movementId}`
  sessionId: string;
  sessionCode: string;
  type: CashLedgerLineType;
  amount: number;             // absolute >= 0
  signedAmount: number;       // + OPENING|SUPPLY|RECEIPT; − WITHDRAWAL|PAYMENT
  reason: string;
  createdAt: string;          // ISO; OPENING uses session.openedAt
  refType?: 'receivable' | 'payable';
  refId?: string;
  balanceAfter: number;
};

type CashLedgerSummary = {
  inflow: number;
  outflow: number;
  net: number;
  lineCount: number;
};

buildCashLedger(
  sessions: CashSession[],
  bounds?: { start?: Dayjs | null; end?: Dayjs | null }
): { lines: CashLedgerLine[]; summary: CashLedgerSummary }
```

### Builder rules

1. Emit one `OPENING` per session (`amount = openingBalance`, `createdAt = openedAt`, reason fixed key/text for “Abertura de caixa”).
2. Emit one line per `session.movements` entry (preserve type/amount/reason/refs/`createdAt`).
3. Filter lines by `createdAt` against period bounds (`isIsoInPeriodBounds`).
4. Sort ascending by `createdAt` (stable tie-break: OPENING before same-timestamp movements of that session if needed).
5. Running `balanceAfter` starts at 0 for the filtered set; cumulative `signedAmount`.
6. Summary: `inflow = sum(signed > 0)`, `outflow = sum(abs(signed < 0))`, `net = inflow - outflow`, `lineCount = lines.length`.

Files: `src/sections/cash/cash-ledger.ts` + `cash-ledger.test.ts`.

## 5. UI / routes / nav

| Piece | Path |
|-------|------|
| Path | `paths.dashboard.cash.ledger` = `/dashboard/cash/ledger` |
| Page | `src/pages/cash/ledger.tsx` |
| View | `src/sections/cash/view/cash-ledger-view.tsx` |
| Guard | `PermissionGuard permission="dre"` in `dashboard.tsx` |
| Nav | Under `perms.has('dre')` block: “Extrato de caixa” |

View layout:

1. `DashboardContent` + breadcrumbs (Financeiro → Extrato)
2. `PeriodFilterBar` (default preset `30d`, same pattern as `dre-view.tsx`)
3. Three summary cards: Entradas / Saídas / Saldo
4. `Card` + `DataGrid` (~720px): date, type (`Label`), signed amount (color), balance, reason, session code, ref; toolbar quick/columns/filter/export; client type filter (All + each `CashLedgerLineType`)
5. Data: `listCashSessions(enterpriseId)` → `buildCashLedger(sessions, bounds)`

i18n keys: `nav.cashLedger`, `cashLedger.title`, `cashLedger.inflow|outflow|net`, `cashLedger.type.*`, empty/error strings — pt / en / es.

## 6. Delivery

1. TDD builder + tests
2. View + page + paths + route + nav + i18n
3. Handoff update (Slice G done; smoke E/F + ops still pending)
4. No rules deploy

## 7. Acceptance

1. Session with opening 100 + SUPPLY 50 + WITHDRAWAL 30 → lines show balances 100 → 150 → 120; summary inflow 150, outflow 30, net 120
2. Period filter excludes lines outside bounds
3. Operador without `dre` → route blocked / nav hidden
4. Admin/gestor or operador with `dre` → page loads
5. `yarn vitest` (cash-ledger) + `yarn tsc --noEmit` green

## 8. Risks

- Large number of sessions loaded client-side — acceptable for MVP; materialize later if needed
- OPENING with `openingBalance === 0` still appears (intentional for audit trail)
- Running balance is period-relative (starts at 0 for filtered window), not “true wallet since forever” — document in UI subtitle if helpful

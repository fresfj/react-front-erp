# Cash Ledger Extract (Slice G) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only cash extract UI that flattens `cashSessions` into ledger lines with running balance, period filter, and `dre` access.

**Architecture:** Pure `buildCashLedger` in `src/sections/cash/cash-ledger.ts` (TDD). View loads sessions via `listCashSessions`, filters with `PeriodFilterBar` bounds, renders summary cards + `ErpDataGrid`. No new Firestore collection or rules.

**Tech Stack:** Vitest, Dayjs/period-filter, MUI DataGrid via ErpDataGrid, React Router, i18n.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-16-cash-ledger-extract-design.md`
- Permission: `dre` only
- OPENING synthetic rows; no PDV sales; no blind-close rows
- Period-relative running balance (starts at 0)
- i18n pt/en/es

---

### Task 1: buildCashLedger (TDD)

**Files:**
- Create: `src/sections/cash/cash-ledger.ts`
- Create: `src/sections/cash/cash-ledger.test.ts`

**Interfaces:**
- Produces: `CashLedgerLineType`, `CashLedgerLine`, `CashLedgerSummary`, `buildCashLedger(sessions, bounds?)`

- [ ] **Step 1: Write failing tests** covering acceptance §7.1–§7.2 (opening+supply+withdrawal balances; period filter)
- [ ] **Step 2: Implement builder** per spec §4
- [ ] **Step 3: `yarn vitest run src/sections/cash/cash-ledger.test.ts`** → PASS
- [ ] **Step 4: Commit** `feat(cash): buildCashLedger pure extract`

---

### Task 2: UI + routes + nav + i18n

**Files:**
- Create: `src/sections/cash/view/cash-ledger-view.tsx`
- Create: `src/pages/cash/ledger.tsx`
- Modify: `src/routes/paths.ts`, `src/routes/sections/dashboard.tsx`, `src/layouts/config-nav-dashboard.tsx`
- Modify: `src/locales/langs/{pt,en,es}/common.json` (`nav.cashLedger`, `cashLedger.*`)

- [ ] **Step 1: Wire path/route/nav/guard**
- [ ] **Step 2: Implement CashLedgerView** (PeriodFilterBar, 3 cards, ErpDataGrid, type filter)
- [ ] **Step 3: i18n keys**
- [ ] **Step 4: Commit** `feat(cash): cash ledger extract UI`

---

### Task 3: Verify + handoff

**Files:**
- Modify: `docs/agents/antigravity-erp-handoff.md`

- [ ] **Step 1:** `yarn vitest run src/sections/cash/cash-ledger.test.ts` + `yarn tsc --noEmit`
- [ ] **Step 2:** Update handoff (G done; smoke E/F + ops pending)
- [ ] **Step 3:** Commit docs

---

## Self-review

1. Spec §4 builder → Task 1  
2. Spec §5 UI/routes → Task 2  
3. Spec §7 acceptance → Task 1 tests + Task 3  
4. No placeholders

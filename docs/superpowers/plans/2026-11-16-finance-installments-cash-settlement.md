# Finance Installments + Cash Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate AP/AR installment docs, sync customer `currentDebt` on AR create/pay/cancel, and require open-cash `RECEIPT`/`PAYMENT` movements on mark paid.

**Architecture:** Pure helpers for split/due dates; flat Firestore docs with `parentId` + installment fields; atomic `writeBatch` create and mark-paid (status + debt + session movements).

**Tech Stack:** Firestore, dayjs, vitest, existing payables/receivables/cash-sessions/customers APIs, RHF forms + DataGrid lists.

**Spec:** `docs/superpowers/specs/2026-11-16-finance-installments-cash-settlement-design.md`

## Global Constraints

- Collections/fields in English under `enterprises/{enterpriseId}/...`
- Amounts 2 decimal places; `splitInstallments` sum equals total
- Mark paid without open cash session must fail (no status change)
- AR with `customerId`: create bumps debt; pay/cancel open reverses that installment amount
- No banking UI, permission rules, or Cloud Functions in this plan
- i18n pt/en/es for new strings

## File map

| File | Role |
|------|------|
| `src/sections/cash/installments.ts` | Pure split + due dates |
| `src/sections/cash/installments.test.ts` | TDD |
| `src/api/firestore/cash-sessions.ts` | `RECEIPT` \| `PAYMENT` on movement type |
| `src/api/firestore/receivables.ts` | Types + createWithInstallments / markPaid / cancel |
| `src/api/firestore/payables.ts` | Types + createWithInstallments / markPaid |
| `src/api/firestore/customers.ts` | Reuse settle / bump debt helpers if needed |
| Forms + list views | installmentCount UI; mark paid wiring |
| `src/locales/langs/{pt,en,es}/common.json` | i18n |
| handoff | Status |

---

### Task 1: Installment pure helpers (TDD)

**Files:** Create `src/sections/cash/installments.ts` + `.test.ts`

- [ ] Tests: `splitInstallments(100, 3)` → `[33.33, 33.33, 33.34]`; `(10, 1)` → `[10]`; reject count &lt; 1
- [ ] Tests: weekly/monthly due dates from `2026-11-16`
- [ ] Implement until green
- [ ] Commit: `feat(finance): add installment split and due-date helpers`

### Task 2: Cash movement types RECEIPT/PAYMENT

**Files:** Modify `src/api/firestore/cash-sessions.ts` (+ cash UI labels if movements listed)

- [ ] Extend `CashMovementType`; map in `mapSession`; allow optional `refType`/`refId`
- [ ] Commit: `feat(cash): support RECEIPT and PAYMENT movement types`

### Task 3: Receivables API — installments + debt + mark paid

**Files:** Modify `src/api/firestore/receivables.ts` (and customers update as needed)

- [ ] Extend `Receivable` type with `parentId?`, `installmentIndex`, `installmentCount`
- [ ] `createReceivableWithInstallments` — batch; bump `currentDebt` by total when `customerId`
- [ ] `markReceivablePaid` — require open session; batch status + debt− + RECEIPT movement
- [ ] `cancelReceivable` — cancel open + debt− if customer
- [ ] Commit: `feat(finance): receivable installments and cash/debt settlement`

### Task 4: Payables API — installments + mark paid

**Files:** Modify `src/api/firestore/payables.ts`

- [ ] Same installment fields; `createPayableWithInstallments`; `markPayablePaid` with PAYMENT
- [ ] Commit: `feat(finance): payable installments and cash settlement`

### Task 5: Forms + lists + i18n

**Files:** receivable/payable forms & list views; locales

- [ ] `installmentCount` field when recurrence ≠ none (2–24)
- [ ] Lists: parcela column; mark paid uses new APIs + no-open-cash toast
- [ ] i18n keys
- [ ] Commit: `feat(finance): wire installment UI and settlement actions`

### Task 6: Verify + handoff

- [ ] `vitest` installments + cash tests; `tsc --noEmit`
- [ ] Update handoff (E done; F/G/ops still pending)
- [ ] Commit: `docs(handoff): record finance installments slice E`

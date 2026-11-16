# Design: Finance Installments + Cash Settlement + Customer Debt (Slice E)

**Date:** 2026-11-16  
**Status:** Draft (awaiting user review of this file)  
**Stack:** Firestore multi-tenant, cash sessions, customers `currentDebt`, payables/receivables CRUD

## 1. Context

Contas a pagar/receber already support `recurrence` metadata and customer linkage on AR, but:

- Recurrence does **not** create installment rows.
- Marking paid does **not** touch cash or `currentDebt`.
- PDV `credit_tab` already increments `currentDebt`; AR settle should close that loop.

User choices (brainstorming):

| Topic | Choice |
|-------|--------|
| Mark AR received | **B** — decrease `currentDebt` **and** require open cash session movement |
| Installments | **A** — generate N child docs at create (`installmentCount`) |
| Create AR with customer | **A** — increase `currentDebt` by total |
| Architecture | Approach **1** — flat docs + `parentId` + atomic APIs |

## 2. Goals

1. Generate N installment documents for AP/AR when recurrence ≠ `none` and `installmentCount ≥ 2`.
2. On AR create with `customerId`, bump `currentDebt` by installment total.
3. On mark paid (AR/AP), require open cash session; write `RECEIPT` (AR) or `PAYMENT` (AP) movement; AR also decreases `currentDebt`.
4. On cancel open AR with customer, reverse that installment’s debt bump.
5. UI: installment count on forms; parcel column on lists; mark-paid uses new APIs with clear errors.

## 3. Non-goals

- Banking / ledger extract UI (Slice G)
- Firestore rules by `MemberPermissionKey` (Slice F)
- Cloud Functions validation of settlements
- Automatic next-installment on pay (rolling schedule)
- Syncing historical open ARs into debt (migration)

## 4. Data model

Flat collections `enterprises/{enterpriseId}/payables|receivables/{id}` — English fields.

New / extended fields on each installment doc:

| Field | Type | Notes |
|-------|------|--------|
| `parentId` | `string` | Shared group id (first doc id or generated uuid); single docs may omit or equal `id` |
| `installmentIndex` | `number` | 1..N |
| `installmentCount` | `number` | N (≥ 1) |
| `amount` | `number` | This installment only |
| `dueDate` | `YYYY-MM-DD` | From start + step |
| `status` | `open\|paid\|cancelled` | Per installment |
| existing | — | description, category, recurrence, customer*/supplier*, startDate, active, timestamps |

**Split rule:** `splitInstallments(total, count)` — floor cents to first N−1; last gets remainder so sum === total (2 decimal places).

**Due dates:** `buildInstallmentDueDates(startYmd, recurrence, count)`:

- `weekly` → +7 days × (i−1)
- `monthly` → +1 calendar month × (i−1) (dayjs)
- `none` → single doc; `dueDate` from form (unchanged)

## 5. Cash movements

Extend `CashMovementType`:

```ts
type CashMovementType = 'SUPPLY' | 'WITHDRAWAL' | 'RECEIPT' | 'PAYMENT';
```

Optional on movement: `refType: 'receivable' | 'payable'`, `refId: string`.

`reason` should include human description (e.g. `Recebimento: {description} ({i}/{N})`).

## 6. API surface

Pure helpers (unit-tested):

- `src/sections/cash/installments.ts` — `splitInstallments`, `buildInstallmentDueDates`

Firestore:

- `createReceivableWithInstallments(enterpriseId, input)` — batch N docs; if `customerId`, `currentDebt += total`
- `createPayableWithInstallments(enterpriseId, input)` — batch N docs
- `markReceivablePaid(enterpriseId, receivableId, { session, user })` — paid + debt− + `RECEIPT`; throws if no open session / already paid
- `markPayablePaid(enterpriseId, payableId, { session, user })` — paid + `PAYMENT`; throws if no open session
- `cancelReceivable(enterpriseId, receivableId)` — if `open` and customer, debt−; set `cancelled`

Keep thin wrappers or replace form `createReceivable` / list mark-paid calls to use these.

**Open session discovery:** reuse existing list/find open `cashSessions` (same as cash UI); mark-paid UI loads open session before call.

**Atomicity:** prefer `writeBatch` for installment creates; for mark-paid, batch status + customer debt + session movements update when possible (session movements are array on session doc — update session + receivable in one batch).

## 7. UI

| Surface | Change |
|---------|--------|
| `receivable-form` / `payable-form` | Show `installmentCount` when recurrence ≠ `none` (default 2, max 24); amount = **total** to split |
| `receivable-list-view` / `payable-list-view` | Column `installmentIndex/installmentCount`; mark paid → new API + toast on missing cash |
| Cash session UI | Display `RECEIPT`/`PAYMENT` in movements list if shown |

i18n keys under `finance.installments*`, `finance.errors.noOpenCash`, etc. (pt/en/es).

## 8. Error handling

| Case | Behavior |
|------|----------|
| No open cash on mark paid | Throw / toast; status unchanged |
| Mark already paid/cancelled | No-op or toast error |
| Cancel already paid | Forbidden or no debt change |
| Missing `enterpriseId` | Existing empty-state pattern |

## 9. Testing / acceptance

**Vitest:** split + due-date helpers.

**Manual / smoke:**

1. Create monthly AR ×3 with customer → 3 rows; debt += total  
2. Mark first paid with open cash → debt −; session has `RECEIPT`  
3. Mark paid with cash closed → error; stays `open`  
4. Create AP ×N → mark paid → `PAYMENT`  
5. Cancel open AR → debt reversed  

## 10. Risks

- Double debt if user creates AR for same sale already on `credit_tab` — document in UI copy; no automatic dedupe this slice.
- Session movement array growth — acceptable for MVP; ledger extract later.
- Race two cashiers marking same receivable — last write wins; rules/CF later.

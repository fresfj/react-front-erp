# Design: MUI DatePicker + Period Filter Bar (Slice D)

**Date:** 2026-11-16  
**Status:** Approved (approach 1 / UX option C)  
**Stack:** `@mui/x-date-pickers` DatePicker, existing `Field.DatePicker` / `CustomDateRangePicker`, dayjs

## 1. Context

ERP forms and DRE/ranking still use native `<TextField type="date">`. The Minimals kit already provides:

- `Field.DatePicker` → `RHFDatePicker` (`src/components/hook-form/rhf-date-picker.tsx`)
- Overview period chips + `CustomDateRangePicker` (`overview-app-view.tsx`)
- File-manager style start/end DatePickers (reference only)

User priority: unify date UX before banking extract, installments, cash debit, or permission rules.

## 2. Goals

1. Replace all ERP native date inputs with `Field.DatePicker` (or standalone `DatePicker` where not in RHF).
2. Extract a reusable **PeriodFilterBar** matching overview: presets Today / 7d / 30d / 90d / All + Custom opening `CustomDateRangePicker`.
3. Apply PeriodFilterBar to **DRE** and **seller ranking** (and optionally refactor overview to consume the same component).
4. Persist form dates as **date-only** `YYYY-MM-DD` strings in Firestore.

## 3. Non-goals (documented backlog)

| Item | Notes |
|------|--------|
| Banking-like cash in/out UI | Future: adapt Minimals `/dashboard/banking` for admin/gestor ledger |
| Automatic installment generation | Future: recurrence creates child payables/receivables |
| Baixa no caixa on mark paid | Future: link paid AP/AR to cash session movement |
| Firestore rules by `MemberPermissionKey` | Future: harden beyond PermissionGuard |

## 4. Architecture

### 4.1 Single-date fields (forms)

Use `Field.DatePicker` with `name` bound to RHF.

| Screen | Field |
|--------|--------|
| `/dashboard/account/general` | `birthDate` |
| `/dashboard/products/create|edit` | expiry / validity field (existing `type="date"`) |
| `/dashboard/batches/create` | validity / expiry |
| Payable / Receivable forms | `startDate`, `dueDate` |

**Normalization:** Ensure `RHFDatePicker` `onChange` writes `dayjs(value).format('YYYY-MM-DD')` (or project `formatStr` date-only) so storage stays date-only. Load path already accepts ISO strings via `dayjs(field.value)`.

### 4.2 PeriodFilterBar (ranges)

**New:** `src/components/period-filter/` (or `src/sections/common/period-filter-bar.tsx`)

```ts
export type DateFilterPreset = 'today' | '7d' | '30d' | '90d' | 'all' | 'custom';

type PeriodFilterBarProps = {
  preset: DateFilterPreset;
  onPresetChange: (preset: DateFilterPreset) => void;
  rangePicker: ReturnType<typeof useDateRangePicker>; // open, onClose, startDate, endDate, onChangeStartDate, onChangeEndDate, shortLabel, ...
  title?: string;
};
```

Behavior (copy from overview):

- Chips for presets; Custom opens dialog/`CustomDateRangePicker`.
- Consumer filters lists with existing helpers (`isTimestampInDateRange` or dayjs range from picker).
- Default preset for DRE/ranking: `30d` (current behavior).

**Consumers:** `dre-view.tsx`, `seller-ranking-view.tsx`; prefer migrating `overview-app-view.tsx` to the same bar to avoid drift.

### 4.3 i18n

Keys under `finance.*` / `periodFilter.*` for chip labels (Hoje, 7 dias, …, Personalizado) in pt/en/es.

## 5. Error handling

- Custom range: if end &lt; start, show helper (same pattern as file-manager `dateError` / `fIsAfter`).
- Empty custom range: keep previous filtered set or treat as no filter until both dates set (prefer: no filter until both set when preset=`custom`).

## 6. Testing / acceptance

1. Account birthDate opens MUI calendar; saves `YYYY-MM-DD`; reload shows date.
2. Product/batch validity same.
3. DRE: chip 7d changes totals; Custom opens range picker and filters.
4. Ranking same period behavior.
5. No remaining ERP `type="date"` on listed screens (grep gate).

## 7. Files (expected)

- `src/components/period-filter/*` (or sections/common)
- Possibly small tweak `rhf-date-picker.tsx` format
- Forms: account, product, batch, payable, receivable
- Views: dre-view, seller-ranking-view (± overview)
- Locales pt/en/es
- Handoff backlog for banking / parcels / cash debit / permission rules

## 8. Decisions log

| Decision | Choice |
|----------|--------|
| First slice among finance backlog | DatePicker + period filter only |
| Range UX | Overview chips + CustomDateRangePicker |
| Single fields | Field.DatePicker |
| Storage | YYYY-MM-DD |

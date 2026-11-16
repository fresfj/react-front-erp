# DatePicker + PeriodFilterBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ERP native `type="date"` inputs with MUI `Field.DatePicker` and unify DRE/ranking/overview period filters via a reusable PeriodFilterBar (chips + CustomDateRangePicker).

**Architecture:** Normalize `RHFDatePicker` to persist `YYYY-MM-DD`. Extract PeriodFilterBar from overview UX. Wire forms + DRE/ranking (+ overview refactor).

**Tech Stack:** MUI X DatePickers, dayjs, RHF `Field.DatePicker`, existing `CustomDateRangePicker` / `useDateRangePicker`.

**Spec:** `docs/superpowers/specs/2026-11-16-datepicker-period-filter-design.md`

## Global Constraints

- Persist form dates as date-only `YYYY-MM-DD`
- Range UX = overview chips (today|7d|30d|90d|all) + Custom → CustomDateRangePicker
- Single fields = Field.DatePicker only
- No banking / parcels / cash debit / permission rules in this plan
- i18n pt/en/es for period labels

---

### Task 1: Normalize RHFDatePicker to YYYY-MM-DD

**Files:** Modify `src/components/hook-form/rhf-date-picker.tsx`

- [x] Change `onChange` to `field.onChange(newValue ? dayjs(newValue).format('YYYY-MM-DD') : '')`
- [ ] Commit: `fix(hook-form): persist DatePicker values as YYYY-MM-DD`

### Task 2: PeriodFilterBar component

**Files:** Create `src/components/period-filter/period-filter-bar.tsx` + `index.ts`

- [x] Export `DateFilterPreset` type and `PeriodFilterBar` with props: preset, onPresetChange, rangePicker, title?
- [x] Chips + Personalizado opens `rangePicker.onOpen` + render `CustomDateRangePicker` with rangePicker props
- [x] i18n keys `periodFilter.*`
- [ ] Commit

### Task 3: Wire DRE + ranking + overview

**Files:** `dre-view.tsx`, `seller-ranking-view.tsx`, `overview-app-view.tsx`

- [x] Replace TextField type=date / duplicate chip UI with PeriodFilterBar
- [x] Filter using dayjs from preset or custom range (reuse overview filter logic; can keep `isTimestampInDateRange` by converting dayjs → YMD)
- [ ] Commit

### Task 4: Forms → Field.DatePicker

**Files:** account-general-form, product-form, batch-form, payable-form, receivable-form

- [x] Replace each `Field.Text type="date"` with `Field.DatePicker`
- [x] Grep: no `type="date"` left in those ERP files
- [ ] Commit + handoff note

### Task 5: Verify

- [x] `vitest` existing cash tests still pass
- [x] Grep gate for type="date" in ERP paths listed in spec
- [x] Update handoff backlog (banking/parcels/rules deferred)

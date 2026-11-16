# Design: DRE filters, Seller Ranking, Payables/Receivables (Slice C)

**Date:** 2026-11-16  
**Status:** Approved (approach 1, status open|paid|cancelled, C1→C2)  
**Stack:** Firestore + Minimals CRUD UI

## Goals

1. DRE (`/dashboard/cash/dre`) filterable by start/end date.
2. Seller ranking by `sellerUid` (sales count, net total, optional CMV/profit) with same date filter.
3. Contas a Pagar (`payables`) and Contas a Receber (`receivables`) CRUD with category, amount, start/due dates, party, recurrence metadata, status.

## Non-goals

- Auto-generate recurrence installments
- Auto cash movement on mark paid
- Cloud Functions for aggregations

## C1 — DRE + Ranking

- Filter sales/sessions by `createdAt` (or session open/close) within `[start, end]` inclusive.
- Ranking page: `/dashboard/pos/ranking` (permission `dre`); aggregate client-side from `listSales`.
- Nav under Financeiro or PDV children when `dre`.

## C2 — AP/AR

Collections: `enterprises/{enterpriseId}/payables|receivables`

Fields (English): description, category, amount, startDate, dueDate, supplierId/Name or customerId/Name, recurrence (`none|weekly|monthly`), status (`open|paid|cancelled`), active, timestamps.

UI: DataGrid list + CardHeader form; routes under `/dashboard/cash/payables|receivables`; PermissionGuard `dre`.

Rules: sameEnterprise like suppliers.

## Acceptance

- DRE changes when date range changes
- Ranking sorts by total sales desc
- Create payable/receivable, mark paid, list filters by status

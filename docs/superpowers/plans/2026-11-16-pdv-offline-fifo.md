# Plan: PDV Offline, Seleção FIFO de Lote e Histórico de Vendas

**Spec:** `docs/superpowers/specs/2026-11-16-pdv-offline-fifo-design.md`  
**Date:** 2026-11-16

---

## Tasks

### Task 1 — Domínio do PDV (Cálculo de Carrinho, FIFO, Troco e Limite de Desconto por Role) + Testes TDD
- **Files:**
  - `src/sections/pos/pos-calculator.ts`
  - `src/sections/pos/pos-calculator.test.ts`
- **Deliverables:**
  - `pickFifoBatch(batches, productId, neededQty)`
  - `calculatePosTotals({ items, discountAmount, payments, role })`
  - `generateSaleCode(date?, suffix?)`
  - Testes unitários cobrindo seleção FIFO por `createdAt`, cálculo de subtotal/desconto/CMV/lucro bruto, cálculo de troco em múltiplos pagamentos e bloqueio de desconto acima de 5% para `operador`.

### Task 2 — Camada Firestore (`src/api/firestore/sales.ts`)
- **Files:**
  - `src/api/firestore/sales.ts`
- **Deliverables:**
  - `listSales`, `getSale`, `createSale` (usando `writeBatch` para gravar a venda, deduzir `remainingQty` do lote vendido em `batches` e criar movimentação `OUT` em `stockMovements`), `cancelSale` (restaurando saldo do lote e gravando estorno `IN` em `stockMovements`).

### Task 3 — Firestore Security Rules (`firestore.rules`)
- **Files:**
  - `firestore.rules` (delegado ao subagente `firestore-rules-author`)
- **Deliverables:**
  - Regra multi-tenant para `enterprises/{enterpriseId}/sales/{id}`.

### Task 4 — Rotas, Navegação e Internacionalização (`pt`, `en`, `es`)
- **Files:**
  - `src/routes/paths.ts`
  - `src/routes/sections/dashboard.tsx`
  - `src/layouts/config-nav-dashboard.tsx`
  - `src/locales/langs/pt/common.json`
  - `src/locales/langs/en/common.json`
  - `src/locales/langs/es/common.json`

### Task 5 — Telas do PDV Offline e Histórico de Vendas (`src/sections/pos/*` e `src/pages/pos/*`)
- **Files:**
  - `src/sections/pos/view/pos-checkout-view.tsx`
  - `src/sections/pos/view/sale-list-view.tsx`
  - `src/sections/pos/view/sale-details-view.tsx`
  - `src/pages/pos/checkout.tsx`
  - `src/pages/pos/list.tsx`
  - `src/pages/pos/details.tsx`

### Task 6 — Verificação Final (`tsc`, `vitest`, Ledger SDD)
- **Deliverables:**
  - `./node_modules/.bin/tsc --noEmit` (0 erros)
  - `./node_modules/.bin/vitest run` (todos os testes passando)
  - Atualização de `.superpowers/sdd/progress.md` e `docs/agents/antigravity-erp-handoff.md`.

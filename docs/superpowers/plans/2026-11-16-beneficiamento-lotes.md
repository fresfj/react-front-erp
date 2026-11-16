# Plan: Beneficiamento, Rastreabilidade de Lotes e Movimentações de Estoque

**Spec:** `docs/superpowers/specs/2026-11-16-beneficiamento-lotes-design.md`  
**Date:** 2026-11-16

---

## Tasks

### Task 1 — Domínio de Rateio de Custo (CMV) e Gerador de Códigos + Testes TDD
- **Files:**
  - `src/sections/processing/cost-allocation.ts`
  - `src/sections/processing/cost-allocation.test.ts`
- **Deliverables:**
  - `calculateProcessingCostAllocation({ rawQtyUsed, rawUnitCost, extraCost, outputs })`
  - `generateLotCode(prefix?, date?)` e `generateProcessingOrderCode(date?)`
  - Testes unitários cobrindo rateio simples (fator 1), rateio ponderado (Açaí Fino/Médio/Grosso com fatores distintos), custos extras e validações de borda.

### Task 2 — Camada Firestore (`batches`, `stockMovements`, `processingOrders`)
- **Files:**
  - `src/api/firestore/batches.ts`
  - `src/api/firestore/stock-movements.ts`
  - `src/api/firestore/processing-orders.ts`
- **Deliverables:**
  - CRUD e listagens tipadas sob `enterprises/{enterpriseId}/...`.
  - `createBatchWithMovement`: cria lote de entrada (ex.: compra de fornecedor) + movimentação `IN` + atualiza `costPrice` do produto via `writeBatch`.
  - `createProcessingOrder`: grava ordem + baixa insumo (`PROCESSING_OUT` e abate `remainingQty` do lote de insumo se informado) + cria lotes acabados (`batches`) + movimentações `PROCESSING_IN` + atualiza `costPrice` dos produtos acabados via `writeBatch`.
  - `cancelProcessingOrder`: marca ordem como `cancelled`, inativa os lotes gerados e registra estorno no estoque.

### Task 3 — Firestore Security Rules (`firestore.rules`)
- **Files:**
  - `firestore.rules` (delegado ao subagente `firestore-rules-author`)
- **Deliverables:**
  - Regras multi-tenant para `batches`, `processingOrders` e `stockMovements`.

### Task 4 — Rotas, Navegação e Internacionalização (`pt`, `en`, `es`)
- **Files:**
  - `src/routes/paths.ts`
  - `src/routes/sections/dashboard.tsx`
  - `src/layouts/config-nav-dashboard.tsx`
  - `src/locales/langs/pt/common.json`
  - `src/locales/langs/en/common.json`
  - `src/locales/langs/es/common.json`

### Task 5 — Telas de Beneficiamento (`src/sections/processing/*` e `src/pages/processing/*`)
- **Files:**
  - `src/sections/processing/processing-form.tsx`
  - `src/sections/processing/view/processing-list-view.tsx`
  - `src/sections/processing/view/processing-create-view.tsx`
  - `src/sections/processing/view/processing-details-view.tsx`
  - `src/pages/processing/list.tsx`
  - `src/pages/processing/create.tsx`
  - `src/pages/processing/details.tsx`

### Task 6 — Telas de Lotes e Movimentações de Estoque (`src/sections/batch/*` e `src/pages/batch/*`)
- **Files:**
  - `src/sections/batch/batch-form.tsx`
  - `src/sections/batch/view/batch-list-view.tsx`
  - `src/sections/batch/view/batch-create-view.tsx`
  - `src/sections/batch/view/stock-movement-list-view.tsx`
  - `src/pages/batch/list.tsx`
  - `src/pages/batch/create.tsx`
  - `src/pages/batch/movements.tsx`

### Task 7 — Verificação Final (`tsc`, `vitest`, Ledger SDD)
- **Deliverables:**
  - `./node_modules/.bin/tsc --noEmit` (0 erros)
  - `./node_modules/.bin/vitest run` (todos os testes passando)
  - Atualização de `.superpowers/sdd/progress.md` e `docs/agents/antigravity-erp-handoff.md`.

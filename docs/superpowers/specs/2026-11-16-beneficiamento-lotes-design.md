# Design: Beneficiamento, Rastreabilidade de Lotes (FIFO base) e Movimentações de Estoque

**Date:** 2026-11-16  
**Status:** Approved — implementation plan at `docs/superpowers/plans/2026-11-16-beneficiamento-lotes.md`  
**Depends on:** `docs/superpowers/specs/2026-11-15-suppliers-products-account-design.md`  
**Product context:** ERP SaaS Varejo & Beneficiamento (`docs/deepseek_markdown_20261115_78aa86.md`, Fase 2)

---

## 1. Goal

Entregar o **Core de Beneficiamento, Rastreabilidade de Lotes e Movimentações de Estoque** no Firestore multi-tenant (`enterprises/{enterpriseId}/...`), permitindo:
1. **Entrada de Lotes / Estoque (`batches` + `stockMovements`):** Registrar compras/entradas de insumos (`raw`) ou produtos acabados (`finished`) vinculados opcionalmente a um fornecedor (`supplierId`), gerando código de lote rastreável (`lotCode`).
2. **Ordens de Beneficiamento (`processingOrders`):** Consumir matéria-prima (`type === 'raw'`), adicionar custos extras (energia, água, embalagens), classificar múltiplos produtos acabados (`type === 'finished'`) com **Fator de Valorização (`weightFactor`)** e calcular automaticamente o **Custo Unitário Rateado (CMV)** de cada produto gerado.
3. **Geração Automática de Lotes e Baixa/Entrada de Estoque:** Ao concluir uma Ordem de Beneficiamento, gravar em batch atômico no Firestore:
   - Documento em `processingOrders`
   - Movimentação `PROCESSING_OUT` da matéria-prima em `stockMovements` (e abatimento do lote de origem, se selecionado)
   - Um documento em `batches` para cada produto acabado gerado (com `lotCode`, `initialQty`, `remainingQty`, `unitCost = allocatedUnitCost`)
   - Movimentação `PROCESSING_IN` em `stockMovements` para cada lote gerado
   - Atualização do `costPrice` do produto acabado com o novo custo unitário rateado.

---

## 2. Decisions (Locked)

| Tópico | Decisão |
|--------|---------|
| Persistência | Firestore sob `enterprises/{enterpriseId}/{batches\|processingOrders\|stockMovements}` |
| Atomicidade Offline-First | `writeBatch(FIRESTORE)` para gravar Ordem + Lotes + Movimentações + atualização de `costPrice` |
| Algoritmo de Rateio (CMV) | Ponderado por `qty * weightFactor`: `share_i = (qty_i * factor_i) / sum(qty * factor)` |
| Rastreabilidade FIFO | `batches` armazena `remainingQty` e `createdAt` ISO para consumo FIFO imediato na Fase 3 (PDV) |
| Padrão de UI | Minimals v6 (`DataGrid` em `Card height: 720` + `CardHeader` colapsável + React Hook Form + Zod) |
| Idiomas | `pt` (padrão), `en`, `es` em `src/locales/langs/*/common.json` |

---

## 3. Data Model (Firestore — English keys)

### 3.1 `enterprises/{enterpriseId}/batches/{batchId}`
```ts
export type Batch = {
  id: string;
  lotCode: string;              // ex.: LOTE-20261116-A1B2
  productId: string;
  productName: string;
  productSku: string;
  productType: 'raw' | 'finished';
  unit: string;
  supplierId?: string;
  supplierName?: string;
  processingOrderId?: string;
  processingOrderCode?: string;
  initialQty: number;
  remainingQty: number;
  unitCost: number;
  expiresAt?: string;           // YYYY-MM-DD opcional
  notes?: string;
  active: boolean;
  createdAt: string;            // ISO (chave de ordenação FIFO)
  updatedAt: string;
};
```

### 3.2 `enterprises/{enterpriseId}/processingOrders/{orderId}`
```ts
export type ProcessingOutputItem = {
  productId: string;
  productName: string;
  productSku: string;
  variant?: string;
  unit: string;
  qty: number;
  weightFactor: number;         // ex.: 1.0 (Fino), 1.2 (Médio), 1.5 (Grosso)
  allocatedTotalCost: number;
  allocatedUnitCost: number;    // CMV unitário calculado
  batchId: string;
  lotCode: string;
};

export type ProcessingOrderStatus = 'completed' | 'cancelled';

export type ProcessingOrder = {
  id: string;
  code: string;                 // ex.: OB-20261116-001
  rawProductId: string;
  rawProductName: string;
  rawProductSku: string;
  rawUnit: string;
  rawBatchId?: string;
  rawLotCode?: string;
  supplierId?: string;
  supplierName?: string;
  rawQtyUsed: number;
  rawUnitCost: number;
  rawTotalCost: number;
  extraCost: number;            // água, energia, embalagem
  totalCost: number;            // rawTotalCost + extraCost
  totalOutputQty: number;
  outputs: ProcessingOutputItem[];
  notes?: string;
  status: ProcessingOrderStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 3.3 `enterprises/{enterpriseId}/stockMovements/{movementId}`
```ts
export type StockMovementType =
  | 'IN'
  | 'OUT'
  | 'ADJUST'
  | 'PROCESSING_OUT'
  | 'PROCESSING_IN';

export type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  batchId?: string;
  lotCode?: string;
  type: StockMovementType;
  qty: number;                  // sempre positivo; direção dada por type
  unitCost?: number;
  reason?: string;
  refId?: string;               // processingOrderId, saleId, etc.
  createdBy?: string;
  createdAt: string;
};
```

---

## 4. Cálculo do Rateio Ponderado (CMV)

Dado:
- `rawTotalCost = rawQtyUsed * rawUnitCost`
- `totalCost = rawTotalCost + extraCost`
- Lista de saídas $i \in \{1..n\}$ com quantidade $q_i > 0$ e fator de valorização $w_i > 0$:

$$W = \sum_{i=1}^{n} (q_i \cdot w_i)$$

Para cada saída $i$:
$$\text{allocatedTotalCost}_i = \text{totalCost} \times \frac{q_i \cdot w_i}{W}$$
$$\text{allocatedUnitCost}_i = \frac{\text{allocatedTotalCost}_i}{q_i}$$

Valores arredondados a 4 casas decimais no cálculo interno e 2 casas para exibição monetária, garantindo precisão no DRE futuro.

---

## 5. RBAC & Firestore Security Rules

| Role | `batches` | `processingOrders` | `stockMovements` |
|------|-----------|--------------------|------------------|
| `admin` / `gestor` | R/W | R/W | R/W |
| `operador` | R/W | R/W | R/W |
| `platformAdmin` | Read | Read | Read |

---

## 6. Rotas e Navegação

- `/dashboard/processing` → redireciona para `/dashboard/processing/list`
  - `/dashboard/processing/list` — Lista de Ordens de Beneficiamento (`DataGrid`)
  - `/dashboard/processing/create` — Nova Ordem de Beneficiamento (cálculo CMV em tempo real)
  - `/dashboard/processing/:id` — Detalhes da Ordem de Beneficiamento e lotes gerados
- `/dashboard/batches` → redireciona para `/dashboard/batches/list`
  - `/dashboard/batches/list` — Lista de Lotes e Saldo Rastreável (`DataGrid`)
  - `/dashboard/batches/create` — Entrada de Lote / Compra de Mercadoria (`CardHeader` form)
  - `/dashboard/batches/movements` — Histórico de Movimentações de Estoque (`DataGrid`)

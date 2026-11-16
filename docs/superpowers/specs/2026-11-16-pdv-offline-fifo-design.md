# Design: PDV Offline, Carrinho Rápido, Seleção de Lote FIFO e Múltiplos Pagamentos

**Date:** 2026-11-16  
**Status:** Approved — implementation plan at `docs/superpowers/plans/2026-11-16-pdv-offline-fifo.md`  
**Depends on:** `docs/superpowers/specs/2026-11-16-beneficiamento-lotes-design.md`  
**Product context:** ERP SaaS Varejo & Beneficiamento (`docs/deepseek_markdown_20261115_78aa86.md`, Fase 3)

---

## 1. Goal

Entregar o módulo de **PDV Offline e Histórico de Vendas (`sales`)** no Firestore multi-tenant (`enterprises/{enterpriseId}/sales/{saleId}`), permitindo:
1. **Frente de Caixa / PDV Rápido (`/dashboard/pos`):**
   - Busca instantânea por **Código de Barras / SKU / Nome** operando sobre os dados sincronizados localmente (IndexedDB Firestore cache).
   - **Seleção Automática de Lote via FIFO (First In, First Out):** Ao adicionar um produto ao carrinho, o sistema sugere automaticamente o lote ativo mais antigo com saldo disponível (`remainingQty > 0`), permitindo trocar o lote manualmente se desejado e gravando `batchId`, `lotCode` e `unitCost` (CMV) no item da venda para rastreabilidade completa e futuro DRE.
   - **Desconto e Limite de Segurança por Role:** Cálculo de subtotal, desconto (em R$ ou %) e alerta/validação de limite de desconto para `operador` (padrão máx. 5%, enquanto `admin` e `gestor` possuem alçada superior).
   - **Múltiplos Meios de Pagamento:** Dinheiro (`cash`, com cálculo automático de troco), PIX (`pix`), Cartão de Crédito (`credit_card`), Cartão de Débito (`debit_card`) e Vale-Troca (`store_credit`).
2. **Baixa Automática e Atômica de Estoque (`writeBatch`):**
   - Ao finalizar a venda:
     - Grava o documento em `enterprises/{enterpriseId}/sales/{saleId}`
     - Deduz `remainingQty` do lote (`batches/{batchId}`) de cada item vendido
     - Registra uma movimentação `OUT` em `stockMovements` para cada item vendido com referência à venda (`refId = saleId` e `lotCode`).
3. **Listagem e Detalhes de Vendas (`/dashboard/pos/sales` e `/dashboard/pos/sales/:id`):**
   - `DataGrid` padrão Minimals v6 com filtros por status (`completed` / `cancelled`) e método de pagamento, visualização de recibo/detalhes com rastreabilidade dos lotes vendidos e opção de cancelamento/estorno (para `admin`/`gestor`).

---

## 2. Decisions (Locked)

| Tópico | Decisão |
|--------|---------|
| Persistência Offline-First | `writeBatch(FIRESTORE)` sob `enterprises/{enterpriseId}/sales` + `batches` + `stockMovements` |
| Seleção de Lote | FIFO automático (`createdAt` ascendente com `active && remainingQty > 0`) + override manual no carrinho |
| Rastreabilidade & CMV | Cada `SaleItem` persiste `batchId`, `lotCode` e `unitCost` (herdado do lote ou do produto) |
| Limite de Desconto | `operador`: máx. 5% do subtotal; `gestor`/`admin`: até 100% |
| Pagamentos | Múltiplas linhas de pagamento; soma dos pagamentos $\ge$ `total`; excedente em `cash` vira `changeAmount` (troco) |
| Idiomas | `pt` (padrão), `en`, `es` em `src/locales/langs/*/common.json` |

---

## 3. Data Model (Firestore — English keys)

### 3.1 `enterprises/{enterpriseId}/sales/{saleId}`
```ts
export type PaymentMethod =
  | 'cash'
  | 'pix'
  | 'credit_card'
  | 'debit_card'
  | 'store_credit';

export type SalePayment = {
  method: PaymentMethod;
  amount: number;
};

export type SaleItem = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  qty: number;
  unitPrice: number;
  unitCost: number;             // CMV unitário do lote/produto no momento da venda
  lineTotal: number;
  batchId?: string;
  lotCode?: string;
  batchCurrentRemaining?: number;
};

export type SaleStatus = 'completed' | 'cancelled';

export type Sale = {
  id: string;
  code: string;                 // ex.: VD-20261116-A1B2
  customerName?: string;
  customerDocument?: string;
  sellerUid?: string;
  sellerEmail?: string;
  items: Omit<SaleItem, 'batchCurrentRemaining'>[];
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  totalCost: number;            // CMV total da venda (soma de qty * unitCost)
  grossProfit: number;          // total - totalCost
  payments: SalePayment[];
  paidAmount: number;
  changeAmount: number;         // troco
  notes?: string;
  status: SaleStatus;
  createdAt: string;
  updatedAt: string;
};
```

---

## 4. RBAC & Firestore Security Rules

| Role | PDV (Criar Venda) | Desconto Máx. | Cancelar Venda | Ler Vendas |
|------|-------------------|---------------|----------------|------------|
| `admin` / `gestor` | Sim | 100% | Sim | Sim |
| `operador` | Sim | 5% | Não | Sim |
| `platformAdmin` | Leitura | — | — | Sim |

---

## 5. Rotas e Navegação

- `/dashboard/pos` — Frente de Caixa (PDV Offline)
- `/dashboard/pos/sales` — Histórico de Vendas (`DataGrid`)
- `/dashboard/pos/sales/:id` — Detalhes da Venda / Cupom e Rastreabilidade de Lotes

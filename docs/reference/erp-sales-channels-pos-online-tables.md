# Pontos de Venda (Canais) — PDV Direto, Venda Online (Delivery/Retirada) e Mesa no Salão

Este documento é a referência oficial para agentes e desenvolvedores sobre como os **3 canais de venda** do ERP Minimals operam, se integram ao **Caixa (`/dashboard/cash`)**, alimentam o **Kanban de Expedição (`/dashboard/pos/online-orders`)** e consolidam métricas de **Receita, CMV e Lucro** no **Dashboard (`/dashboard`)** e **DRE**.

---

## 1. Regra de Ouro — Caixa Aberto Obrigatório em TODOS os Canais
**Nenhuma venda pode ser iniciada ou concluída sem uma sessão de caixa aberta** em `enterprises/{enterpriseId}/cashSessions` (`status === 'open'`).

| Canal | Onde valida Caixa Aberto | Comportamento se Caixa Fechado |
|---|---|---|
| **PDV (Venda Direta)** | `/dashboard/pos` (`pos-checkout-view.tsx`) | Exibe alerta bloqueante com botão **"Abrir Caixa agora"** e impede a finalização da venda. |
| **Venda Online (Delivery / Retirada)** | `getPublicStorefront` / `placeOnlineOrder` / `acceptOnlineOrder` (`functions/online-orders.js`) | Vitrine pública marca `isOpen: false` (`closedReason: 'no_open_cash'`); aceite no Kanban rejeita com `no_open_cash`. |
| **Mesa no Salão (QR Code + Garçom)** | `placeOnlineOrder` (QR), `submitWaiterTableOrder` e `closeTableSession` (`src/api/firestore/tables.ts` + `/dashboard/pos/tables`) | QR Code bloqueia novos pedidos (`no_open_cash`); Garçom vê alerta de caixa fechado e não consegue lançar nem encerrar comandas. |

Todas as vendas concluídas dos 3 canais gravam em `enterprises/{enterpriseId}/sales/{saleId}` vinculadas ao **`cashSessionId`** da sessão aberta, garantindo que o **Fechamento Cego** em `/dashboard/cash` contabilize 100% dos recebimentos (Dinheiro, PIX, Crédito, Débito) de PDV + Online + Mesa.

---

## 2. Os 3 Canais de Venda (`sales.channel`)

### 2.1. PDV — Venda Direta / Balcão (`channel: 'pos'`)
- **Rota:** `/dashboard/pos` (`src/sections/pos/view/pos-checkout-view.tsx`)
- **Fluxo:** Operador seleciona produtos/combos (aplicando automaticamente preço promocional vigente via `getEffectiveProductPrice`), escolhe cliente/entrega opcional, forma(s) de pagamento e finaliza.
- **Persistência:** `createSale` grava em `sales` (`channel: 'pos'`, `cashSessionId`), baixa estoque FIFO (`batches` + `stockMovements`), calcula `totalCost` (CMV) e `grossProfit`, e abre `ReceiptDialog` (58mm/80mm/PDF).

### 2.2. Venda Online — Delivery & Retirada (`channel: 'online'`)
- **Vitrine Pública:** `/p/:slug` → `/p/:slug/checkout` → `/p/:slug/order/:orderId`
- **Gestão Interna (Kanban):** `/dashboard/pos/online-orders` (`src/sections/pos/view/online-order-list-view.tsx`)
- **Pagamentos:**
  - **Online:** PIX (BR Code EMVCo com QR Code via `src/utils/pix-brcode.ts`, entra no Kanban como `PIX Online · Aguardando confirmação`).
  - **Na Entrega / Retirada:** Dinheiro (com troco opcional), Cartão de Crédito e Cartão de Débito.
- **Ciclo de Vida no Kanban:** `pending` (Novos) → `accepted` (Aceitos) → `preparing` (Em preparo) → `out_for_delivery` (Expedição / Retirada) → `delivered` (Finalizados, **congelando o timer SLA**).
- **Persistência:** Ao aceitar (`acceptOnlineOrder`), a Cloud Function valida caixa aberto, baixa estoque FIFO, confirma PIX online se aplicável, grava a venda em `sales` (`channel: 'online'`, `onlineOrderId`, `cashSessionId`) e dispara WhatsApp automático (Plano Ultra).

### 2.3. Mesa no Salão — QR Code & Garçom (`channel: 'table'`)
- **Gestão da Loja & Salão:** `/dashboard/pos/tables` (`src/sections/pos/tables/view/tables-management-view.tsx`)
- **Cardápio Exclusivo da Mesa (QR Code):** `/p/:slug/mesa/:tableCode`
- **Coleções Firestore:**
  - `enterprises/{enterpriseId}/tables/{tableId}`: cadastro da mesa (`number`, `area`, `capacity`, `qrCodeSlug`, `status: 'available' | 'occupied'`, `acceptingOrders: boolean`).
  - `enterprises/{enterpriseId}/tableSessions/{sessionId}`: comandas individuais abertas na mesa (`tableId`, `tableNumber`, `status: 'open' | 'closed'`, `customerName`, `customerPhone`, `waiterUid`, `waiterName`, `orderIds`, `subtotal`, `total`).
- **Comandas Individuais na Mesma Mesa:**
  - Uma mesma mesa pode ter **N comandas abertas simultaneamente** (ex.: Mesa 04 com `João`, `Maria`, `Pedro`, `Ana`), tanto criadas pelo **Garçom** quanto automaticamente via **QR Code** (identificadas pelo telefone do cliente).
  - Pedidos de mesa **não passam pelo `/checkout`**: entram **direto na coluna `Em Preparo` do Kanban** (`deliveryType: 'table'`, `fulfillmentStatus: 'preparing'`), disparam **alerta sonoro** (`useOnlineOrdersMonitor`) e identificam quem solicitou (`Mesa XX · Garçom: <Nome>` ou `Mesa XX · Cliente (QR)`).
- **Controles de Bloqueio:**
  - Botão geral **`Mesas Liberadas / Bloqueadas`** (`onlineStore.acceptTableOrders`) + botão individual **`solar:power-bold`** por mesa (`tables/{id}.acceptingOrders`) + horário da loja online.
- **Impressão & Encerramento:**
  - Impressão de pré-conta individual ou de todas as comandas via `ReceiptDialog` (`buildTableReceiptSale`).
  - Ao encerrar uma comanda (`closeTableSession`), aplica **toggle opcional de 10% taxa de serviço**, calcula o **CMV real** (`unitCost` / `totalCost` / `grossProfit`, inclusive somando componentes de **Combos**), grava em `sales` (`channel: 'table'`, `cashSessionId`, `tableId`, `tableSessionId`), finaliza os pedidos no Kanban e só libera a mesa (`available`) quando a última comanda aberta daquela mesa é encerrada.

---

## 3. Consolidação no Dashboard, Caixa e Financeiro
- **Dashboard Gerencial (`/dashboard`):** `computeChannelBreakdown` (`src/sections/overview/erp/erp-analytics.ts`) separa receita, quantidade de vendas e participação percentual dos **3 canais**: `PDV Direto`, `Online / Delivery` e `Mesas / Salão`.
- **Home do Operador (`/dashboard` operador):** Donut de canais do dia + histórico exibindo badges `PDV`, `Online` e `Mesa`.
- **Caixa (`/dashboard/cash`):** A sessão ativa soma automaticamente todas as vendas concluídas (`channel: 'pos' | 'online' | 'table'`) vinculadas à sessão, exibindo o resumo por canal e validando no **Fechamento Cego**.
- **Regra de Custos Cloud (GCP/Firebase):** Reutilizar Cloud Functions existentes (ex.: `getPublicOrderStatus` com `tableCode`) sempre que possível para não multiplicar serviços Cloud Run nem gerar custos extras.

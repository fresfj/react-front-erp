# Spec — Painel de Expedição Kanban de Pedidos Online (`/dashboard/pos/online-orders`)

## 1. Goal
Evoluir `/dashboard/pos/online-orders` com um **Painel de Expedição Kanban** inspirado no Gestor de Pedidos do iFood e no padrão visual de `/dashboard/kanban` (Minimals v6 + `@dnd-kit`), mantendo alternância instantânea para a visão **Lista** existente e integração completa com as Cloud Functions (`acceptOnlineOrder`, `rejectOnlineOrder`, `updateOnlineOrderStatus`), `ReceiptDialog`, `OrderProgressStepper` e alertas em tempo real.

## 2. Decisions (Locked)
- **Rota única:** `/dashboard/pos/online-orders` com alternância `Kanban` (padrão) | `Lista` persistida em `localStorage`.
- **5 Colunas Fixas:** `pending` (Novos), `accepted` (Aceitos), `preparing` (Em Preparo), `out_for_delivery` (Expedição / Retirada), `delivered` (Finalizados).
- **Aceite sem sair da tela:** Aceitar no Kanban mantém o operador no painel (sem redirect automático para detalhes da venda).
- **Impressão opcional ao aceitar:** Toggle `Imprimir ao aceitar` (persistido em `localStorage`) que carrega a venda gerada (`getSale`) e abre `ReceiptDialog` com `autoPrint`.
- **Drag-and-drop seguro:**
  - `pending` → `accepted`: chama `acceptOnlineOrderCf`.
  - `pending` → `preparing`: encadeia `acceptOnlineOrderCf` + `updateOnlineOrderStatusCf('preparing')`.
  - `pending` → `out_for_delivery` / `delivered`: bloqueado (exige aceite/preparo).
  - Pedidos já aceitos (`accepted`, `preparing`, `out_for_delivery`, `delivered`) podem avançar/ajustar entre si via `updateOnlineOrderStatusCf`, mas **nunca** voltar para `pending`.
  - Recusa (`rejected`) ocorre somente via botão + `OnlineOrderRejectDialog` (com motivo opcional enviado ao cliente no WhatsApp).
- **Período padrão no Kanban:** `today` (exibe todos os pedidos criados hoje **mais** qualquer pedido ainda ativo de dias anteriores para nenhum pedido ficar esquecido), com opção `7d` e `all`.
- **Backend V1:** 100% compatível com as Cloud Functions e `firestore.rules` atuais (sem deploy obrigatório de backend).

## 3. Architecture & Files
- `src/sections/pos/online-order-kanban/online-order-kanban-utils.ts` (+ `.test.ts`)
- `src/sections/pos/online-order-kanban/online-order-kanban-board.tsx`
- `src/sections/pos/online-order-kanban/online-order-kanban-column.tsx`
- `src/sections/pos/online-order-kanban/online-order-kanban-card.tsx`
- `src/sections/pos/online-order-kanban/online-order-details-drawer.tsx`
- `src/sections/pos/online-order-kanban/online-order-reject-dialog.tsx`
- `src/sections/pos/view/online-order-list-view.tsx`
- `src/locales/langs/{pt,en,es}/common.json`

## 4. Acceptance Criteria
- Arrastar card entre colunas válidas atualiza UI otimisticamente e persiste via Cloud Function (com rollback em caso de erro, ex.: `no_open_cash`).
- Ações 1-clique nos cards e no Drawer executam as mesmas transições.
- SLA timer no card reflete `createdAt` vs `estimatedMinutes` (`normal` / `warning` / `overdue`).
- Drawer exibe `OrderProgressStepper`, cliente, WhatsApp, copiar endereço, itens + observações, totais, `ReceiptDialog` e link da venda.
- `eslint --max-warnings=0`, `tsc --noEmit` e `vitest run` passando 100%.

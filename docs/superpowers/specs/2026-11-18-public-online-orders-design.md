# Design: App Público de Pedidos Online (Vitrine Anota AI) + Fila Admin + Caixa

**Date:** 2026-11-18  
**Status:** Draft for user review  
**Depends on:** PDV sales (`2026-11-16-pdv-offline-fifo-design.md`), cash sessions, SaaS plans/billing (`2026-11-17-saas-billing-asaas-design.md`)  
**Briefing legado (adaptado):** `docs/prompt_agente_app_publico.md` — o briefing assume PDV legado + middleware + `ID_Externo`; neste projeto o PDV **já é** Firestore no mesmo app. Não há sync externo de catálogo.

---

## 1. Goal

Entregar uma **vitrine pública mobile-first** (estilo Anota AI / iFood) no **mesmo Vite/React** do ERP, onde o cliente final:

1. Abre `/p/:slug`, vê produtos liberados (`showOnline`), monta carrinho e faz checkout (entrega/retirada).
2. Só consegue **finalizar** se a loja estiver **aberta** (toggle + agenda + **caixa aberto** + entitlement do plano).
3. Gera um **pedido online pendente**; o colaborador/admin recebe **notificação realtime** (toast + som) na fila admin.
4. Ao **aceitar**, o pedido vira **venda (`sales`)** com baixa de estoque e entra na **contabilidade do caixa aberto**.

Fonte de verdade de produtos/preços: `enterprises/{enterpriseId}/products`. Sem banco paralelo de cardápio.

---

## 2. Non-goals (MVP)

- Complementos / adicionais (observação por item apenas; complementos = fatia 2).
- Pix / cartão online (pagamento só na entrega/retirada).
- Push FCM no celular (só browser com aba admin aberta).
- App nativo ou Next.js separado; subdomínio custom (path `/p/:slug` basta).
- Middleware / `ID_Externo` / espelho de catálogo (irrelevante nesta stack).
- Crediário / fiado no app público.

---

## 3. Decisions (Locked)

| Tópico | Decisão |
|--------|---------|
| Fluxo pedido | `pending` → staff **aceita** → `sale` + estoque OUT + `cashSessionId`; ou **rejeita** (sem estoque) |
| Caixa | Sem caixa aberto → loja online **fechada** (checkout bloqueado; `placeOnlineOrder` rejeita) |
| Planos | Entitlement configurável (`online_orders`); `platformAdmin` define nos planos; **default Pro + Ultra** |
| Pagamento MVP | Só na entrega/retirada: dinheiro, Pix na entrega, cartão na entrega |
| Complementos | Fora do MVP; só `notes` no item / pedido |
| Hosting UI | Mesma app Vite; rota pública `/p/:slug` sem layout dashboard |
| Catálogo | Flag `showOnline` (default `false`); só `type === 'finished'` + `active` |
| Notificação | Fila admin `onSnapshot` + toast + som |
| Arquitetura pública | **Cloud Functions** como API pública (`getPublicStorefront`, `placeOnlineOrder`); cliente sem read direto de coleções tenant sensíveis |
| ID produto | `productId` Firestore = ID do PDV (substitui `ID_Externo` do briefing) |
| i18n | `pt` / `en` / `es` |

---

## 4. Architecture

```
Cliente /p/:slug
  → CF getPublicStorefront({ slug })
  → CF placeOnlineOrder({ slug, items, customer, ... })

Admin (AuthGuard + ClaimsGuard)
  → Firestore enterprises/{id}/onlineOrders (onSnapshot)
  → CF acceptOnlineOrder / rejectOnlineOrder
       → createSale + stock + cashSessionId + channel online
```

### 4.1 Cloud Functions (públicas / privilegiadas)

| Function | Auth | Behavior |
|----------|------|----------|
| `getPublicStorefront` | pública (HTTP ou callable sem login) | Resolve `publicStoreIndex/{slug}` → enterprise; retorna loja (nome, status aberto/fechado + motivo), taxa entrega, tempo estimado, produtos `showOnline` com **preço server-side** |
| `placeOnlineOrder` | pública | Revalida entitlement, toggle, agenda, **caixa aberto**, produtos/preços; cria `onlineOrders` `pending` |
| `acceptOnlineOrder` | tenant auth + perm | Recheca caixa aberto; cria `sale` (reusa lógica de `createSale`); set `saleId`, `cashSessionId`, status `accepted` |
| `rejectOnlineOrder` | tenant auth + perm | status `rejected`; sem estoque |
| `upsertOnlineStoreConfig` | tenant `admin`/`gestor` | Persiste `onlineStore` + mantém `publicStoreIndex` (slug único) |

### 4.2 Open-store predicate (única fonte)

Loja aberta **somente se** todos forem true:

1. Plano tem entitlement `online_orders` e subscription não bloqueia o módulo.
2. `onlineStore.enabled === true`.
3. Horário atual ∈ `openingHours` (timezone da loja = America/Sao_Paulo no MVP, ou campo futuro).
4. Existe **exatamente** uma `cashSessions` com `status === 'open'` (ou a sessão aberta vigente usada pelo PDV).

Motivos de fechamento expostos ao cliente: `plan`, `disabled`, `outside_hours`, `no_open_cash`.

---

## 5. Data Model (English keys)

### 5.1 `enterprises/{enterpriseId}.onlineStore`

```ts
export type OnlineStoreDayHours = {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  open: string;  // "HH:mm"
  close: string; // "HH:mm"
  closed?: boolean;
};

export type OnlinePayOnDeliveryMethod = 'cash' | 'pix' | 'debit_card' | 'credit_card';

export type OnlineStoreConfig = {
  enabled: boolean;
  slug: string; // unique, lowercase kebab
  openingHours: OnlineStoreDayHours[];
  estimatedMinutes: number;
  acceptDelivery: boolean;
  acceptPickup: boolean;
  defaultDeliveryFee: number; // may mirror enterprise.defaultDeliveryFee
  paymentMethodsOnDelivery: OnlinePayOnDeliveryMethod[];
  whatsapp?: string;
};
```

### 5.2 `publicStoreIndex/{slug}`

```ts
{ enterpriseId: string; updatedAt: string }
```

### 5.3 Product extension

```ts
// on enterprises/{enterpriseId}/products/{productId}
showOnline?: boolean; // default false
```

### 5.4 Plan entitlement

- Prefer structured field `entitlements: string[]` on `plans/{id}` (ex.: `['online_orders']`).
- Until migration: CF also treats feature bullet / code default Pro+Ultra as fallback seed.
- `platformAdmin` edits entitlements in Plans CRUD.

### 5.5 `enterprises/{enterpriseId}/onlineOrders/{orderId}`

```ts
export type OnlineOrderStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export type OnlineOrderItem = {
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  qty: number;
  unitPrice: number; // server-validated
  lineTotal: number;
  notes?: string;
};

export type OnlineOrder = {
  id: string;
  code: string;
  status: OnlineOrderStatus;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryType: 'pickup' | 'delivery';
  deliveryFee: number;
  paymentMethod: OnlinePayOnDeliveryMethod; // collected on delivery
  items: OnlineOrderItem[];
  subtotal: number;
  total: number;
  notes?: string;
  cashSessionId?: string; // set on accept
  saleId?: string;        // set on accept
  acceptedByUid?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 5.6 Sale extension

```ts
// on sales/{saleId}
channel?: 'pos' | 'online'; // default 'pos' for existing
onlineOrderId?: string;
cashSessionId?: string;
```

PDV balcão existente continua sem exigir `cashSessionId` no MVP desta fatia (só pedidos online amarram sessão no accept). Melhoria futura: amarrar vendas balcão também.

---

## 6. UI Surfaces

| Surface | Path | Who |
|---------|------|-----|
| Vitrine + checkout | `/p/:slug` | público |
| Pós-pedido | `/p/:slug/order/:orderId` (token/código) | público (read limitado via CF) |
| Config loja online | Account Company / aba Pedidos online | tenant admin/gestor |
| Switch vitrine | Product form | quem edita produtos |
| Fila pedidos | `/dashboard/pos/online-orders` | perm `pos` (ou `online_orders`) |
| Plan entitlements | `/dashboard/plans` | platformAdmin |

### 6.1 Public UX (linear)

1. Header: nome + aberto/fechado + tempo estimado.  
2. Categorias + cards (imagem, nome, descrição curta, preço).  
3. Detalhe: qty + observação → adicionar.  
4. Carrinho fixo (qty + subtotal).  
5. Checkout: entrega/retirada, dados, pagamento na entrega, confirmar.  
6. Confirmação com código; opcional link WhatsApp da loja.  
7. Fechado: vitrine pode listar; checkout desabilitado com motivo.

### 6.2 Admin UX

- Realtime list: novos `pending` → toast + som.  
- Ações: Aceitar / Recusar.  
- Aceito: link para venda / aparece em `/dashboard/pos/sales` com `channel: online`.  
- Config: slug (validação unicidade), agenda semanal, toggle, modalidades, métodos, copiar link + QR.

---

## 7. Security & Rules

- Cliente público **não** lê `enterprises/{id}/products|sales|cashSessions` direto.  
- `onlineOrders`: read/write autenticado sameEnterprise + perm; create público **somente** via CF (Admin SDK).  
- `publicStoreIndex`: read público ok **ou** só via CF (preferir só CF no MVP para não vazar enterpriseId se indesejado — se o response da CF já devolve o necessário, index pode ser privado Admin SDK).  
- `placeOnlineOrder`: rate limit por IP+slug; rejeita preço divergente; rejeita produto sem `showOnline`.  
- `acceptOnlineOrder`: falha se não houver caixa aberto (pedido permanece `pending`).

---

## 8. Error handling

| Caso | Comportamento |
|------|----------------|
| Sem plano / disabled / fora da agenda / sem caixa | `getPublicStorefront.isOpen = false` + `closedReason`; `placeOnlineOrder` erro |
| Preço mudou entre vitrine e place | CF rejeita; UI refresca cardápio |
| Produto desmarcado `showOnline` | CF rejeita item; UI remove do carrinho |
| Accept sem caixa | Erro admin; pedido fica `pending` |
| Reject | `rejected`; estoque intacto |

---

## 9. Testing

1. Unit: `isOnlineStoreOpen({ enabled, hours, now, hasOpenCash, hasEntitlement })`.  
2. Unit: map `OnlineOrder` → `CreateSaleInput` (totais, deliveryFee, payments placeholder na entrega).  
3. Unit: slug normalize + uniqueness conflict.  
4. Integration/smoke: place → snapshot fila → accept → `sale.channel === 'online'` + `cashSessionId` + stock OUT.  
5. Smoke fechado: fechar caixa → `isOpen false` → place falha.

---

## 10. Prerequisites before implementation

1. This spec approved + implementation plan (`writing-plans`).  
2. Seed / update plans Pro+Ultra with `online_orders` entitlement.  
3. Deploy CF + Firestore rules for `onlineOrders` / index.  
4. Tenant: configurar slug, agenda, toggle; marcar produtos `showOnline`.  
5. Abrir caixa antes do smoke E2E.

---

## 11. Acceptance criteria

- [ ] Catálogo público só de produtos `showOnline` + finished + active; preços vindos da CF (PDV).  
- [ ] Checkout bloqueado sem caixa aberto / fora da agenda / sem entitlement / disabled.  
- [ ] Pedido `pending` aparece em tempo real no admin com toast+som.  
- [ ] Accept cria `sale` com `channel: 'online'`, baixa estoque, grava `cashSessionId`.  
- [ ] Reject não mexe estoque.  
- [ ] Config de loja online no admin; slug único; link `/p/:slug`.  
- [ ] Entitlement editável em planos; Free sem online por default.  
- [ ] Layout público usável em 360px–428px.  
- [ ] i18n pt/en/es nas strings novas.  
- [ ] Sem complementos / Pix online / FCM neste MVP.

---

## 12. Out of scope / later slices

- Grupos de complemento (min/max).  
- Pix online (Asaas ou similar).  
- FCM / WhatsApp bot de status.  
- Subdomínio por loja.  
- Status pós-aceite tipo “saiu para entrega” / tracking fino (MVP: pending → accepted → sale completed).  
- Amarração obrigatória de vendas balcão ao `cashSessionId`.

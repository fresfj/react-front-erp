# Seller Home — operador / vendedor PDV

**Data:** 2026-11-19  
**Status:** aprovado em brainstorming (abordagem 1)  
**Stack:** Firebase Auth + Firestore + Minimals Vite (ERP)

## 1. Problema

O usuário **operador** (vendedor / PDV):

1. Cai em `/dashboard` e vê o overview administrativo (DRE / KPIs) **sem permissão** — tela “zerada” / irrelevante.
2. Não tem (e **não deve** ter) `products` no default — a “lista de produtos” para o dia a dia é o **catálogo dentro do PDV**.
3. Precisa de uma entrada com **pendências do dia**: vendas da loja hoje, pedidos online em andamento, atalhos para PDV / fila online / histórico.

## 2. Decisões fechadas

| Tema | Decisão |
|------|----------|
| Catálogo | Só no PDV (`/dashboard/pos/checkout`); **não** liberar `products` no default do operador |
| Landing | **Home do vendedor** em `/dashboard` quando operador tem `pos` |
| Escopo vendas | **Todas as vendas da loja** no dia (não só as do usuário logado) |
| Admin/gestor | Continuam no overview ERP atual (DRE / financeiro) |

## 3. Arquitetura

### 3.1 Roteamento `/dashboard`

Componente de index (ex.: `DashboardHomePage` / switch na page existente):

1. Se `platformAdmin` **ou** `role ∈ {admin, gestor}` **ou** permissão efetiva `dre` → overview atual (`OverviewAppView` / ERP geral).
2. Senão, se permissão efetiva `pos` → **Seller Home** (`overview-seller-view` ou equivalente).
3. Senão → fallback: primeira rota permitida (ex. `customers`) ou empty “sem módulos”.

O catch-all `path: '*'` do dashboard **deve** usar a mesma regra (hoje redireciona sempre para `paths.dashboard.root` / overview zerado para operador).

### 3.2 Navegação

Em `config-nav-dashboard.tsx`:

- Para operador com `pos` (sem overview DRE): item **Início / Meu dia** → `paths.dashboard.root` (Seller Home).
- Manter grupo PDV: checkout, histórico de vendas, pedidos online (já gated por `pos`).
- **Não** adicionar `products` a `DEFAULT_OPERATOR_PERMISSIONS`.

### 3.3 Seller Home — UI

Um `DashboardContent` + `CustomBreadcrumbs` + `Card`(s) no padrão Minimals / ERP:

**4 indicadores** (strip analítico, reutilizar `ErpTableAnalytic` se couber):

1. Vendas hoje — quantidade + valor (loja, dia local).
2. Pedidos online **pendentes** (`pending`).
3. Pedidos online **em andamento** (`accepted` / status equivalentes “em preparo”, conforme modelo atual).
4. Estado do **caixa** (aberto/fechado) se `cash_close`; senão omitir ou substituir por atalho Clientes se `customers`.

**Ações rápidas:** Abrir PDV | Pedidos online | Histórico de vendas.

**Listas curtas:**

- Pedidos online abertos (pending + em andamento), link para `/dashboard/pos/online-orders`.
- Últimas vendas da loja no dia, link para `/dashboard/pos/sales`.

Skeleton wave no load; empty states com CTA para PDV. Textos PT (`common.json` pt/en/es).

### 3.4 Dados

- **Vendas:** coleção `sales` do tenant; filtro dia corrente (timezone local da loja / browser); **todas** as sales da empresa (canais PDV + online já gravados como sale).
- **Pedidos online:** mesma fonte do monitor (`onlineOrders` + hook existente quando possível).
- **Caixa:** sessão aberta do dia (API cash já usada no ERP), somente leitura na home.
- Sem DRE, margens ou dados financeiros além de totais de venda do dia.

### 3.5 Permissões e segurança

- Seller Home: usuário autenticado + `claimsValid` + `pos`.
- Não inventar `role: 'admin'` no client.
- Firestore rules existentes; sem novos privilégios de cadastro de produto.
- Operador continua podendo vender via PDV (já lê produtos no checkout com rules atuais).

## 4. Fora de escopo (MVP)

- CRUD de produtos para operador.
- Ranking individual / comissão.
- Push/FCM de pedido online.
- Alterar defaults de `customers` / `cash_close` / `batches_read` (permanecem como hoje, a menos que o admin desmarque no time).

## 5. Critérios de aceite

1. Login operador com `pos` → `/dashboard` mostra Seller Home (não overview zerado).
2. Login admin/gestor → overview atual intacto.
3. Cards refletem vendas **da loja** no dia e contagens de pedidos online.
4. Atalhos abrem PDV, fila online e histórico.
5. Menu Produtos **não** aparece sem `products`.
6. Catálogo no checkout PDV continua listando produtos para venda.
7. i18n pt/en/es nas chaves novas; ESLint `--max-warnings=0` + `tsc --noEmit` nos arquivos tocados.

## 6. Arquivos prováveis (orientação)

- `src/pages/dashboard/...` (index / switch)
- `src/sections/overview/erp/view/overview-seller-view.tsx` (novo)
- `src/layouts/config-nav-dashboard.tsx`
- `src/routes/sections/dashboard.tsx` (index / `*`)
- `src/locales/langs/{pt,en,es}/common.json`
- Helpers de agregação do dia (sales) reutilizando APIs em `src/api/firestore/sales.ts` / online-orders

## 7. Próximo passo

Plano de implementação via skill **writing-plans** após revisão humana desta spec.

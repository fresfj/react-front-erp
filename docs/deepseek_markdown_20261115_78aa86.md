# 📄 PLANO MESTRE DE DESENVOLVIMENTO: ERP SAAS VAREJO, BENEFICIAMENTO & PDV OFFLINE

> **NOTA ARQUITETURAL OFICIAL (Atualizado em 16/11/2026):**
> A stack oficial de produção deste ERP é **100% Firebase + React (`@minimal-kit/vite-ts`)**:
> - **Autenticação & RBAC:** Firebase Authentication + Custom Claims (`enterpriseId`, `role: 'admin' | 'gestor' | 'operador'`, `platformAdmin: true`).
> - **Banco de Dados & Offline:** Cloud Firestore com persistência IndexedDB (`enableIndexedDbPersistence`) e isolamento multi-tenant em `enterprises/{enterpriseId}/...`.
> - **Backend / Regras de Negócio Sensíveis:** Firebase Cloud Functions v2 (`functions/index.js`) + Firestore Security Rules (`firestore.rules`).
> - **Arquivos:** Firebase Storage (`storage.rules`).
> - *Migração para NestJS/PostgreSQL é apenas Fase 5 opcional caso relatórios analíticos pesados exijam SQL dedicado no futuro.*

---

## 1. Visão Geral do Projeto
- **Objetivo:** Sistema ERP SaaS Multi-tenant para gestão de vendas (PDV offline), estoque, financeiro e **beneficiamento de produtos** (ex.: compra de açaí bruto, processamento e venda de açaí em litros classificados por qualidade com rastreabilidade de lote e rateio de custo).
- **Público-Alvo:** Lojas de varejo, açaiterias, açougues, lanchonetes e pequenas indústrias de alimentos.
- **Stack Tecnológico Oficial:**
  - **Frontend:** React 18 + Vite + TypeScript + MUI 5 + DataGrid 7 (`@minimal-kit/vite-ts` v6).
  - **Auth & Multi-Tenant:** Firebase Auth (`CONFIG.auth.method = 'firebase'`) + Custom Claims.
  - **Persistência Offline-First:** Cloud Firestore (`enterprises/{enterpriseId}/...`) + Firebase Storage.
  - **Serverless / Validações:** Cloud Functions v2 (`onCall`).

---

## 2. Arquitetura do Sistema (SaaS Multi-Tenant no Firebase)
- **Isolamento de Dados:** Todo documento de tenant fica sob o caminho canônico `enterprises/{enterpriseId}/{collection}/{docId}`. As regras do `firestore.rules` exigem `request.auth.token.enterpriseId == enterpriseId` (ou `platformAdmin == true`).
- **Autenticação e Claims (`src/auth/firebase-claims.ts`):**
  - `platformAdmin: true` → Super Admin do SaaS (`/dashboard/enterprises`).
  - `enterpriseId: string` + `role: 'admin' | 'gestor' | 'operador'` → Membros do tenant.
- **Estrutura de Pastas Frontend:**
  - `src/api/firestore/`: Camada de dados Firestore (`products.ts`, `suppliers.ts`, `platform.ts`, `storage.ts`, e futuros `batches.ts`, `processing-orders.ts`, `stock-movements.ts`, `sales.ts`, `cash-sessions.ts`).
  - `src/sections/`: Views (`DataGrid`) e Formulários (`CardHeader` colapsável + React Hook Form + Zod).
  - `src/pages/`: Páginas finas (`Helmet` + componente de `view`).
  - `src/auth/`: Contexto Firebase, `AuthGuard` e `ClaimsGuard`.

---

## 3. Módulos do Sistema e Regras de Negócio

### 3.1. Módulo de Acesso, Empresas e Funcionários (RBAC) — ✅ CONCLUÍDO
- **Perfis:**
  - **Platform Admin (`platformAdmin: true`):** Cria e gerencia empresas (`enterprises`), convida membros e define papéis via Cloud Functions (`createEnterprise`, `updateEnterprise`, `inviteMember`, `setMemberClaims`).
  - **Admin / Gestor (`admin` | `gestor`):** Acesso completo ao tenant (fornecedores, produtos, beneficiamento, estoque, relatórios, caixa).
  - **Operador (`operador`):** Acesso operacional (consulta fornecedores, opera produtos/PDV/caixa conforme regras).
- **Regras de Segurança:**
  - Operador possui limite de desconto configurável (ex.: máx. 5%). Acima disso, exige aprovação/validação via Cloud Function.

### 3.2. Módulo de Fornecedores e Produtos — ✅ CONCLUÍDO (Base) / 🔄 Evolução (Compras)
- **Cadastro de Fornecedor (`/dashboard/suppliers`):** Nome/Razão Social, CNPJ/CPF (`document`), Telefone, E-mail, Status (`active`).
- **Cadastro de Produto (`/dashboard/products`):** Nome, SKU, Tipo (`raw` = Insumo/Matéria-Prima | `finished` = Produto Acabado), Unidade (`unit`: kg, L, un), Preço de Custo (`costPrice`), Preço de Venda (`salePrice`), Variação (`variant` quando `finished`), Status (`active`).
- **Entrada de Mercadoria (Fase 2/3):** Registro de compra / NF de entrada gerando movimentação de estoque (`stockMovements`) e lote de entrada.

### 3.3. Módulo de Beneficiamento e Rastreabilidade (Core — PRÓXIMO PASSO: FASE 2)
*Fluxo de Produção:*
1. **Ordem de Beneficiamento (`processingOrders`):** O usuário inicia o processo selecionando o insumo (`type === 'raw'`, ex.: "Processar 100kg de Açaí Bruto") e a quantidade consumida.
2. **Consumo de Insumos e Custos Adicionais:** Deduz do estoque a matéria-prima e soma custos adicionais do processamento (água, energia, embalagens).
3. **Rendimento e Classificação:** O usuário informa os produtos acabados (`type === 'finished'`) gerados. Ex.: 80L divididos em:
   - Açaí Fino (Pop) — 30L (Fator de valorização: 1.0)
   - Açaí Médio — 40L (Fator de valorização: 1.2)
   - Açaí Grosso — 10L (Fator de valorização: 1.5)
4. **Custo Rateado (CMV):** O sistema calcula automaticamente o custo unitário ponderado pelo volume e fator de valorização de cada item gerado, atualizando o `costPrice` / lote.
5. **Rastreabilidade (`batches` / `lotCode`):** Cada lote gerado recebe um código único (ex.: `LOTE-ACAI-20261116-01`), vinculando o fornecedor/lote de origem aos lotes acabados vendidos no PDV.

### 3.4. Módulo de Vendas — PDV Offline (FASE 3)
- **Carrinho rápido e Leitura de Código de Barras / SKU:** Busca instantânea no cache Firestore local (IndexedDB).
- **Seleção de Lote (FIFO - First In, First Out):** Sugere automaticamente o lote ativo mais antigo disponível para produtos acabados rastreáveis.
- **Múltiplos Pagamentos:** Dinheiro (com cálculo de troco), PIX, Cartão de Crédito/Débito e Vale-Troca (`storeCredit`).
- **Funcionamento Offline:** Vendas gravadas localmente no Firestore cache com sincronização automática quando a conexão retorna.

### 3.5. Módulo Financeiro e Caixa (FASE 4)
- **Caixa (`cashSessions`):** Abertura (fundo de troco), Sangria, Suprimento e **Fechamento Cego** (operador informa valores físicos por meio de pagamento; sistema calcula divergência Sobra/Quebra após submissão).
- **DRE Simplificado:** Receita Bruta − CMV (calculado pelos lotes vendidos) = Lucro Bruto − Despesas = Lucro Líquido.
- **Emissão Fiscal NFC-e (FASE 5):** Integração via Cloud Functions com API terceirizada (Focus NFe / PlugNotas / NuvemFiscal).

---

## 4. Modelagem de Dados no Firestore (`enterprises/{enterpriseId}/...`)

| Coleção Firestore | Principais Campos (Inglês) | Status |
|---|---|---|
| `enterprises/{enterpriseId}` | `name`, `active`, `adminEmail`, `adminUid`, `createdAt`, `updatedAt` | ✅ Pronto |
| `enterprises/{enterpriseId}/members/{uid}` | `email`, `role`, `displayName`, `phone`, `photoURL`, `invitedAt`, `updatedAt` | ✅ Pronto |
| `enterprises/{enterpriseId}/suppliers/{id}` | `name`, `document`, `phone`, `email`, `active`, `createdAt`, `updatedAt` | ✅ Pronto |
| `enterprises/{enterpriseId}/products/{id}` | `name`, `sku`, `type` (`raw`\|`finished`), `unit`, `costPrice`, `salePrice`, `variant`, `active` | ✅ Pronto |
| `enterprises/{enterpriseId}/batches/{id}` | `lotCode`, `productId`, `supplierId`, `processingOrderId`, `initialQty`, `remainingQty`, `unitCost`, `active`, `createdAt`, `expiresAt` | 🔜 Fase 2 |
| `enterprises/{enterpriseId}/processingOrders/{id}` | `code`, `rawProductId`, `rawQtyUsed`, `rawUnitCost`, `extraCost`, `totalCost`, `outputs` (array com `productId`, `qty`, `weightFactor`, `allocatedUnitCost`, `batchId`, `lotCode`), `status`, `createdAt` | 🔜 Fase 2 |
| `enterprises/{enterpriseId}/stockMovements/{id}` | `productId`, `batchId`, `type` (`IN`\|`OUT`\|`ADJUST`\|`PROCESSING`), `qty`, `unitCost`, `reason`, `refId`, `createdAt`, `createdBy` | 🔜 Fase 2 |
| `enterprises/{enterpriseId}/sales/{id}` | `code`, `cashSessionId`, `sellerUid`, `customerId`, `items` (`productId`, `batchId`, `lotCode`, `qty`, `unitPrice`, `unitCost`), `subtotal`, `discount`, `total`, `payments` (`method`, `amount`), `status`, `createdAt` | 🔜 Fase 3 |
| `enterprises/{enterpriseId}/cashSessions/{id}` | `operatorUid`, `openedAt`, `closedAt`, `openingBalance`, `movements` (sangria/suprimento), `expectedTotals`, `countedTotals`, `difference`, `status` (`open`\|`closed`) | 🔜 Fase 4 |

---

## 5. Roadmap de Execução (Fatia por Fatia via Superpowers SDD)

1. **Curto Prazo (Estabilização Fase 1):**
   - Smoke test de criação/edição/inativação de Produtos e Fornecedores + Platform Admin.
   - Commit do lote atual (UI Minimals + Cloud Functions + Rules + Memória/Skills do Agente).
2. **Fatia 2 — Beneficiamento, Lotes e Movimentação de Estoque:**
   - Spec + Plan em `docs/superpowers/` → API Firestore (`batches`, `processingOrders`, `stockMovements`) → Cálculo puro de rateio ponderado (com testes Vitest) → Telas Minimals (`DataGrid` + `CardHeader` form).
3. **Fatia 3 — PDV Offline & Rastreabilidade FIFO:**
   - Spec + Plan em `docs/superpowers/` → Tela de PDV (carrinho rápido, busca por SKU/nome, seleção FIFO de lote, múltiplos pagamentos, baixa de estoque e lote offline-first).
4. **Fatia 4 — Caixa (Abertura, Sangria, Fechamento Cego) & Cloud Functions de Desconto:**
   - Spec + Plan em `docs/superpowers/` → Controle de sessão de caixa, blindagem de fechamento cego, exportação CSV e DRE básico.

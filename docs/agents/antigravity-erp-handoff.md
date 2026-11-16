# Agent Antigravity — ERP Minimals (handoff)

## Missão

Continuar o ERP Minimals (Vite + React + MUI + Firebase): manter CRUD Firestore de **produtos** / **fornecedores** / **empresas** estável e avançar o roadmap (**beneficiamento → PDV offline → caixa**) sem regredir o padrão visual Minimals.

Ler também a memória curta na raiz: [`AGENTS.md`](../../AGENTS.md).

## Skills e regras (usar estas)

### Repo
| Skill / regra | Path |
|---------------|------|
| **erp-crud-builder** | `.agents/skills/erp-crud-builder/SKILL.md` |
| **superpowers-sdd** | `.agents/skills/superpowers-sdd/SKILL.md` |
| **erp-firebase-forms** (alwaysApply) | `.cursor/rules/erp-firebase-forms.mdc` |
| UI CRUD | `docs/reference/erp-crud-ui.md` |
| Visão produto / PDV | `docs/deepseek_markdown_20261115_78aa86.md` (stack = **Firebase**, não Nest) |

### Superpowers (ordem típica)
`using-superpowers` → `brainstorming` → `writing-plans` → `subagent-driven-development` / `executing-plans` → `verification-before-completion` → `finishing-a-development-branch` (só se pedir commit/PR)

### Debug / escopo
`systematic-debugging`, `investigate-first`, `test-driven-development`, `surgical-patch`, `lean-build`, `safe-refactor`, `verify-and-stop`

### Caveman / Cavecrew
`caveman`, `cavecrew-investigator`, `cavecrew-reviewer`, `cavecrew-builder`

**Não usar** `docs/agents/erp-form-agent.md` para telas novas (FormTable legado).

## Stack e auth

- App: `@minimal-kit/vite-ts` 6.x, Vite, React 18, MUI 5, DataGrid 7
- Auth: **sempre Firebase** (`CONFIG.auth.method = 'firebase'`), entrada `/auth/firebase/sign-in`
- Claims: `enterpriseId` + `role` (`admin`\|`gestor`\|`operador`); `platformAdmin: true` (SaaS)
- `ClaimsGuard`: `platformAdmin` **ou** tenant válido (loading → SplashScreen, nunca `null`)
- Projeto: `checkout-shop-b5bb3`

## Processo CRUD ERP

```
Zod → src/api/firestore/* → DataGrid lista + CardHeader form
→ paths + dashboard.tsx + config-nav + i18n pt|en|es → toast (+ getFirebaseErrorMessage)
```

## Rotas

| Uso | Path |
|-----|------|
| ERP Dashboard Real | `/dashboard` |
| ERP produtos | `/dashboard/products` |
| ERP fornecedores | `/dashboard/suppliers` |
| ERP clientes e débitos | `/dashboard/customers` |
| ERP beneficiamento | `/dashboard/processing` |
| ERP lotes e estoque | `/dashboard/batches` (`/list`, `/create`, `/movements`) |
| ERP PDV e vendas | `/dashboard/pos` (`/`, `/sales`, `/sales/:id`) |
| ERP caixa e DRE | `/dashboard/cash` (`/`, `/dre`) |
| Platform empresas | `/dashboard/enterprises` |
| Account | `/dashboard/account` |

Menu: **sem** seções “Visão geral / Minimals / ERP legado”, **sem** headers de grupo. Header: **sem** notificações e contatos. Rotas demo/legado removidas do router (catch-all → `/dashboard`).

## Feito

- Fundação: Auth claims, offline Firestore, rules tenant + platformAdmin
- CRUD suppliers/products (DataGrid + CardHeader); Account avatar+Phone BR
- Platform admin UI + Cloud Functions (`createEnterprise`, `inviteMember`, `setMemberClaims`, …)
- Fixes lista branca (toolbar/actions/Card height); lista sem `where active` fixo
- **Fase 2 (Beneficiamento, Lotes FIFO & Movimentações de Estoque):**
  - Cálculo puro de rateio de custo ponderado (CMV) com testes unitários (`src/sections/processing/cost-allocation.ts`)
  - API Firestore atômica (`writeBatch`): `batches.ts`, `processing-orders.ts`, `stock-movements.ts`
  - Security Rules em `firestore.rules` para `batches`, `processingOrders` e `stockMovements`
  - Telas Minimals (`DataGrid` + `CardHeader` colapsável) para Ordens de Beneficiamento (`/dashboard/processing/*`), Lotes Rastreáveis (`/dashboard/batches/list`), Entrada de Lote (`/dashboard/batches/create`) e Movimentações (`/dashboard/batches/movements`)
- **Fase 3 (PDV Offline, Rastreabilidade FIFO & Histórico de Vendas):**
  - Domínio PDV (`src/sections/pos/pos-calculator.ts` + testes TDD) com seleção automática do lote mais antigo com saldo (`pickFifoBatch`), cálculo de troco, múltiplos meios de pagamento (`cash`, `pix`, `credit_card`, `debit_card`, `store_credit`), CMV/Lucro Bruto por venda e trava de desconto máximo por role (`operador` máx. 5%, `gestor`/`admin` 100%)
  - API Firestore atômica (`src/api/firestore/sales.ts`): cria venda, deduz `remainingQty` do lote vendido e registra movimentação `OUT` (e estorna no cancelamento)
  - Telas Minimals: Frente de Caixa (`/dashboard/pos`), Histórico de Vendas (`/dashboard/pos/sales`) e Detalhes/Cupom (`/dashboard/pos/sales/:id`)
- Scripts claims + SA gitignored
- Docs: este handoff, `AGENTS.md`, skills em `.agents/skills/`
- **Slice A (Team PermissionGuard):** `resolvePermissionAccess` + `PermissionGuard` nas rotas ERP; invite com `autoComplete` off/`new-password`; `inviteMember` sync `displayName` no Auth + default perms de operador
- **Slice B (BrasilAPI):** máscaras CEP/CPF/CNPJ + lookup em supplier/customer/enterprise/account; enterprise com CNPJ+endereço (CF); account com nascimento+endereço
- **Slice C (Financeiro):** DRE com filtro de datas; ranking vendedores (`/cash/ranking`); Contas a pagar/receber CRUD + rules deployadas

## Pendente (próximo)

1. Smoke: DRE/ranking por período; criar payable/receivable e marcar pago
2. **Firestore rules por `MemberPermissionKey`** (blindar plano de dados além do front)
3. Recorrência gerando parcelas; baixa automática no caixa
4. Imagem produto Storage (MVP ainda sem upload no form)
5. `firebase functions:artifacts:setpolicy` (cleanup Artifact Registry)

## Validar

1. Sign out/in  
2. Listas products/suppliers/enterprises sem tela branca  
3. Create → aparece na lista; deactivate → filtro Inativo  
4. `yarn tsc --noEmit`

## Anti-padrões

- Secrets / adminsdk no git  
- ERP apontando para `/dashboard/product`  
- `role: 'admin'` inventado no client  
- FormTable em tela nova  
- Auth0/Amplify/Supabase  

## Arquivos-chave

- API: `src/api/firestore/{products,suppliers,platform,storage,paths}.ts`
- Auth: `src/auth/firebase-claims.ts`, `claims-guard.tsx`, `auth-provider.tsx`
- Functions: `functions/index.js`
- Rules: `firestore.rules`, `storage.rules`

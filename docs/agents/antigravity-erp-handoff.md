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
| ERP caixa e DRE | `/dashboard/cash` (`/`, `/dre`, `/ledger`) |
| Platform empresas | `/dashboard/enterprises` |
| Account | `/dashboard/account` |

Menu: seções com `subheader` (Overview / Management / Financeiro / Administração), itens com `children` usam `path` root para o pai permanecer ativo no submenu (`useActiveLink` deep). Header: **sem** notificações e contatos. Rotas demo/legado removidas do router (catch-all → `/dashboard`).

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
- **Slice D (DatePicker + PeriodFilterBar):** `RHFDatePicker` persiste `YYYY-MM-DD`; `PeriodFilterBar` (chips + CustomDateRangePicker) em overview/DRE/ranking; forms ERP (`account`, `product`, `batch`, `payable`, `receivable`) usam `Field.DatePicker`
- **Finance lists:** Contas a receber enriquecidas com cliente (doc/fone/débito), picker de cliente no form; toolbars AP/AR no padrão DataGrid de products (status + vencidas)
- **WIP commitado:** customers pages/dialogs, beneficiamento/lotes, PDV/sales/cash-sessions, catalog product/supplier enrichments, team page
- **Slice E (parcelas + caixa + debt):** `splitInstallments` / due dates; AP/AR geram N docs; criar AR sobe `currentDebt`; marcar pago exige caixa aberto (`RECEIPT`/`PAYMENT`); cancelar AR aberto reverte debt
- **Slice F (Firestore rules × MemberPermissionKey):** `hasPerm` + defaults de operador; mapa 1:1 com PermissionGuard; ORs §8.1 (PDV FIFO / debt / settlement). Spec/plan em `docs/superpowers/{specs,plans}/2026-11-16-firestore-permission-rules*`
- **Slice G (Extrato de caixa):** `buildCashLedger` (OPENING + movimentos, saldo corrido); `/dashboard/cash/ledger` com PeriodFilterBar + cards + DataGrid; guard `dre`. Spec/plan `docs/superpowers/{specs,plans}/2026-11-16-cash-ledger-extract*`
- **Accrual DRE + Dashboard:** `buildAccrualDre` (receita PDV + CMV vendas + AP por `competenceDate`/`dreClass`); DRE sem sangria; Overview KPIs Receita/Despesas/Lucro + donut despesas; form AP com competência. Spec/plan `docs/superpowers/{specs,plans}/2026-11-16-accrual-dre-dashboard*`

## Billing-A (SaaS Free/Pro/Ultra + Asaas) — código no repo

- Spec/plan: `docs/superpowers/{specs,plans}/2026-11-17-saas-billing-asaas*`
- CF: Free seed em `createEnterprise`; `saveBillingSettings`, `upsertPlan`, `deactivatePlan`, `startSubscription`, `cancelSubscriptionAtPeriodEnd`, `getPublicBillingConfig`, `asaasWebhook`, `enforceSubscriptionGrace`
- Secrets Admin-only `platformSecrets/asaas`; flags em `platformSettings/billing`
- UI: `/dashboard/plans`, `/dashboard/billing-settings`, avatar Configuração/Assinatura, Account tab Assinatura
- **Deploy pendente:** `firebase deploy --only functions,firestore:rules` + configurar webhook Asaas → URL HTTP `asaasWebhook` com token
- **Deferred:** Entitlements-B (limites Free), Storefront-C (catálogo público)

## NFC-e Focus slice (2026-11-22) — merged main

- Spec: `docs/superpowers/specs/2026-11-22-nfce-tax-reform-umbrella-design.md`
- Plan: `docs/superpowers/plans/2026-11-22-nfce-emission.md`
- Skill reforma: `.agents/skills/tax-reform-pricing/`
- Code: domain gates, Focus `FiscalIssuer` + mock, CF `issueSaleNfce` / cancel / retry / secrets, rules deny `secrets/**`, account fiscal UI, product fiscal fields, enqueue POS/online/table
- **Default issuer:** Focus (`fiscalIssuerProvider` omit/`focus`)

### Ops / smoke Focus homolog (humano)

1. Conta Focus sandbox + token + CSC
2. `/dashboard/account` → Fiscal → Focus + homologação + enable
3. Produto com NCM / origem / CSOSN
4. Venda PDV → `authorized` ou `error` legível; offline → `pending` → retry
5. Deploy CF + rules; produção só após credenciamento SEFAZ

## NFC-e SEFAZ-direct SaaS (2026-11-23) — código pronto

- Branch/worktree: `feat/nfce-sefaz-direct` (`.worktrees/feat-nfce-sefaz-direct`)
- Spec: `docs/superpowers/specs/2026-11-23-nfce-sefaz-direct-vs-focus-decision.md`
- Plan: `docs/superpowers/plans/2026-11-23-nfce-sefaz-direct-saas.md` (T1–T8 done inline)
- Provider opt-in: `fiscalIssuerProvider: 'sefaz-direct'` (Focus permanece default)
- UF map: `functions/fiscal/uf-endpoints.js` — **piloto PA (SVRS) + PR (SEFAZ-PR)**; adicionar UF só com URL oficial
- Pipeline: `nfce-xml` → `a1-signer` (node-forge + xml-crypto) → `sefaz-client` → `createSefazDirectFiscalIssuer`
- Secrets: `enterprises/{id}/secrets/fiscal` — `a1PfxBase64`, `a1Password`, CSC; client deny
- Callable: `uploadEnterpriseFiscalCert` (admin/gestor/platformAdmin); public meta `a1Thumbprint` / `a1ExpiresAt` no doc enterprise
- UI: Account Fiscal → SEFAZ direto + upload `.pfx` + senha; i18n pt/en/es
- Hardening: `cert-audit.js` expiry skip no batch + redact logs; cancel sefaz-direct ainda `not_implemented` v1
- Verify (2026-11-23): `node --test` nfce-xml OK; vitest nfce-domain 9/9; eslint touch set 0; `tsc --noEmit`; `yarn check:amplify --skip-build` OK

### Ops SEFAZ-direct (humano / homolog)

1. Tenant A: Focus continua emitindo (sem mudar provider)
2. Tenant B (UF **PA**): Account → SEFAZ direto → upload A1 + CSC + série/ambiente homolog → venda → `authorized` ou rejeição SEFAZ clara
3. Tenant B UF fora do mapa / sem cert → `error` tipado (`uf_not_supported` / `missing_fiscal_config` / `cert_expired`); sem crash
4. Browser SDK não lê `secrets/fiscal` (rules deny)
5. Deploy: `firebase deploy --only functions,firestore:rules`; **não** setar `NFCE_ISSUER=mock` em prod
6. Rotação A1: re-upload via callable; validade pública em `a1ExpiresAt`; batch pula tenant expirado

## Pendente (próximo)

1. **Homolog humano** Focus + SEFAZ-direct (checklists acima) + merge `feat/nfce-sefaz-direct` após smoke
2. Expandir UF map além de PA (SVRS/autorizador oficial por UF)
3. Cancel NFC-e sefaz-direct (hoje throw; Focus cancel OK)
4. **Online orders:** deploy CF + rules; seed entitlements; smoke `/p/:slug`
5. Smoke Billing-A sandbox (Free → upgrade → webhook → grace/cancel)
6. Smoke E/F/G + accrual DRE (já listados em planos anteriores)
7. `firebase functions:artifacts:setpolicy` (cleanup Artifact Registry)
8. Revisar `package-lock.json` local (não commitado)

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
- Functions: `functions/index.js`, `functions/online-orders.js`
- Rules: `firestore.rules`, `storage.rules`
- Online orders: spec `docs/superpowers/specs/2026-11-18-public-online-orders-design.md`, plan `docs/superpowers/plans/2026-11-18-public-online-orders.md`

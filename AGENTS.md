# ERP Minimals — Memória e Regras do Projeto (Antigravity / Agents)

## 1. Visão e Arquitetura Oficial (Stack Firebase)
- **Produto:** ERP SaaS Multi-tenant para Varejo, Beneficiamento (ex.: açaí bruto → lotes classificados com rateio de custo) e PDV Offline.
- **Frontend:** `@minimal-kit/vite-ts` 6.x, Vite, React 18, TypeScript, MUI 5, `@mui/x-data-grid` 7, React Hook Form + Zod.
- **Backend / Persistência (Oficial):**
  - **Firebase Auth:** `CONFIG.auth.method = 'firebase'` (entrada `/auth/firebase/sign-in`). Nunca reativar Auth0, Amplify, Supabase ou JWT mock.
  - **Cloud Firestore (Offline-first):** Persistência IndexedDB ativa (`src/lib/firebase.ts`). Dados isolados por tenant em `enterprises/{enterpriseId}/...` (campos e coleções sempre em **inglês**).
  - **Cloud Functions v2 (`functions/index.js`):** Operações privilegiadas (`createEnterprise`, `updateEnterprise`, `inviteMember`, `setMemberClaims`, e futuras validações de desconto/sangria/fechamento de caixa).
  - **Firebase Storage (`storage.rules`):** Avatares (`enterprises/{enterpriseId}/members/{uid}/avatar.*`) e anexos/imagens de produtos.
  - *Nota:* Qualquer menção a NestJS/PostgreSQL em documentos antigos é apenas referência histórica/opcional de Fase 5; toda implementação atual e do PDV/Beneficiamento é **100% Firebase (Auth + Firestore + Functions + Storage)**.

## 2. Claims, RBAC e Multi-Tenant
- **Custom Claims no ID Token (`src/auth/firebase-claims.ts`):**
  - **Tenant:** `enterpriseId: string` + `role: 'admin' | 'gestor' | 'operador'`
  - **Plataforma (SaaS):** `platformAdmin: true` (acesso cross-tenant a `/dashboard/enterprises`)
- **Guards:** `AuthGuard` + `ClaimsGuard` (`src/auth/guard/claims-guard.tsx`) protegem `/dashboard/*`.
- **Segurança:**
  - Nunca inventar `role: 'admin'` no client quando a claim estiver ausente.
  - `firestore.rules` exige autenticado + `sameEnterprise` (ou `isPlatformAdmin()`); coleções de domínio usam `hasPerm(enterpriseId, MemberPermissionKey)` (admin/gestor liberados; operador via `members/{uid}.permissions` + defaults).
  - Para criar/alterar regras em `firestore.rules`, seguir spec Slice F e manter ORs §8.1 (PDV/debt/settlement).
  - Credenciais apenas em `.env` (`VITE_FIREBASE_*`). Jamais commitar chaves de Service Account (`*-firebase-adminsdk-*.json`).

## 3. Padrão Visual e Processo CRUD (Minimals v6)
Toda nova tela ou módulo do ERP deve seguir estritamente este fluxo:
1. **Schema Zod** no topo do form/section.
2. **Camada de Dados:** Funções tipadas em `src/api/firestore/<modulo>.ts` usando `enterpriseCollection(enterpriseId, '<collection>')` e `omitUndefined`.
3. **Listagem (`*-list-view.tsx`):**
   - `DashboardContent` + `CustomBreadcrumbs` + `Card` (`height: 720`) + `DataGrid`.
   - Toolbar com filtros de domínio + `GridToolbarQuickFilter`, `GridToolbarColumnsButton`, `GridToolbarFilterButton`, `GridToolbarExport`.
4. **Formulário (`*-form.tsx`):**
   - `Card` + `CardHeader` colapsável (`Iconify` up/down) + `Collapse` + `Divider` + `Stack` com `Form` e `Field.*` (`src/components/hook-form`).
   - Não usar `FormTable` / `useFormTable` (restrito a telas legadas em `src/pages/sistema|inventario|auditoria`).
5. **Rotas e Navegação:**
   - Registrar em `src/routes/paths.ts`, `src/routes/sections/dashboard.tsx` e `src/layouts/config-nav-dashboard.tsx`.
   - **Não misturar:** `/dashboard/products` é o ERP Firestore; `/dashboard/product` é apenas a demo shop do Minimals.
6. **Internacionalização (i18n) e Feedback:**
   - Idioma padrão: `pt` (Português Brasil), com suporte obrigatório em `src/locales/langs/{pt,en,es}/common.json`.
   - Feedback com `toast` (`src/components/snackbar`) e erros traduzidos via `getFirebaseErrorMessage` (`src/utils/firebase-error.ts`).

## 4. Roadmap Oficial (Superpowers / SDD)
1. **Fase 1 — Fundação & Cadastros Base (Concluído):** Auth Firebase + Claims + Offline + Fornecedores (`/dashboard/suppliers`), Produtos Insumo/Acabado (`/dashboard/products`), Account (`/dashboard/account`) e Platform Admin (`/dashboard/enterprises`).
2. **Fase 2 — Beneficiamento & Rastreabilidade de Lotes (Próximo):**
   - Coleções: `enterprises/{enterpriseId}/processingOrders` (ou `batches`) e `enterprises/{enterpriseId}/stockMovements`.
   - Consumo de matéria-prima (`type === 'raw'`), geração de produtos acabados (`type === 'finished'`), cálculo de **Custo Unitário Rateado (CMV)** com fator de valorização e geração de `batchId` / `lotCode` rastreável.
3. **Fase 3 — PDV Offline & Vendas:**
   - Carrinho rápido, leitura de código de barras/SKU, seleção de lote (FIFO), múltiplos pagamentos (Dinheiro, PIX, Cartão, Vale-Troca), baixa automática de estoque offline-first.
4. **Fase 4 — Financeiro / Caixa & Cloud Functions de Blindagem:**
   - Abertura de caixa, sangria, suprimento, **Fechamento Cego** (divergência calculada), validação de limite de desconto no backend (Cloud Functions) e DRE.
5. **Fase 5 — Integração Fiscal (NFC-e):** Integração via Cloud Functions com API externa (Focus NFe / PlugNotas / NuvemFiscal).

## 5. Skills e regras em uso (obrigatório ler)

### No repositório
| Skill / regra | Path | Quando usar |
|---------------|------|-------------|
| **erp-crud-builder** | `.agents/skills/erp-crud-builder/SKILL.md` | Qualquer CRUD / módulo ERP (lista DataGrid, form CardHeader, Firestore, i18n) |
| **superpowers-sdd** | `.agents/skills/superpowers-sdd/SKILL.md` | Spec → plan → fatias SDD; ledger `.superpowers/sdd/` |
| **erp-firebase-forms** (Cursor rule) | `.cursor/rules/erp-firebase-forms.mdc` | Sempre: auth Firebase, i18n pt/en/es, padrão CRUD |
| **Handoff Antigravity** | `docs/agents/antigravity-erp-handoff.md` | Continuidade de sessão / status feito-pendente |
| **Visão PDV / beneficiamento** | `docs/deepseek_markdown_20261115_78aa86.md` | Roadmap produto (stack oficial = Firebase, não Nest) |
| **UI CRUD** | `docs/reference/erp-crud-ui.md` | Checklist visual Minimals |

### Fluxo Superpowers (sessão / Cursor)
Usar nesta ordem quando a fatia for nova ou ambígua:
1. `using-superpowers` — checklist inicial
2. `brainstorming` — decisões antes de código criativo
3. `writing-plans` — plano em tasks
4. `subagent-driven-development` ou `executing-plans` — execução
5. `verification-before-completion` — tsc / testes / smoke antes de “done”
6. `finishing-a-development-branch` — commit/PR quando pedido
7. `systematic-debugging` / `investigate-first` — bugs (ex.: tela branca, permission-denied)
8. `test-driven-development` — quando houver regra de domínio testável (rateio CMV, FIFO, caixa)

### Caveman / Cavecrew (quando caber)
- `caveman` — respostas técnicas curtas
- `cavecrew-investigator` — localizar código (read-only)
- `cavecrew-reviewer` — review de diff
- `cavecrew-builder` — patch 1–2 arquivos
- `surgical-patch` / `lean-build` / `safe-refactor` / `verify-and-stop` — escopo cirúrgico

### Anti-padrões de skill
- Não usar o agent legado `docs/agents/erp-form-agent.md` (FormTable) para telas novas.
- Não inventar Nest/Postgres no PDV enquanto a stack oficial for Firebase.

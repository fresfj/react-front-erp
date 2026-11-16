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
| ERP produtos | `/dashboard/products` |
| ERP fornecedores | `/dashboard/suppliers` |
| Platform empresas | `/dashboard/enterprises` |
| Account | `/dashboard/account` |
| Demo shop | `/dashboard/product` (não ERP) |

## Feito

- Fundação: Auth claims, offline Firestore, rules tenant + platformAdmin
- CRUD suppliers/products (DataGrid + CardHeader); Account avatar+Phone BR
- Platform admin UI + Cloud Functions (`createEnterprise`, `inviteMember`, `setMemberClaims`, …)
- Fixes lista branca (toolbar/actions/Card height); lista sem `where active` fixo
- Scripts claims + SA gitignored
- Docs: este handoff, `AGENTS.md`, skills em `.agents/skills/`

## Pendente (próximo)

1. Smoke manual create produto/fornecedor após hard refresh + sign out/in
2. **Fase 2 roadmap:** beneficiamento + lotes + stockMovements
3. **Fase 3:** PDV offline (carrinho, FIFO lote, pagamentos)
4. **Fase 4–5:** caixa cego, DRE, NFC-e via Functions
5. Imagem produto Storage (MVP ainda sem upload no form)
6. `firebase functions:artifacts:setpolicy` (cleanup Artifact Registry)

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

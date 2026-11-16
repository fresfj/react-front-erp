---
name: superpowers-sdd
description: >-
  Fluxo Spec-Driven Development (SDD / Superpowers) usado no projeto ERP Minimals
  (specs em docs/superpowers/specs, planos em docs/superpowers/plans e ledger em .superpowers/sdd).
  Use quando o usuário pedir para desenhar uma spec, criar um plano de implementação em fatias
  ou executar tarefas seguindo a metodologia Superpowers.
---

# Superpowers — Spec-Driven Development (SDD) no ERP Minimals

Este projeto utiliza o fluxo **Superpowers (SDD)** para planejar, especificar e executar cada fatia de produto com rastreabilidade total.

## 1. Estrutura de Diretórios Superpowers no Repositório
- **`docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`**: Especificações aprovadas de arquitetura, modelo de dados Firestore, RBAC, UI/UX, regras de segurança e critérios de aceite.
- **`docs/superpowers/plans/YYYY-MM-DD-<slug>.md`**: Planos de implementação passo a passo (Tasks T1..Tn) derivados da spec, com arquivos exatos, testes e comandos de verificação.
- **`.superpowers/sdd/progress.md`**: Ledger de execução das tasks, preflight scan de superfícies compartilhadas, revisões e pendências operacionais.

## 2. Como Conduzir uma Nova Fatia (Slice)
1. **Spec (`docs/superpowers/specs/`):**
   - Definir Goal, Decisions (locked), Architecture (paths `enterprises/{enterpriseId}/...`), Data Model (TypeScript interfaces), RBAC por role (`admin`, `gestor`, `operador`, `platformAdmin`), Security Rules, i18n (`pt`, `en`, `es`) e Acceptance Criteria.
2. **Plan (`docs/superpowers/plans/`):**
   - Quebrar a spec em tarefas atômicas e ordenadas por dependência:
     - T1: Tipos, helpers e testes unitários de domínio/cálculo.
     - T2: Camada Firestore (`src/api/firestore/*`) e regras (`firestore.rules` / Cloud Functions).
     - T3: Rotas, paths e chaves i18n (`pt`, `en`, `es`).
     - T4+: Views (`DataGrid`), Forms (`CardHeader` colapsável) e modais.
     - Tn: Verificação final (`tsc --noEmit`, `vitest run`, `vite build`).
3. **Execução e Registro (`.superpowers/sdd/progress.md`):**
   - Ao concluir cada task, validar tipagem e testes e atualizar o status no ledger.

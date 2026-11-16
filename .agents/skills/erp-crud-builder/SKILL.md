---
name: erp-crud-builder
description: >-
  Padroniza a criação e evolução de módulos CRUD, Beneficiamento, Estoque, PDV e Caixa
  no ERP Minimals com Firebase Auth, Firestore multi-tenant, DataGrid, React Hook Form + Zod e i18n (pt/en/es).
  Use sempre que criar ou alterar telas, coleções Firestore ou fluxos do ERP.
---

# ERP CRUD & Module Builder (Minimals + Firebase)

Use este runbook para construir ou evoluir qualquer módulo do ERP Minimals garantindo 100% de aderência visual e arquitetural.

## 1. Regras de Ouro da Arquitetura
- **Multi-tenant Firestore:** Todo documento de domínio vive em `enterprises/{enterpriseId}/<collection>/{docId}` usando `enterpriseCollection(enterpriseId, '<collection>')` de `src/api/firestore/paths.ts`.
- **Nomenclatura:** Nomes de coleções e campos no Firestore sempre em **inglês** (`products`, `suppliers`, `batches`, `processingOrders`, `stockMovements`, `sales`, `cashSessions`).
- **Sanitização:** Sempre envolver payloads de `addDoc`/`updateDoc` com `omitUndefined` (`src/api/firestore/omit-undefined.ts`) — o Firestore rejeita campos `undefined`.
- **Roles (`user.role`):**
  - `admin` | `gestor`: leitura e escrita completa no tenant.
  - `operador`: leitura em catálogos restritos (ex.: `suppliers`), leitura/escrita operacional (ex.: `products`, `sales`, `cashSessions`).
  - `platformAdmin`: claim booleana para gestão de empresas em `/dashboard/enterprises`.

## 2. Passo a Passo para Novo Módulo / Tela

### Passo 1 — Camada Firestore (`src/api/firestore/<module>.ts`)
1. Definir os tipos TypeScript em inglês (`id`, `active`, `createdAt`, `updatedAt`, etc.).
2. Implementar `list*`, `get*`, `create*`, `update*` e `deactivate*` (soft-delete com `active: false`).
3. Não usar `where('active', '==', true)` fixo na listagem principal se a UI tiver filtro de status (Ativo / Inativo / Todos) — filtrar em memória no `useMemo` da view ou parametrizar.

### Passo 2 — Formulário (`src/sections/<module>/<entity>-form.tsx`)
1. Declarar o schema `zod` no topo do arquivo.
2. Usar `useForm` com `zodResolver` e `defaultValues` via `useMemo`.
3. Estruturar visualmente com `Card` + `CardHeader` (com botão de colapso `eva:arrow-ios-upward-fill` / `downward-fill`) + `Collapse` + `Divider` + `Stack spacing={3} sx={{ p: 3 }}`.
4. Usar componentes `Form` e `Field.*` de `src/components/hook-form`.
5. Exibir erros com `toast.error(getFirebaseErrorMessage(error, t('<module>.saveError')))`.

### Passo 3 — Listagem (`src/sections/<module>/view/<entity>-list-view.tsx`)
1. Envolver em `DashboardContent` + `CustomBreadcrumbs` (com botão CTA `Novo ...`).
2. Tratar ausência de `enterpriseId` exibindo `<EmptyContent filled title={t('<module>.errorMissingEnterprise')} />`.
3. Renderizar `<Card sx={{ height: 720 }}>` contendo `<DataGrid>` com `CustomToolbar` (`GridToolbarQuickFilter`, `GridToolbarColumnsButton`, `GridToolbarFilterButton`, `GridToolbarExport`) e `ConfirmDialog` para inativação.

### Passo 4 — Páginas Finas, Rotas e i18n
1. Criar páginas finas (`Helmet` + View) em `src/pages/<module>/`.
2. Adicionar paths em `src/routes/paths.ts`, rotas lazy em `src/routes/sections/dashboard.tsx` e item de menu em `src/layouts/config-nav-dashboard.tsx`.
3. Adicionar todas as traduções em `src/locales/langs/pt/common.json`, `en/common.json` e `es/common.json`.

## 3. Validação Obrigatória
Antes de concluir qualquer entrega:
1. Rodar `./node_modules/.bin/tsc --noEmit` (zero erros de TypeScript).
2. Rodar `./node_modules/.bin/vitest run` (testes unitários passando).
3. Se alterar `firestore.rules`, delegar ao subagente `firestore-rules-author`.

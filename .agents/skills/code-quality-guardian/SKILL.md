---
name: code-quality-guardian
description: >-
  Agente e guia de Boas Práticas, Qualidade de Código, ESLint (perfectionist/sort-imports,
  consistent-type-imports, unused-imports) e TypeScript Zero-Warnings para o ERP Minimals.
  Use sempre ao criar, editar ou revisar qualquer arquivo .ts/.tsx no projeto.
---

# Code Quality Guardian — Regra de Ouro (Zero Warnings / Zero Errors)

O projeto ERP Minimals executa `vite-plugin-checker` em tempo real durante o `vite dev`, exibindo imediatamente no terminal e no navegador qualquer **Warning** ou **Error** do ESLint e do TypeScript.

Por isso, **nenhuma tarefa está concluída se houver sequer 1 warning do ESLint nos arquivos criados ou alterados**.

---

## 1. Regras Críticas do ESLint (`.eslintrc.cjs`)

### 1.1. Ordenação de Imports (`perfectionist/sort-imports`)
Todos os `import` devem ser separados por **uma linha em branco entre grupos** e, **dentro de cada grupo, ordenados pelo comprimento total da linha em ordem crescente (`order: 'asc', type: 'line-length'`)** — da linha mais curta para a mais longa:

Ordem obrigatória dos grupos de import:
1. `style` (arquivos `.css` / `.scss`)
2. `type` (`import type { ... } from '...'` externos/internos, exceto relativos)
3. `builtin` / `external` (ex.: `'react'`, `'zod'`, `'firebase/firestore'`, `'react-hook-form'`)
4. `custom-mui` (`@mui/**`, incluindo `@mui/material/*` e `@mui/x-data-grid`)
5. `custom-routes` (`src/routes/**`)
6. `custom-hooks` (`src/hooks/**`)
7. `custom-utils` (`src/utils/**`)
8. `internal` (`src/**` gerais: `src/locales`, `src/theme/**`, `src/layouts/**`, `src/api/**`, `src/config-global`)
9. `custom-components` (`src/components/**`)
10. `custom-sections` (`src/sections/**`)
11. `custom-auth` (`src/auth/**`)
12. `custom-types` (`src/types/**`)
13. `parent` / `sibling` / `index` (`../**`, `./**`)
14. `parent-type` / `sibling-type` / `index-type` (`import type { ... } from './...'` ou `'../...'`)

### 1.2. Ordenação de Named Imports e Exports (`perfectionist/sort-named-imports` & `sort-named-exports`)
Dentro de chaves `{ a, b, c }`, os identificadores também devem estar em **ordem crescente de tamanho de palavra** (`line-length`):
```tsx
// CORRETO (do menor para o maior)
import { useMemo, useState, useEffect, useCallback } from 'react';
```

### 1.3. Imports de Tipo e Imports Não Utilizados
- **`@typescript-eslint/consistent-type-imports`:** Sempre usar `import type { ... }` quando importar apenas tipos/interfaces.
- **`unused-imports/no-unused-imports`:** Nunca deixar imports ou variáveis não utilizadas.

---

## 2. Checklist Obrigatório Pós-Edição (Executar SEMPRE antes de encerrar)

Sempre que criar ou modificar qualquer arquivo `.ts` ou `.tsx`, execute obrigatoriamente:

```bash
# 1. Corrige automaticamente a ordenação de imports/exports (perfectionist) e formatação:
./node_modules/.bin/eslint --fix <arquivos_alterados>

# 2. Verifica que há ZERO warnings e ZERO erros nos arquivos alterados:
./node_modules/.bin/eslint --max-warnings=0 <arquivos_alterados>

# 3. Verifica a tipagem global do projeto:
./node_modules/.bin/tsc --noEmit
```

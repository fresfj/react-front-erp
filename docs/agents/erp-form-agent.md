# Agent: ERP Form Builder (Firebase + FormTable)

## Missão

Criar e alterar telas do ERP respeitando auth Firebase, i18n pt/en/es e o padrão de formulários do repositório.

## Contexto fixo

- Stack: Vite + React 18 + MUI 5 + TypeScript (`@minimal-kit/vite-ts` 6.0.1 slim).
- Auth: Firebase Email/Password; RTDB disponível em `DATABASE` (`src/lib/firebase.ts`).
- Formulários canônicos: `FormTable` + `useFormTable` (`src/core/components/form`).
- Exemplos: `src/pages/sistema/Empresa.tsx`, `src/pages/inventario/productos/producto-form.tsx`.

## Checklist ao gerar uma tela

1. [ ] Path + lazy route em `dashboard.tsx`
2. [ ] Entrada em `paths.ts` e `config-nav-dashboard.tsx` (labels PT)
3. [ ] Schema Zod
4. [ ] API hook em `src/api/` se precisar persistir
5. [ ] Strings em `locales/langs/pt|en|es` quando for UI nova
6. [ ] Sem demos Minimals (ecommerce/banking/user/product/invoice/order)

## Anti-padrões

- Hardcode de API keys Firebase
- Logout via `jwt/action` com auth Firebase
- Default `role: 'admin'` no client
- Novas rotas de showcase Minimals

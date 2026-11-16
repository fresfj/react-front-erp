# Telas demo Minimals (referência)

Código completo restaurado em `src/pages` + `src/sections` (paridade com `minimals-v6-2/src/pages`, adaptado ao kit 6.0.1 + ERP).

## Produto ativo (roteado)

| Área | Path |
|------|------|
| Auth | `/auth/firebase/sign-in` (`CONFIG.auth.method = 'firebase'`) |
| ERP | `src/pages/sistema`, `inventario`, `auditoria` |
| Dashboard app | `/dashboard` |

## Referência no disco (não no menu ERP)

Pastas sob `src/pages/dashboard/*` (ecommerce, banking, user, product, invoice, order, …), `src/pages/components/*`, auth-demo, amplify/auth0/supabase, etc.

Para ver layout no browser, importe a page sob demanda ou consulte o projeto irmão:

`/Users/franciscofreitasjr/Project/Development/reactjs/minimals-v6-2`

## Diferenças 6.2 → este repo

- Imports: `src/config-global` (não `global-config`)
- Auth views: `src/sections/auth/*` (não `src/auth/view/*`)
- Account: tabs em `user/account.tsx` + páginas soltas em `user/account/*`
- Drawer / Layout / Date-pickers: páginas alinhadas ao padrão 6.0.1

# Estrutura limpa do ERP (ponto de partida)

## Entrada do sistema

| URL | Destino |
|-----|---------|
| `http://localhost:8080/` | → `/auth/firebase/sign-in` |
| Auth | Firebase Email/Password (`CONFIG.auth.method = 'firebase'`) |
| Idioma padrão | Português Brasil (`pt`); também `en`, `es` |

## Árvore útil

```
src/
  auth/context/firebase/     # login / logout / sessão
  pages/
    sistema/                 # Empresa, Filiais, Usuários
    inventario/productos/    # Produtos
    auditoria/               # Eventos
  api/                       # hooks HTTP / dados
  core/components/
    form/                    # FormTable + useFormTable (padrão)
    dataTable/
    upload/
  locales/langs/{pt,en,es}/
  routes/sections/           # auth + dashboard (só ERP)
  layouts/config-nav-dashboard.tsx

docs/
  agents/erp-form-agent.md           # agente de formulários
  reference/minimals-demo-screens.md # demos fora do router
.cursor/rules/erp-firebase-forms.mdc # regras sempre ativas
```

## Fora do produto (só referência)

Não roteados: `dashboard/ecommerce`, `banking`, `user/*`, `product/*`, `invoice`, `order`.  
Ver `docs/reference/minimals-demo-screens.md`.

## Criar tela nova

Siga `docs/agents/erp-form-agent.md` e copie `src/pages/sistema/Empresa.tsx`.

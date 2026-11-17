# CRUD ERP — padrão visual Minimals

Novos CRUDs Firestore (produtos, fornecedores, empresas, etc.) seguem o kit Minimals.

## Lista

- `<ErpDataGrid<Entity>>` (`src/components/erp-data-grid`) dentro de `Card` (`height: 720` ou flex)
- Toolbar integrada (`ErpGridToolbar`):
  - Filtros multi-select padrão Minimals (`selectFilters`: `FormControl` com `InputLabel` + `Select multiple` + `Checkbox`)
  - Busca rápida em largura total (`GridToolbarQuickFilter`)
  - Ações de Colunas, Filtros (ancorado sem quebrar layout) e Exportar
  - Barra de chips ativos com botão de limpar
- Ações por linha: coluna `type: 'actions'` com `GridActionsCellItem showInMenu` (menu suspenso de 3 pontinhos `eva:more-vertical-fill`)
- CTA “Novo …” → rota `create` em `paths.dashboard.*`
- Dados via `src/api/firestore/*` (não demos shop)

## Formulário

- `Card` + `CardHeader` (title + subheader) + botão collapse (`Iconify` up/down)
- `Collapse` + `Divider` + `Stack` de campos
- Sem layout side-label antigo (`Grid` 4/8 com tipografia lateral)
- `FormTable` / `useFormTable` só para telas **legado**

## Account

- 2 colunas: avatar (`Field.UploadAvatar` → Storage) + dados
- Telefone: `Field.Phone` com `country="BR"` (+55)

## Rotas

- ERP: `/dashboard/products`, `/dashboard/suppliers`, `/dashboard/enterprises`
- Demo Minimals shop: `/dashboard/product` (não misturar dados)

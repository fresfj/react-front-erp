# CRUD ERP — padrão visual Minimals

Novos CRUDs Firestore (produtos, fornecedores, empresas, etc.) seguem o kit Minimals.

## Lista

- `DataGrid` (`@mui/x-data-grid`) dentro de `Card`
- Toolbar: filtros de domínio + `GridToolbarQuickFilter` / Columns / Filter / Export
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

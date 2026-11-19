# CRUD ERP — padrão visual Minimals (Referência Oficial: `/dashboard/pos/sales`)

Todas as listagens do ERP (`/dashboard/pos/sales`, `/dashboard/customers/list`, `/dashboard/products/list`, `/dashboard/suppliers/list`, `/dashboard/processing/list`, `/dashboard/batches/list`, `/dashboard/batches/movements`, `/dashboard/cash/ledger`, `/dashboard/cash/ranking`, `/dashboard/cash/payables`, `/dashboard/cash/receivables`, `/dashboard/enterprises/list`) seguem estritamente a estrutura de `/dashboard/pos/sales` (`src/sections/pos/view/sale-list-view.tsx`).

## Lista (Card Único Integrado)

Dentro de um único `<Card>`:
1. **Faixa Analítica Rápida (Exatamente 4 Indicadores):**
   - Envolvida por `<Scrollbar sx={{ minHeight: 108 }}>` + `<Stack direction="row" divider={<Divider orientation="vertical" flexItem sx={{ borderStyle: 'dashed' }} />} sx={{ py: 2.5 }}>` + `<Divider />`.
   - Usa `<ErpTableAnalytic>` (`src/components/erp-table`) com largura uniforme (`width: 1, minWidth: 200`).
2. **Abas de Status (`<Tabs>`):**
   - Contador `<Label>` alternando dinamicamente entre `filled` (aba selecionada ou `'all'`) e `soft`.
3. **Toolbar Padronizada (`<ErpTableToolbar>` de `src/components/erp-table`):**
   - **Esquerda:** Filtros multi-select com `Checkbox` + campo de busca rápida.
   - **Direita:** Botões traduzidos (`i18n` `pt/en/es`) **Colunas** (ocultar/exibir colunas + restaurar padrão), **Filtros** (painel rápido com badge de filtro ativo) e **Exportar** (Exportar CSV e Imprimir).
   - **Abaixo:** Barra de chips ativos (`FiltersResult`) com botão de limpar filtros.
4. **Tabela (`@mui/material/Table` + `useTable`):**
   - `<TableSelectedAction>` + `<TableHeadCustom>` com checkbox "Selecionar todos".
   - Linhas com `<Checkbox>` individual e suporte a `visibleColumns`.
   - Modal `<ConfirmDialog>` obrigatório para confirmar ações em lote ou exclusão/cancelamento.
   - `<TablePaginationCustom>` no rodapé com controle `Dense`.

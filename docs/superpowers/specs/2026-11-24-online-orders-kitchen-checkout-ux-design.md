# Design: Aceite → Cozinha + KDS som + Checkout endereço

**Date:** 2026-11-24  
**Status:** Approved for planning  
**Stack:** Firebase Auth + Firestore + Cloud Functions; UI Minimals / MUI  
**Approach:** Cirúrgico no fluxo atual (não eliminar `status: 'accepted'` do modelo)

## Goals

1. Em `/dashboard/pos/online-orders`, o aceite do pedido novo envia direto à cozinha em **Em preparação** (sem etapa operacional “Aceito”).
2. Em `/dashboard/pos/kitchen`, o controle de som fica só ícone + tooltip (não botão `small` com texto).
3. Em `/p/:slug/checkout`, Endereço de Entrega para cliente autenticado segue o padrão visual/usabilidade de **Seus Dados** (resumo + modal para alterar/adicionar).

## Non-goals

- Remover `status: 'accepted'` do banco / migração em massa de pedidos legados.
- Aceite automático sem clique humano.
- Compactar Label de Demanda / Meta SLA no KDS.
- Redesenhar o card Seus Dados.
- Alterar regras de frete além de reagir ao endereço já aplicado nos campos do pedido.

---

## 1. Online orders — accept → preparing

### Behavior

- Single accept CTA on new/pending orders.
- On accept:
  - Existing sale creation / stock / NFC-e enqueue behavior of `acceptOnlineOrder` remains.
  - Order fields set atomically in the callable:
    - `status: 'accepted'` (compat for reject flows, history, analytics)
    - `fulfillmentStatus: 'preparing'`
    - `acceptedAt` and `preparingAt` set to the same ISO timestamp
    - `acceptedByUid` as today
- Reject flow unchanged (`rejected`).
- Operational UI must not offer moving a live order back to `fulfillmentStatus: 'accepted'`.

### UI (`online-order-list-view` and related)

- Remove operational tab/filter/metric centered on “Aceito” / `accepted` as a kitchen stage.
- Remove separate “Aceitar e preparar” path; default accept = prepare.
- Keep “Novos” / pending queue and reject actions.
- Optimistic UI after accept should reflect `preparing` (not stuck on `accepted`).

### Backend (`functions/online-orders.js`)

- Change `acceptOnlineOrder` so `fulfillmentStatus` is `'preparing'` (today: `'accepted'`).
- Client must not require a second `updateOnlineOrderStatus(..., 'preparing')` for the happy path.
- Table/QR path that already sets preparing on place remains as-is.

### Legacy

- Existing docs with `fulfillmentStatus: 'accepted'` may remain; KDS already maps `accepted` into the kitchen queue / promote-to-preparing behavior. No mandatory backfill in this slice.

### Error handling

- Accept failure: clear optimistic state; toast via `getFirebaseErrorMessage`.
- Partial client dual-call removed to avoid race where sale exists but fulfillment stays `accepted`.

---

## 2. Kitchen KDS — sound control

### Behavior

- Replace header `Button size="small"` labeled “Som ativo” / “Som mudo” with:
  - `IconButton` at **default** size (not `small`)
  - Icons: `solar:volume-loud-bold` / `solar:volume-cross-bold`
  - `Tooltip` + matching `aria-label` with the human-readable state
- Toggle still flips local `soundEnabled`; new-order beep logic unchanged.
- Demand Label and Meta SLA select stay as they are.

### Out of scope

- Other `size="small"` controls on KDS cards/actions.
- Persisting sound preference across sessions (keep session/local state as today unless already persisted).

---

## 3. Public checkout — delivery address UX

### When

- Only if `deliveryType === 'delivery'`.
- Table mode without delivery: section stays hidden.

### Authenticated customer with saved addresses

- Card header “Endereço de Entrega” aligned with **Seus Dados**.
- Summary block showing the selected address (street, number, neighborhood, city/UF; default/label when present).
- Action **Alterar** opens a modal:
  - List saved addresses → select applies to checkout fields and closes.
  - **Novo endereço** shows full form inside the modal (CEP lookup, street, number, complement, neighborhood, city, UF) using existing helpers/APIs.
  - Saving a new address persists via the existing customer address flow, selects it, closes modal.
- On checkout load: preselect default address (else single address / last used), apply to internal form state without showing the inline form.
- Empty list: summary empty state + CTA to open modal and add first address.
- Mobile: reuse existing fullScreen / profile-modal pattern when present.

### Guest / no saved addresses

- Keep **inline** address form on the card (current behavior). No mandatory modal.

### Data / validation

- Place order continues to read the same field state (cep, street, number, …).
- Delivery fee / area validation continues to run when the applied address changes.
- Required delivery fields must still block submit if no valid selected/filled address.

---

## Architecture sketch

```
OnlineOrders UI ──accept──► acceptOnlineOrder CF
                              ├─ create sale (existing)
                              ├─ status=accepted
                              └─ fulfillmentStatus=preparing ──► Kitchen KDS queue

Kitchen header: IconButton+Tooltip (sound) | Label demand | Meta SLA select

Checkout delivery:
  verified + addresses? → Summary card + AddressPickerModal
  else → inline form (current)
```

## Testing / acceptance

1. Pending online order → Accept once → appears in KDS as preparing; no operational “Aceito” step required.
2. Reject still works from pending.
3. KDS sound: icon-only control, tooltip on hover, beep on/off still works; demand/SLA unchanged.
4. Authenticated delivery checkout: default address shown as summary; Alterar lists/selects; Novo salva e seleciona.
5. Guest delivery checkout: inline form still works.
6. ESLint zero-warnings + `tsc --noEmit` on touched TS/TSX; deploy CF `acceptOnlineOrder` when backend changes.

## i18n

- New/changed UI strings for online-orders / kitchen tooltips / checkout address actions: add keys in `pt` / `en` / `es` under existing namespaces when the strings are user-facing and not already hardcoded consistently with neighboring copy. Prefer matching the local pattern already used on those screens (several public-checkout strings are currently inline PT).

## Files likely touched

- `functions/online-orders.js` — `acceptOnlineOrder` fulfillment
- `src/sections/pos/view/online-order-list-view.tsx` — accept CTA, tabs/metrics
- `src/locales/langs/{pt,en,es}/**` — if tab/button keys removed or renamed
- `src/sections/pos/kitchen/view/kitchen-kds-view.tsx` — sound IconButton
- `src/sections/public-store/view/public-checkout-view.tsx` — address summary + modal
- Possibly small helper/modal extract under `src/sections/public-store/` if the checkout file needs a focused component

## Open decisions (resolved)

| Topic | Decision |
|-------|----------|
| Accept UX | Single accept → preparing (keep `status: accepted` in DB) |
| Implementation style | Surgical (approach 1), not domain purge |
| KDS toolbar | Sound only → icon + tooltip; demand/SLA stay |
| Checkout address | Summary + modal for logged-in; inline for guest |

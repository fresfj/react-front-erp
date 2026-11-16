# Design: BrasilAPI CEP/CNPJ + Enterprise/Account Address (Slice B)

**Date:** 2026-11-16  
**Status:** Approved (user: approach 1, scope A)  
**Depends on:** Slice A PermissionGuard (done)

## 1. Goals

1. Mask CEP (`00000-000`) on every CEP field; on complete CEP call BrasilAPI v2 and autofill address.
2. Mask CNPJ; on complete CNPJ call BrasilAPI v1 and autofill company/address (supplier, customer when 14 digits, enterprise required).
3. Expand **enterprise** create/edit with CNPJ + full address + phone.
4. Expand **account** with birth date + full address (phone already exists).
5. Apply same CEP/CNPJ UX to **supplier** and **customer**.

## 2. Non-goals

- Firestore rules by MemberPermissionKey
- Ranking / DRE filters / AP-AR
- Proxy via Cloud Functions for BrasilAPI
- New mask library (`react-imask`)

## 3. Architecture

### 3.1 Shared utils

`src/utils/br-docs.ts`:

- `digitsOnly(value: string): string`
- `formatCep(digits: string): string` → `00000-000`
- `formatCnpj(digits: string): string` → `00.000.000/0000-00`
- `formatCpf(digits: string): string` → `000.000.000-00`
- `formatCpfCnpj(digits: string): string` — CPF if ≤11 else CNPJ
- Persist **digits only** on save (strip mask)

### 3.2 BrasilAPI client

`src/api/brasilapi/cep.ts` — `fetchCep(cep: string): Promise<BrasilCepResponse>`  
`src/api/brasilapi/cnpj.ts` — `fetchCnpj(cnpj: string): Promise<BrasilCnpjResponse>`

Base: `https://brasilapi.com.br`. Errors → throw; UI toasts via `getFirebaseErrorMessage`-style or plain message.

### 3.3 Hooks

`src/hooks/use-cep-lookup.ts` — when watch CEP has 8 digits, fetch once, call `onSuccess` with mapped fields; loading flag.  
`src/hooks/use-cnpj-lookup.ts` — when document has 14 digits, fetch; map razao/fantasia + address + phone.

### 3.4 Field mapping (English Firestore keys)

| BrasilAPI CEP | Form / Firestore |
|---------------|------------------|
| street | address |
| neighborhood | neighborhood |
| city | city |
| state | state |
| cep | zipCode (digits) |

| BrasilAPI CNPJ | Form |
|----------------|------|
| razao_social | name (enterprise/supplier) or trade as needed |
| nome_fantasia | optional secondary / ignore if no field |
| cep | zipCode |
| logradouro (+ tipo) | address |
| numero | addressNumber |
| bairro | neighborhood |
| municipio | city |
| uf | state |
| complemento | complement |
| ddd_telefone_1 | phone (digits) |
| cnpj | document |

### 3.5 Forms

**Supplier / Customer:** add neighborhood, city, state, complement if missing; wire CEP + document lookup; mask on change.

**Enterprise:** schema + UI Card sections Details + Address; CF `createEnterprise` / `updateEnterprise` accept new fields; `Enterprise` type + map.

**Account:** schema + UI: birthDate (ISO date string `YYYY-MM-DD`), zipCode, address, addressNumber, neighborhood, city, state, complement; persist via `setMember` / expand `MemberProfile`.

### 3.6 i18n

Labels in `pt|en|es` `common.json` for new fields and lookup toasts (`cep.notFound`, `cnpj.notFound`, etc.).

## 4. Acceptance

1. Type 8-digit CEP on supplier → street/city/state fill.  
2. Type valid CNPJ on supplier/enterprise → name + address fill.  
3. Create enterprise with CNPJ + address persists and reloads on edit.  
4. Account saves birthDate + address; reload shows values.  
5. Customer CPF (11) masks as CPF; 14 as CNPJ + optional CNPJ lookup.  
6. `vitest` for `br-docs` formatters; smoke forms manually.

## 5. Files (expected)

- `src/utils/br-docs.ts` + `.test.ts`
- `src/api/brasilapi/cep.ts`, `cnpj.ts`
- `src/hooks/use-cep-lookup.ts`, `use-cnpj-lookup.ts`
- Forms: supplier, customer, enterprise, account
- `src/api/firestore/platform.ts`, `members.ts`
- `functions/index.js` create/update enterprise
- locales pt/en/es

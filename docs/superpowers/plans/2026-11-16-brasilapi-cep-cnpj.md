# BrasilAPI CEP/CNPJ Implementation Plan

> **For agentic workers:** Execute task-by-task. Inline OK if subagents unavailable.

**Goal:** Shared BR masks + BrasilAPI CEP/CNPJ autofill on supplier, customer, enterprise, account.

**Spec:** `docs/superpowers/specs/2026-11-16-brasilapi-cep-cnpj-design.md`

## Global Constraints

- Persist digits-only for CEP/CNPJ/CPF/phone where applicable
- Firestore field names in English
- No new mask npm dependency
- Firebase auth method unchanged
- i18n pt/en/es for new labels

---

### Task 1: `br-docs` utils + tests
- Create `src/utils/br-docs.ts`, `src/utils/br-docs.test.ts`
- Commit

### Task 2: BrasilAPI clients + hooks
- Create `src/api/brasilapi/cep.ts`, `cnpj.ts`
- Create `src/hooks/use-cep-lookup.ts`, `use-cnpj-lookup.ts`
- Commit

### Task 3: Supplier + Customer forms
- Extend schemas/fields; wire masks + lookups
- Commit

### Task 4: Enterprise form + CF + platform types
- Expand Enterprise type, form, create/update CF
- Deploy CF if possible
- Commit

### Task 5: Account profile fields + MemberProfile
- birthDate + address block; i18n; handoff
- Commit + vitest br-docs

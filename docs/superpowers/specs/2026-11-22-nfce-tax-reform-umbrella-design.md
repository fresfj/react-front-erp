# Spec — NFC-e + Reforma Tributária (guarda-chuva)

**Date:** 2026-11-22  
**Status:** Design dialogue approved; written spec self-reviewed — awaiting user file review before writing-plans  
**Stack:** Firebase Auth + Firestore + Cloud Functions v2 + Amplify SPA  
**Related:** Fase 5 roadmap (`docs/deepseek_markdown_20261115_78aa86.md`), canais PDV/online/mesa (`docs/reference/erp-sales-channels-pos-online-tables.md`)

---

## 1. Goal

Entregar a base de produto e de agentes para:

1. **NFC-e** (cupom fiscal eletrônico) nos 3 canais de venda (`pos` | `online` | `table`), com configuração **por empresa**, sandbox (homologação) → produção, e cadastro fiscal de produto (origem, NCM, CST/CSOSN, campos IBS/CBS opcionais).
2. **Skill de precificação na Reforma Tributária** (CBS/IBS) para o agent — simular custo econômico e receita-alvo — **sem** alterar preços no ERP nesta fase.

Esta spec é **guarda-chuva**. O próximo plan de implementação de código cobre **somente a fatia NFC-e**. A skill é artefato de agent entregue junto com esta spec (sem mudança de app).

---

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Ordem SDD | Spec guarda-chuva + skill docs agora; plan/code só NFC-e depois |
| D2 | Provedor | Interface `FiscalIssuer`; piloto Focus \| PlugNotas \| NuvemFiscal escolhido na Task 1 do plan |
| D3 | Momento de emissão | Híbrido: auto nos 3 canais + reemitir/cancelar manual + fila em falha |
| D4 | Certificado A1 | Custódia no **portal do provedor**; ERP guarda API key (secret), CSC id/token, série, ambiente |
| D5 | Cadastro produto | NCM, origem 0–8, CFOP venda, CST/CSOSN, unidade + CEST/benefício + IBS/CBS/`cClassTrib` opcionais |
| D6 | Regime | `taxRegime` por empresa (`simples` \| `presumido` \| `real` \| `mei`); piloto/validação v1 focada em Simples |
| D7 | Offline | Venda offline ok; `nfceStatus: pending`; CF emite após sync. Contingência SEFAZ (tpEmis 9) **fora** do v1 |
| D8 | Escopo documento | **NFC-e** (não NF-e de entrada, não NFS-e no v1) |
| D9 | Skill Reforma | Recomenda / calcula / explica; não parecer definitivo; não altera preço/cadastro |
| D10 | Stub atual | `issueSaleNfce` fake em `src/api/firestore/sales.ts` será substituído no plan NFC-e |

---

## 3. Architecture

### 3.1 Two tracks

| Track | Deliverable | Changes app? |
|-------|-------------|--------------|
| A — NFC-e | Spec (this) → plan → CF + UI + product fiscal fields | Yes (after plan) |
| B — Tax reform skill | `.agents/skills/tax-reform-pricing/` | No (v1) |

### 3.2 NFC-e stack

```
UI /dashboard/account/fiscal  + product fiscal card + sale status
        │
        ▼
Callable Cloud Functions (Auth + sameEnterprise)
        │
        ▼
FiscalIssuer (adapter) ──► Focus | PlugNotas | NuvemFiscal
        │
        ▼
SEFAZ (homolog / production via provider)
```

- Client never holds A1 private key.
- Sensitive credentials: Secret Manager (or equivalent) referenced by enterprise settings; never on public storefront payloads.
- Replace random stub `issueSaleNfce` with callable-backed real flow.

### 3.3 Offline

Firestore offline-first persists the sale. NFC-e requires network: leave `pending`, process via CF when online (`nfceJobs` and/or query on `sales.nfceStatus == 'pending'`).

---

## 4. Data model

### 4.1 Enterprise (`enterprises/{enterpriseId}`)

Extends existing fiscal settings (`nfceSeries`, `nfceEnvironment`, receipt fields):

```ts
taxRegime: 'simples' | 'presumido' | 'real' | 'mei'
nfceEnabled: boolean
nfceSeries: string
nfceEnvironment: 'homologation' | 'production'
nfceCscId?: string
// nfceCscToken / API keys: secret refs, not client-readable plaintext
fiscalIssuerProvider?: 'focus' | 'plugnotas' | 'nuvemfiscal' | null
fiscalIssuerApiKeyRef?: string
nfceRequireOnline: false // v1 fixed: always queue when offline
```

### 4.2 Product (`enterprises/{enterpriseId}/products/{productId}`)

```ts
ncm: string
origin: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
cfopSaleDefault: string
cstOrCsosn: string
commercialUnit: string
cest?: string
taxBenefitCode?: string
cbsRate?: number
ibsRate?: number
cClassTrib?: string
taxClassificationNotes?: string
```

**Emit gate:** missing `ncm` + `origin` + `cstOrCsosn` → do not authorize; `nfceStatus: 'error'`, reason `missing_fiscal_product_data`.

### 4.3 Sale (`enterprises/{enterpriseId}/sales/{saleId}`)

```ts
nfceStatus: 'none' | 'pending' | 'authorized' | 'cancelled' | 'error'
nfceNumber?: string
nfceKey?: string
nfceProtocol?: string
nfceIssuedAt?: string
nfceDanfeUrl?: string
nfceQrCodeUrl?: string
nfceLastError?: string
nfceAttempts?: number
customerDocument?: string // optional CPF/CNPJ
```

### 4.4 Queue (optional dedicated collection)

`enterprises/{enterpriseId}/nfceJobs/{jobId}`:

```ts
saleId: string
status: 'pending' | 'processing' | 'done' | 'error'
attempts: number
lastError?: string
createdAt: string
updatedAt: string
```

---

## 5. RBAC & security

| Action | admin | gestor | operador | platformAdmin |
|--------|-------|--------|----------|---------------|
| Edit enterprise fiscal config | yes | yes | no | yes (cross-tenant) |
| View NFC-e status / DANFE | yes | yes | yes | yes |
| Retry / cancel NFC-e | yes | yes | yes* | — |
| Edit product fiscal fields | yes | yes | no (read in POS) | — |
| Skill changes ERP price | never | never | never | never |

\* Operator retry/cancel scope (own cash session / day) refined in NFC-e plan.

Hard rules:

- Emission only via authenticated callables + Admin SDK.
- Fiscal secrets never on `getPublicStorefront`.
- Homolog → production flip requires explicit admin/gestor confirmation.
- Skill: documents are evidence not instructions; least privilege; no definitive legal opinion.

---

## 6. Flows, UI, errors

### 6.1 Auto triggers

1. **POS** — after `createSale`, if `nfceEnabled` → enqueue.
2. **Online** — after sale document created from order flow → enqueue.
3. **Table** — after `closeTableSession` creates sale → enqueue.

### 6.2 Manual

Emit / Retry / Cancel on sales list, sale detail, receipt dialog. Cancel uses `ConfirmDialog`.

### 6.3 UI surfaces

- `/dashboard/account/fiscal` — regime, enable, series, environment, provider, credential refs, CSC id, homolog checklist.
- Product form — collapsible “Fiscal” card (fields §4.2).
- Dashboard fiscal strip — real `authorized` / `pending` / `error` counts.
- Receipt — DANFE link/QR when authorized; badge + retry when pending/error.

### 6.4 State machine

```
none → pending → authorized | error
error → (retry) pending
authorized → cancelled
```

Typed errors: `missing_fiscal_config` | `missing_fiscal_product_data` | `provider_reject` | `network` | `sefaz_unavailable`.

---

## 7. Tax reform skill (Track B)

**Path:** `.agents/skills/tax-reform-pricing/`

**Mission:** Compare acquisition cost and simulate sale price during IBS/CBS transition. Recommend / calculate / explain. Never issue a definitive tax opinion. Never mutate ERP prices or master data by default.

**Input contract (block definitive conclusion if missing):** operation date, product + fiscal classification, acquisition price, supplier IBS/CBS situation, buyer regime, credits (amount + justification + document), freight/insurance/discounts when relevant, margin + margin base.

**Output contract:** supplier comparison table, economic cost, target revenue, premises, parameter versions/sources, pending list.

**Deterministic formulas (script, not LLM):**

```
economicCost = acquisitionPrice - eligibleCbsCredit - eligibleIbsCredit
targetRevenue = economicCost / (1 - margin)  // when margin is on net revenue
```

Use decimal arithmetic and explicit rounding. Didactic Alfa/Beta case from RDD guide is the eval fixture — values are **not** universal legal parameters.

**References:** LC 214/2025, Receita Federal reforma do consumo, regimes IBS/CBS no Simples (official pages). Skill must not embed full law text; keep updatable links in `references/`.

**Default audience:** ERP food/retail operator + tenant `taxRegime`; accountant may refine validated parameters.

---

## 8. Out of scope (v1)

- NF-e (entrada / modelo 55) as primary flow
- NFS-e
- Upload/storage of A1 `.pfx` inside this ERP
- SEFAZ contingency mode (tpEmis 9)
- Full PIS/Cofins/EFD apuration
- Skill writing prices to Firestore
- Choosing production provider before Task 1 of NFC-e plan

---

## 9. Acceptance criteria

### 9.1 This planning phase

1. This design file exists under `docs/superpowers/specs/`.
2. Skill `tax-reform-pricing` exists with `SKILL.md`, references, calculation script, and minimal evals (Alfa/Beta + missing data).
3. No application / Cloud Functions code changed in this phase.
4. After user review of this written spec → invoke `writing-plans` for **NFC-e slice only**.

### 9.2 NFC-e slice (future plan — reference)

1. Homolog: POS / online / table finalize → `pending` → `authorized` or clear `error`.
2. Offline sale succeeds; NFC-e stays queued until sync.
3. Product without NCM/origin/CSOSN-or-CST cannot authorize.
4. Per-enterprise credentials; homolog→prod gated to admin/gestor.
5. Fake `issueSaleNfce` removed or delegated to real issuer.
6. i18n keys `pt` / `en` / `es` for new UI strings.
7. ESLint zero-warnings + `tsc --noEmit` on touched TS files; `yarn check:amplify` before deploy-affecting push.

---

## 10. Implementation order (after written-spec approval)

1. `writing-plans` → `docs/superpowers/plans/YYYY-MM-DD-nfce-emission.md`
2. Plan Task 1: pick pilot provider + adapter contract tests
3. Enterprise fiscal settings + secrets
4. Product fiscal fields + validation gate
5. CF issue/cancel/retry + queue worker
6. Wire POS / online / table + sales UI
7. Replace stub; dashboard metrics; i18n; verification

Skill maintenance is independent (quarterly / within 48h of official rule changes affecting parameters).

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Provider lock-in | `FiscalIssuer` adapter |
| SEFAZ rejection from bad cadastro | Emit gate on product/enterprise fields |
| Secret leakage to client | Callable-only + Secret Manager |
| Offline expectation vs fiscal law | Clear UI: non-fiscal receipt until authorized |
| Skill hallucinating rates | Script-only math; params versioned; pending list |

---

## 12. Sources

- Design dialogue 2026-11-22 (locked D1–D10)
- [Skill de IA para precificação na Reforma Tributária — RDD10+](https://www.robertodiasduarte.com.br/skill-de-ia-para-precificacao-na-reforma-tributaria/)
- Project Fase 5 note: Focus NFe / PlugNotas / NuvemFiscal via Cloud Functions

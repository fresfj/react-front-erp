# Decision — NFC-e: Focus (default) vs SEFAZ direto

**Date:** 2026-11-23  
**Status:** Design dialogue approved — awaiting written-spec user review  
**Related:** `docs/superpowers/specs/2026-11-22-nfce-tax-reform-umbrella-design.md`, `docs/superpowers/plans/2026-11-22-nfce-emission.md`  
**Code in this phase:** none (decision only; plan only if user elects implementation)

---

## 1. Goal

Responder: *é obrigatório pagar um terceiro (Focus etc.)?* e *como seria falar direto com a SEFAZ?* — com arquitetura, riscos e estimativas, **sem** implementar ainda.

---

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Artefato agora | Spec de decisão; **plan de código só se** o usuário pedir implementação depois |
| D2 | Perfil | Estimativas **separadas**: (A) SaaS multi-tenant e (C) 1 empresa no curto prazo |
| D3 | UF no direto | Piloto **1 UF** + adapter com mapa multi-UF (`enterprise.state` / config) |
| D4 | Abordagem | **Focus default** + provider opcional `sefaz-direct` (não desligar Focus no curto prazo) |
| D5 | Cert A1 (só direto) | Secret Manager / `enterprises/{id}/secrets/fiscalCert`; client never reads |
| D6 | Fora | NFS-e, NF-e 55, contingência offline completa no v1 direto |

---

## 3. Answer in one page

**Não** é obrigatório pagar Focus (ou PlugNotas/NuvemFiscal). A SEFAZ aceita NFC-e enviada pelo próprio contribuinte (ou por sistema próprio) com certificado ICP-Brasil.

**Focus (e similares)** vendem: montagem/assinatura XML, canal SEFAZ, DANFE, atualização de schema/NT. O ERP já usa isso via `FiscalIssuer` + piloto Focus.

**Direto SEFAZ** = o ERP (Cloud Functions) gera XML modelo 65, assina com A1, chama WebService da UF, trata retorno. Sem fee de API de terceiros; com custo de engenharia, custody de certificado e manutenção normativa.

**Este produto (SaaS):** não fica “preso” a um plano Focus no código — o adapter permite outro provider. Operacionalmente, enquanto só Focus estiver pronto, esse é o caminho de emissão real.

---

## 4. Architecture (chosen: hybrid)

```
sale finalize → CF issueSaleNfce
                    │
                    ├─ fiscalIssuerProvider = 'focus'         → Focus REST (já implementado)
                    └─ fiscalIssuerProvider = 'sefaz-direct'  → XML + A1 + WS UF (futuro)
```

| Concern | Focus | `sefaz-direct` |
|---------|-------|----------------|
| Credentials | API token + CSC (secrets) | A1 `.pfx` + senha + CSC (secrets) |
| Where cert lives | Provider portal | Our Secret Manager / Firestore secrets (deny client) |
| UF endpoints | Hidden by Focus | Table `uf → homolog/prod URL` in adapter |
| Default for new tenants | `focus` | Opt-in when ready |

Reuse unchanged: emit gates (`nfce-domain`), product fiscal fields, enqueue POS/online/table, sale `nfceStatus` machine.

---

## 5. Costs & risks (order of magnitude)

| | Focus | SEFAZ direct |
|--|-------|--------------|
| API fee | Monthly / per note | R$ 0 API |
| Certificate | At provider | Buy/renew A1 yearly |
| Engineering | Low (done) | High (build + ongoing NTs) |
| Multi-tenant A1 custody | Lower | **High** |
| Go-live time | On current path | +weeks to months |

**When to stay on Focus:** SaaS early stage, many UFs, want speed and less fiscal ops.  
**When to add `sefaz-direct`:** fee/volume justifies, or a controlled tenant (scenario C) needs zero third-party API, or enterprise requires in-house emission.

**Do not** turn off Focus until direct is stable in homologation for the pilot UF.

---

## 6. Effort estimates (not an implementation plan)

### Scenario C — 1 company, 1 pilot UF

| Block | Approx tasks | Effort |
|-------|--------------|--------|
| Cert upload + CF secrets | 2–3 | 2–4 days |
| NFC-e XML + A1 signature | 3–4 | 1–2 weeks |
| UF WS client (homolog) | 2–3 | 3–5 days |
| Cancel + error mapping | 1–2 | 2–3 days |
| UI provider + cert upload | 1–2 | 2–3 days |
| Homolog tests | 1 | 2–4 days |
| **Total C** | ~10–14 | **~3–5 weeks** |

### Scenario A — SaaS multi-tenant

Everything in C, plus:

| Block | Extra |
|-------|--------|
| Per-`enterpriseId` cert isolation + audit | +3–5 days |
| Self-serve onboarding (upload, expiry) | +~1 week |
| Multi-UF beyond pilot | +1–2 weeks per UF batch |
| Compliance / access to certs | Ongoing |
| **Total A (1 UF pilot)** | **~6–10 weeks** |
| **Total A (many UFs)** | **+ months** |

---

## 7. Recommended roadmap

1. **Now:** Finish Focus homolog → production for tenants that pay the provider (current plan path).
2. **Later:** If justified, run `writing-plans` for slice `nfce-sefaz-direct` (provider parallel to Focus).
3. **Never as default day-1 for all SaaS tenants:** force SEFAZ-direct without Focus fallback.

---

## 8. Acceptance (this decision phase)

1. This file exists under `docs/superpowers/specs/`.
2. No app/Functions code changed for this decision.
3. User reviews the file and chooses next step:
   - **Stay Focus-only** (no plan) — operate current NFC-e slice
   - **Implement hybrid** — invoke `writing-plans` for `sefaz-direct` (scenario C or A scope stated)
4. Plan is **not** auto-created by this doc.

---

## 9. Out of scope

- Choosing commercial Focus pricing tiers
- Implementing A1 upload UI in this phase
- Contingency tpEmis 9, NF-e 55, NFS-e
- Changing tax-reform-pricing skill

---

## 10. Sources

- Design dialogue 2026-11-23 (D1–D6)
- Existing Focus adapter: `functions/fiscal/fiscal-issuer.js`, `functions/fiscal/focus-client.js`
- Umbrella NFC-e: `docs/superpowers/specs/2026-11-22-nfce-tax-reform-umbrella-design.md`
- Focus docs (reference for current path): https://doc.focusnfe.com.br/
- SEFAZ NFC-e is UF-specific (WebServices + schemas + NTs) — confirm official UF portal for the pilot state before any implementation plan

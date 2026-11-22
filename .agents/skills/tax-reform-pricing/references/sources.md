# Official & didactic sources (Reforma Tributária — pricing skill)

**Rule:** Prefer live official pages over any copied law text. Didactic numbers in evals are **not** universal legal parameters. Verify before operational use.

## Normative / official

| Topic | Where to check |
|-------|----------------|
| IBS / CBS rules | Lei Complementar nº 214/2025 (texto vigente — Senado / Planalto) |
| Consumo reform overview & timeline | Receita Federal — Reforma Tributária do Consumo |
| Simples + IBS/CBS | Ministério da Fazenda — regimes de IBS e CBS no Simples Nacional |
| Arts often cited in didactic material | LC 214/2025 art. 41 § 3º, art. 47 — **re-read current wording** before parametrizing |

## Didactic (non-binding)

| Topic | Source |
|-------|--------|
| Skill design for pricing (process, contracts, Alfa/Beta) | https://www.robertodiasduarte.com.br/skill-de-ia-para-precificacao-na-reforma-tributaria/ |
| Snapshot note in that guide | Material dated ~2026-10-30; treat as teaching aid only |

## Project specs

| Topic | Path |
|-------|------|
| Umbrella NFC-e + reform | `docs/superpowers/specs/2026-11-22-nfce-tax-reform-umbrella-design.md` |
| Sales channels (when fiscal attaches to sale) | `docs/reference/erp-sales-channels-pos-online-tables.md` |

## Transition timeline (teaching placeholder — verify officially)

Published didactic material often cites: 2026 test phase (example rates CBS 0.9% / IBS 0.1%), CBS advance 2027, gradual IBS 2029–2032, completion ~2033. **Do not hardcode these into calculations** until confirmed in a versioned `parameters` file reviewed by a responsible human.

## Parameter file policy

When adding `parameters/*.json`:

- Include: `version`, `effectiveFrom`, `sourceUrl`, `validatedBy`, `notes`
- Script must refuse to run “operational” mode without `version` + `validatedBy`
- Demo mode may use eval fixtures only

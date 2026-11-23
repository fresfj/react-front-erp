# NFC-e no ERP Minimals — como usar

Guia operacional para emitir **NFC-e (modelo 65)** no cupom/pedido do ERP, sem depender de plano de emissor terceirizado (caminho **SEFAZ direto**), e alternativas de teste.

**Idioma padrão da UI:** Português (Brasil).  
**Stack:** Firebase Auth + Firestore + Cloud Functions. Segredos fiscais **nunca** no client.

---

## 1. O que o sistema faz

1. Na finalização da venda (PDV / pedido online / mesa), se `nfceEnabled` estiver ligado, a Cloud Function tenta emitir a NFC-e.
2. Em sucesso: a venda recebe `nfceStatus: authorized`, chave, protocolo, número (e URLs quando o provedor devolver).
3. Em falha temporária: pode ficar `pending` / `error` para retry (callable + job a cada 15 min).
4. Provedores:
   - **`focus`** — padrão legado (API token Focus).
   - **`sefaz-direct`** — XML + assinatura A1 + WebService SEFAZ (piloto **PA**, **PR**).
   - **`mock`** — só via env nas Functions (`NFCE_ISSUER=mock`), para testar fluxo **sem** SEFAZ.

---

## 2. Pré-requisitos (emissão real / homolog SEFAZ)

| Item | Obrigatório? | Onde obter |
|------|--------------|------------|
| Empresa com CNPJ + IE ativa | Sim | Contador / SEFAZ da UF |
| UF da empresa = **PA** ou **PR** (mapa atual) | Sim (SEFAZ-direct) | Cadastro da empresa no ERP |
| Certificado **A1** e-CNPJ (`.pfx` + senha) | Sim | AC ICP-Brasil (Serasa, Certisign, Soluti, …) |
| **CSC** homolog (Id + token) | Sim (homolog) | Portal SEFAZ da UF |
| Produtos com NCM, origem, CST/CSOSN | Sim | Cadastro de produto → card Fiscal |
| Regime tributário + série NFC-e | Sim | Conta → Fiscal |
| Deploy das Cloud Functions + rules | Sim | `firebase deploy --only functions,firestore:rules` |

### Homologação vs produção

- **Homologação:** notas **sem** validade jurídica; ainda exige **A1 + CSC de homolog**.
- **Produção:** CSC de produção + (conforme UF) credenciamento do sistema/emissor.

Não existe CSC/A1 “público” aceito pela SEFAZ. Credenciais oficiais são **por CNPJ**.

---

## 3. Configurar no ERP (SEFAZ direto)

1. Faça login como **admin**, **gestor** ou **platformAdmin**.
2. Abra **Conta → Fiscal**.
3. Preencha:
   - Regime tributário
   - Provedor: **SEFAZ direto**
   - Série NFC-e (ex.: `1`)
   - Ambiente: **Homologação** (primeiro)
   - CSC ID + CSC Token
4. Em **Certificado A1 (.pfx)**: escolha o arquivo + senha → Salvar  
   (upload vai para `uploadEnterpriseFiscalCert`; o browser **não** lê o segredo depois).
5. Ligue **Emitir NFC-e automaticamente**.
6. Confirme que a empresa tem **UF = PA ou PR** e endereço/CNPJ/IE preenchidos.
7. Em cada produto vendável: NCM, origem, CST/CSOSN (e demais campos fiscais se o regime exigir).

### Focus (opcional)

Se o provedor for Focus: informe **API token** + CSC (conforme conta Focus). Não usa upload de A1 no ERP.

---

## 4. Fluxo do dia a dia

1. Abra o **caixa** (regra de negócio do PDV).
2. Faça a venda / feche o pedido.
3. Se NFC-e estiver habilitada, a emissão roda na Function:
   - Sucesso → venda `authorized` (chave/protocolo gravados).
   - Falha → `error` com mensagem (ex.: rejeição SEFAZ) ou `pending` para retry.
4. Reemitir: histórico de vendas / ação de retry NFC-e (quando disponível na UI) ou callable `retryPendingNfce`.
5. Cancelar NFC-e:
   - **Focus:** suportado via callable.
   - **SEFAZ-direct:** ainda **não** implementado na v1 (use portal SEFAZ ou Focus).

---

## 5. Como testar **sem** A1/CSC (só funcionalidade do app)

### Opção A — Mock nas Cloud Functions (recomendado para smoke interno)

O mock é **só no backend** (`functions/`). Colocar `NFCE_ISSUER` no `.env` da raiz Vite **não** tem efeito.

#### Passo a passo

1. Crie `functions/.env` (já há `functions/.env.example`):

```bash
cp functions/.env.example functions/.env
# conteúdo: NFCE_ISSUER=mock
```

2. Redeploy **somente** as Functions NFC-e (quando houver cota CPU no projeto):

```bash
cd /Users/franciscofreitasjr/Project/Development/reactjs/minimals
firebase deploy --only \
  functions:issueSaleNfce,functions:enqueueSaleNfce,functions:cancelSaleNfce,functions:retryPendingNfce,functions:processPendingNfceBatch,functions:saveEnterpriseFiscalSecrets,functions:uploadEnterpriseFiscalCert
```

   Ou emulador local (sem depender da cota Cloud Run):

```bash
cd functions && npm install
cd .. && firebase emulators:start --only functions,firestore
# Aponte o app para o emulador (connectFunctionsEmulator) se já estiver configurado
```

3. No ERP (mesmo com mock):
   - Conta → Fiscal → ligue **Emitir NFC-e automaticamente**
   - Preencha regime + série + ambiente (homologação)
   - Provedor pode ficar Focus ou SEFAZ direto (o mock **ignora** o provedor)
   - **Não** precisa de A1/CSC/token com `NFCE_ISSUER=mock`
   - Em **pelo menos um produto** da venda: NCM, origem, CST/CSOSN (o gate de domínio ainda exige)

4. Abra caixa → faça 1 venda no PDV → confira na venda: `nfceStatus = authorized` e chave/protocolo fictícios.

5. **Desligar mock** (obrigatório antes de homolog SEFAZ de verdade):

```bash
# Apague ou comente a linha em functions/.env
# NFCE_ISSUER=mock
firebase deploy --only functions:issueSaleNfce,...
```

Comportamento com mock:

- Não chama SEFAZ nem Focus.
- Retorna chave/protocolo fictícios e grava `authorized`.
- Cancel também é fictício (ok para teste de UI).

⚠️ Se o deploy de `issueSaleNfce` falhou por **quota CPU** (Cloud Run), o mock no `.env` só passa a valer depois que essa function subir com sucesso.

### Opção B — Homolog SEFAZ de verdade

1. Comprar A1 da **sua** empresa.
2. Gerar CSC **Homologação** no portal:
   - **PR:** Receita/PR → DF-e → NFC-e → CSC → Controle → Homologação  
     https://sped.fazenda.pr.gov.br/NFCe/Pagina/Codigo-de-Seguranca-do-Contribuinte-CSC
   - **PA:** Portal SEFA/PA → Gerenciar CSC → Homologação  
     (manual SEFA/PA “Gerenciar CSC”)
3. Configurar no ERP (seção 3) e emitir 1 venda teste.

---

## 6. Por que **não** colocamos A1 nem CSC no Git

| Material | Pode ir no Git? | Motivo |
|----------|-----------------|--------|
| A1 `.pfx` / senha real | **Não** | Segredo do CNPJ; vazamento = emissão fraudulenta |
| CSC id/token (homolog ou prod) | **Não** | Segredo SEFAZ por contribuinte |
| Token Focus | **Não** | Segredo de API |
| Fixture **autoassinada** só para unit test de parse PFX | Só se gerada localmente / CI via env `NFCE_TEST_PFX_B64` — **não** commitada com CSC | Não autoriza nada na SEFAZ |

Regras do projeto:

- Segredos em `enterprises/{enterpriseId}/secrets/fiscal` (Admin SDK / callables).
- Client: `allow read, write: if false` em `secrets/**`.
- `.env` / Amplify console para `VITE_FIREBASE_*` — nunca A1/CSC no repositório.

Se alguém pedir “CSC público no repo”: **recusar**. Use mock (seção 5) ou credenciais reais da empresa piloto no Firebase (console / upload pela UI).

---

## 7. Checklist rápido (piloto PA / PR)

- [ ] Functions + `firestore.rules` deployados
- [ ] Conta → Fiscal → SEFAZ direto + homologação
- [ ] A1 enviado; `a1ExpiresAt` / thumbprint visíveis
- [ ] CSC homolog preenchido
- [ ] Empresa UF = PA ou PR
- [ ] Produto com NCM / origem / CST-CSOSN
- [ ] Venda teste → `authorized` ou rejeição SEFAZ legível
- [ ] `NFCE_ISSUER` **não** é `mock` em produção

---

## 8. Problemas comuns

| Sintoma | Causa provável |
|---------|----------------|
| `missing_fiscal_config` | Sem A1/CSC/token ou provider errado |
| `uf_not_supported` | UF da empresa fora do mapa (hoje só PA, PR) |
| `cert_expired` | A1 vencido — reenviar `.pfx` |
| `provider_reject` | SEFAZ rejeitou (XML, IE, NCM, CSC, ambiente) |
| `provider_not_implemented` no cancel | Cancel SEFAZ-direct ainda não existe |
| Client não lê certificado | Esperado — secrets só via Function |

---

## 9. Referências no repo

- Handoff: `docs/agents/antigravity-erp-handoff.md` (seção NFC-e)
- Plano Focus: `docs/superpowers/plans/2026-11-22-nfce-emission.md`
- Plano SEFAZ-direct: `docs/superpowers/plans/2026-11-23-nfce-sefaz-direct-saas.md`
- UF map: `functions/fiscal/uf-endpoints.js`
- UI: `src/sections/account/account-fiscal-form.tsx`
- API client: `src/api/firestore/nfce.ts`
